import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { ROLES_CAJA, idValido, txt } from '../utils/comunes.js';
import { enviarCorreo } from '../servicios/correo.js';
import { emitirYEnviarComprobante } from '../servicios/comprobante-digital.js';

// HU-006 · Verificación de pagos con Yape (Recepcionista y Administrador).
// Requiere supabase/10-yape-manual.sql
const router = Router();

router.use(requiereSesion(ROLES_CAJA));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const ESTADOS = ['En verificación', 'Confirmado', 'Rechazado'];
const faltaSql = (error) => ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code);
const noDisponible = (res) => {
  console.error('Falta ejecutar supabase/10-yape-manual.sql');
  return fallo(res, 503, 'La verificación de pagos con Yape aún no está disponible.');
};

const escaparHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// GET /api/yape/solicitudes?estado=En verificación|Confirmado|Rechazado
router.get('/solicitudes', async (req, res, next) => {
  try {
    const estado = req.query.estado ? String(req.query.estado) : 'En verificación';
    if (!ESTADOS.includes(estado)) return fallo(res, 400, 'El estado no es válido.');

    const { data, error } = await supabase.rpc('listar_solicitudes_yape', { p_estado: estado, p_limit: 100 });
    if (error) { if (faltaSql(error)) return noDisponible(res); throw error; }

    const lista = (data || []).map((s) => ({ ...s, monto: Number(s.monto), saldo_a_usar: Number(s.saldo_a_usar), total: Number(s.total) }));
    // En verificación: la más antigua primero (cola). Historial: la más reciente primero.
    if (estado !== 'En verificación') lista.reverse();
    res.json(lista);
  } catch (e) { next(e); }
});

// POST /api/yape/solicitudes/:id/confirmar  -> registra el pago, emite la boleta y la envía por correo
router.post('/solicitudes/:id/confirmar', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La solicitud no es válida.');

    const { data, error } = await supabase.rpc('confirmar_pago_yape', {
      p_solicitud_id: id,
      p_revisado_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('SOLICITUD_NO_ENCONTRADA')) return fallo(res, 404, 'La solicitud no existe.');
      if (m.includes('SOLICITUD_YA_REVISADA')) return fallo(res, 409, 'Esta solicitud ya fue revisada.');
      if (m.includes('RESERVA_NO_PENDIENTE') || error.code === '23505') {
        return fallo(res, 409, 'La reserva ya no está pendiente (¿se pagó por otro medio o se canceló?). Rechaza esta solicitud y devuelve el Yape.');
      }
      if (m.includes('SALDO_INSUFICIENTE')) {
        return fallo(res, 409, 'El saldo a favor del cliente cambió y ya no alcanza. Rechaza la solicitud para que el cliente vuelva a enviarla.');
      }
      if (m.includes('MONTO_NO_COINCIDE')) return fallo(res, 409, 'El importe de la reserva cambió. Rechaza la solicitud.');
      if (faltaSql(error)) return noDisponible(res);
      throw error;
    }

    // HU-007: boleta automática a nombre del titular, enviada por correo con el PDF
    const comprobante = await emitirYEnviarComprobante(data.reserva_id, req.usuario.id);

    res.json({
      mensaje: comprobante
        ? 'Pago confirmado. La boleta se emitió y se envió al correo del cliente.'
        : 'Pago confirmado. No se pudo emitir la boleta automáticamente: emítela desde Cobros.',
      reserva_id: data.reserva_id,
      comprobante_id: comprobante?.id ?? null,
    });
  } catch (e) { next(e); }
});

// POST /api/yape/solicitudes/:id/rechazar   { motivo }
router.post('/solicitudes/:id/rechazar', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La solicitud no es válida.');

    const motivo = txt(req.body?.motivo);
    if (motivo.length < 5 || motivo.length > 300) {
      return fallo(res, 400, 'Escribe el motivo del rechazo (entre 5 y 300 caracteres).');
    }

    const { data, error } = await supabase.rpc('rechazar_pago_yape', {
      p_solicitud_id: id,
      p_revisado_por: req.usuario.id,
      p_motivo: motivo,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('SOLICITUD_NO_ENCONTRADA')) return fallo(res, 404, 'La solicitud no existe.');
      if (m.includes('SOLICITUD_YA_REVISADA')) return fallo(res, 409, 'Esta solicitud ya fue revisada.');
      if (faltaSql(error)) return noDisponible(res);
      throw error;
    }

    // Avisar al cliente (en segundo plano: el rechazo ya quedó registrado)
    avisarRechazo(data.reserva_id, motivo);

    res.json({ mensaje: 'Solicitud rechazada. Avisamos al cliente por correo.', reserva_id: data.reserva_id });
  } catch (e) { next(e); }
});

async function avisarRechazo(reservaId, motivo) {
  try {
    const { data } = await supabase
      .from('reservas')
      .select('id, clientes(nombres, correo)')
      .eq('id', reservaId)
      .maybeSingle();
    const correo = data?.clientes?.correo;
    if (!correo) return;

    const codigo = 'VP-' + String(reservaId).padStart(6, '0');
    await enviarCorreo({
      destinatario: correo,
      asunto: `No pudimos confirmar tu pago por Yape - Reserva ${codigo}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#243247;max-width:600px;margin:auto">
          <h2 style="color:#0A2540">No pudimos confirmar tu pago</h2>
          <p>Hola ${escaparHtml(data.clientes.nombres || '')}, revisamos el pago por Yape de tu reserva <strong>${codigo}</strong> y no pudimos confirmarlo.</p>
          <p><strong>Motivo:</strong> ${escaparHtml(motivo)}</p>
          <p>Tu reserva sigue pendiente de pago. Puedes volver a enviar el número de operación correcto o pagar con tarjeta desde "Mis reservas".</p>
          <p>Si ya yapeaste y crees que es un error, responde a este correo.</p>
        </div>
      `,
    });
  } catch (e) {
    console.error(`Reserva ${reservaId}: no se pudo avisar el rechazo del Yape:`, e.message || e);
  }
}

export default router;
