import { Router } from 'express';
import { supabase } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';
import { crearCargo, reembolsar, ErrorPasarela } from './culqi.js';

const router = Router();
const ROLES = ['Recepcionista', 'Gerente'];
const ESTADOS = ['Pendiente', 'Pagada', 'Cancelada'];
const METODOS = ['Efectivo', 'Tarjeta', 'QR'];
const MEDIOS_QR = ['Yape', 'Plin'];

const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const dosDecimales = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

// Si el cargo salió bien pero no pudimos registrar el pago, devolvemos el dinero.
async function devolver(cargoId, monto, reservaId) {
  try {
    await reembolsar({ cargoId, monto });
    console.warn(`Reembolso automático OK. Cargo ${cargoId}, reserva ${reservaId}`);
  } catch (e) {
    console.error(`URGENTE: reembolso FALLÓ. Devolver a mano en el panel de Culqi. Cargo ${cargoId}, reserva ${reservaId}`, e.detalle || e);
  }
}

// GET /api/reservas?estado=Pendiente&q=DNI-o-código
router.get('/', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const estado = req.query.estado === undefined ? 'Pendiente' : String(req.query.estado);
    if (!ESTADOS.includes(estado)) return fallo(res, 400, 'El estado no es válido.');
    const q = String(req.query.q || '').trim().slice(0, 20);
    const { data, error } = await supabase.rpc('listar_reservas', { p_estado: estado, p_q: q, p_limit: 50 });
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/reservas/:id
router.get('/:id', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La reserva no es válida.');
    const { data, error } = await supabase.rpc('obtener_reserva', { p_id: id });
    if (error) throw error;
    if (!data) return fallo(res, 404, 'La reserva no existe.');
    res.json(data);
  } catch (e) { next(e); }
});

// POST /api/reservas/:id/pagos
// { pagos: [{ metodo, medio?, monto, recibido?, referencia?, token? }], email? }
// Tarjeta exige "token" (de Culqi). El Backend crea el cargo y guarda su ID como referencia.
router.post('/:id/pagos', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La reserva no es válida.');

    const lista = req.body?.pagos;
    if (!Array.isArray(lista) || lista.length < 1 || lista.length > 10) {
      return fallo(res, 400, 'Indica entre 1 y 10 medios de pago.');
    }

    const pagos = [];
    let tarjeta = null; // { pago, token }
    for (const l of lista) {
      if (!METODOS.includes(l?.metodo)) return fallo(res, 400, 'El método de pago no es válido.');
      if (!dosDecimales(l.monto) || l.monto <= 0) return fallo(res, 400, 'Cada monto debe ser mayor a 0 y tener máximo 2 decimales.');
      const p = { metodo: l.metodo, monto: l.monto };

      if (l.metodo === 'QR') {
        if (!MEDIOS_QR.includes(l.medio)) return fallo(res, 400, 'Elige Yape o Plin para el pago con QR.');
        p.medio = l.medio;
      }
      if (l.metodo === 'Efectivo' && l.recibido !== undefined) {
        if (!dosDecimales(l.recibido) || l.recibido < l.monto) return fallo(res, 400, 'El efectivo recibido no cubre el monto.');
        p.recibido = l.recibido;
      }
      if (l.metodo === 'Tarjeta') {
        if (tarjeta) return fallo(res, 400, 'Solo se admite un pago con tarjeta por operación.');
        const token = typeof l.token === 'string' ? l.token.trim() : '';
        if (!/^tkn_[A-Za-z0-9_]{4,60}$/.test(token)) return fallo(res, 400, 'Falta el token de la tarjeta.');
        tarjeta = { pago: p, token };
      } else if (l.referencia !== undefined) {
        p.referencia = String(l.referencia).trim().slice(0, 60);
      }
      pagos.push(p);
    }

    // Validar la reserva ANTES de cobrar la tarjeta
    const { data: reserva, error: eRes } = await supabase.rpc('obtener_reserva', { p_id: id });
    if (eRes) throw eRes;
    if (!reserva) return fallo(res, 404, 'La reserva no existe.');
    if (reserva.estado !== 'Pendiente') return fallo(res, 409, 'Esta reserva ya no está pendiente de pago.');

    const sumaCent = pagos.reduce((a, p) => a + Math.round(p.monto * 100), 0);
    if (sumaCent !== Math.round(Number(reserva.total) * 100)) {
      return fallo(res, 400, 'La suma de los pagos debe ser igual al total de la reserva.');
    }

    // Cobrar la tarjeta en Culqi
    let cargo = null;
    if (tarjeta) {
      const { data: cli } = await supabase
        .from('clientes').select('correo').eq('dni', reserva.cliente.dni).maybeSingle();
      const email = (cli?.correo || req.body?.email || '').trim();
      if (!email) return fallo(res, 400, 'El cliente necesita un correo para pagar con tarjeta.');

      try {
        cargo = await crearCargo({
          monto: tarjeta.pago.monto,
          email,
          tokenId: tarjeta.token,
          descripcion: `Reserva ${reserva.codigo} - ${reserva.paquete.nombre}`.slice(0, 80),
          reservaId: id,
        });
      } catch (e) {
        if (e instanceof ErrorPasarela) {
          console.error('Culqi rechazó el cargo:', JSON.stringify(e.detalle));
          return fallo(res, 402, e.message);
        }
        throw e;
      }
      if (!cargo?.id || (cargo.outcome && cargo.outcome.type !== 'venta_exitosa')) {
        console.error('Cargo no aprobado:', JSON.stringify(cargo));
        return fallo(res, 402, 'El pago con tarjeta no fue aprobado.');
      }
      tarjeta.pago.referencia = cargo.id;
    }

    // Registrar el pago. Si falla con un cargo ya hecho, se devuelve el dinero.
    let resultado;
    try {
      resultado = await supabase.rpc('registrar_pago', {
        p_reserva_id: id, p_pagos: pagos, p_cobrado_por: req.usuario.id,
      });
    } catch (e) {
      resultado = { error: e };
    }
    const { data, error } = resultado;

    if (error) {
      if (cargo) await devolver(cargo.id, tarjeta.pago.monto, id);
      const m = error.message || '';
      if (m.includes('RESERVA_NO_ENCONTRADA')) return fallo(res, 404, 'La reserva no existe.');
      if (m.includes('RESERVA_NO_PENDIENTE') || error.code === '23505') return fallo(res, 409, 'Esta reserva ya no está pendiente de pago.');
      if (m.includes('MONTO_NO_COINCIDE')) return fallo(res, 400, 'La suma de los pagos debe ser igual al total de la reserva.');
      if (m.includes('DATOS_INVALIDOS') || error.code === '23514') return fallo(res, 400, 'Los datos del pago no son válidos.');
      throw error;
    }
    res.status(201).json(data);
  } catch (e) { next(e); }
});

export default router;