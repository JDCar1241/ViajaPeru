import { supabase } from '../config/supabase.js';
import { enviarCorreo } from './correo.js';
import { generarPdf, numeroCompleto } from './comprobante.pdf.js';

// HU-007 · Enviar comprobante digital.
// - Pago en línea (tarjeta, Yape por Culqi o saldo): se emite la BOLETA automáticamente a nombre
//   del titular y se envía por correo con el PDF adjunto.
// - Cobro presencial: el personal elige boleta o factura; al emitirla también se envía por correo.
// Nada de esto debe hacer fallar el pago: los errores se registran y el comprobante se puede
// ver/descargar igual desde el portal.

const escaparHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TIPOS_DOC = { DNI: 'DNI', CE: 'CE', PASAPORTE: 'Pasaporte' };

async function datosReserva(reservaId) {
  const { data, error } = await supabase
    .from('reservas')
    .select('id, clientes(tipo_documento, dni, nombres, apellidos, correo)')
    .eq('id', reservaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Emite la boleta a nombre del titular. Si ya existe un comprobante, devuelve ese.
export async function emitirBoletaAutomatica(reservaId, emitidoPor = null) {
  const r = await datosReserva(reservaId);
  if (!r) throw new Error(`Reserva ${reservaId} no encontrada`);

  const c = r.clientes || {};
  const comprador = c.dni
    ? {
        tipo_documento: TIPOS_DOC[String(c.tipo_documento || 'DNI').toUpperCase()] || 'DNI',
        numero_documento: String(c.dni).toUpperCase(),
        nombre: [c.nombres, c.apellidos].filter(Boolean).join(' ').trim() || null,
      }
    : null;

  const { data, error } = await supabase.rpc('emitir_comprobante', {
    p_reserva_id: reservaId,
    p_tipo: 'Boleta',
    p_comprador: comprador,
    p_emitido_por: emitidoPor,
  });

  if (error) {
    if ((error.message || '').includes('COMPROBANTE_YA_EMITIDO') || error.code === '23505') {
      const { data: existente } = await supabase.rpc('comprobante_de_reserva', { p_reserva_id: reservaId });
      return existente;
    }
    throw error;
  }
  return data;
}

// Envía por correo el comprobante (PDF adjunto) al correo del titular de la reserva.
export async function enviarComprobantePorCorreo(comprobanteId, destinatario = null) {
  const { data: comp, error } = await supabase.rpc('obtener_comprobante', { p_id: comprobanteId });
  if (error) throw error;
  if (!comp) throw new Error(`Comprobante ${comprobanteId} no encontrado`);

  let correo = destinatario;
  if (!correo) {
    const r = await datosReserva(comp.reserva_id);
    correo = r?.clientes?.correo;
  }
  if (!correo) {
    console.warn(`Comprobante ${comprobanteId}: la reserva no tiene correo, no se envió.`);
    return { enviado: false };
  }

  const numero = numeroCompleto(comp);
  const d = comp.detalle || {};
  const pdf = await generarPdf(comp);
  const total = Number(comp.total).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  const fechaViaje = d.fecha_inicio_viaje
    ? new Date(d.fecha_inicio_viaje).toLocaleString('es-PE', {
        dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima',
      })
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;color:#243247;max-width:600px;margin:auto">
      <h2 style="color:#0A2540">Tu ${escaparHtml(comp.tipo.toLowerCase())} electrónica</h2>
      <p>Gracias por tu compra en ViajaPerú. Adjuntamos tu comprobante en PDF.</p>
      <p><strong>Comprobante:</strong> ${escaparHtml(comp.tipo)} ${escaparHtml(numero)}</p>
      <p><strong>Reserva:</strong> ${escaparHtml(d.codigo || '')}</p>
      <p><strong>Paquete:</strong> ${escaparHtml(d.paquete || '')}</p>
      ${fechaViaje ? `<p><strong>Fecha de viaje:</strong> ${escaparHtml(fechaViaje)}</p>` : ''}
      <p><strong>Total pagado:</strong> ${escaparHtml(total)}</p>
      <p>También puedes verlo en cualquier momento desde "Mis reservas".</p>
      <p>¡Buen viaje!</p>
    </div>
  `;

  await enviarCorreo({
    destinatario: correo,
    asunto: `${comp.tipo} ${numero} - ViajaPerú`,
    html,
    adjuntos: [{ nombre: `${numero}.pdf`, contenido: pdf }],
  });
  return { enviado: true };
}

// Envía en segundo plano (no hace esperar la respuesta al usuario). Nunca lanza errores.
export function enviarEnSegundoPlano(comprobanteId, destinatario = null) {
  enviarComprobantePorCorreo(comprobanteId, destinatario).catch((e) =>
    console.error(`Comprobante ${comprobanteId}: no se pudo enviar por correo:`, e.message || e));
}

// Emite el comprobante elegido por el personal (factura o boleta con otro comprador).
async function emitirElegido(reservaId, tipo, comprador, emitidoPor) {
  const { data, error } = await supabase.rpc('emitir_comprobante', {
    p_reserva_id: reservaId,
    p_tipo: tipo,
    p_comprador: comprador,
    p_emitido_por: emitidoPor,
  });
  if (error) {
    if ((error.message || '').includes('COMPROBANTE_YA_EMITIDO') || error.code === '23505') {
      const { data: existente } = await supabase.rpc('comprobante_de_reserva', { p_reserva_id: reservaId });
      return existente;
    }
    throw error;
  }
  return data;
}

// Para usar después de un pago (en línea o presencial): emite el comprobante (se espera, es rápido)
// y lo envía por correo en segundo plano. Nunca lanza errores: el pago ya quedó registrado.
//   elegido: { tipo: 'Boleta' | 'Factura', comprador } -> lo que eligió el personal en caja.
//   Sin "elegido" (o boleta sin comprador): boleta a nombre del titular.
export async function emitirYEnviarComprobante(reservaId, emitidoPor = null, elegido = null) {
  try {
    const comp = elegido?.comprador
      ? await emitirElegido(reservaId, elegido.tipo, elegido.comprador, emitidoPor)
      : await emitirBoletaAutomatica(reservaId, emitidoPor);
    if (comp?.id) enviarEnSegundoPlano(comp.id);
    return comp;
  } catch (e) {
    console.error(`Reserva ${reservaId}: el pago quedó registrado, pero falló el comprobante digital:`, e.message || e);
    return null;
  }
}
