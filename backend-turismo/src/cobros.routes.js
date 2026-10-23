import { Router } from 'express';
import { supabase } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const ROLES = ['Recepcionista', 'Gerente'];
const ESTADOS = ['Pendiente', 'Pagada', 'Cancelada'];
const METODOS = ['Efectivo', 'Tarjeta', 'QR'];
const MEDIOS_QR = ['Yape', 'Plin'];

const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const dosDecimales = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

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

// POST /api/reservas/:id/pagos  { pagos: [{ metodo, medio?, monto, recibido?, referencia? }] }
router.post('/:id/pagos', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La reserva no es válida.');

    const lista = req.body?.pagos;
    if (!Array.isArray(lista) || lista.length < 1 || lista.length > 10) {
      return fallo(res, 400, 'Indica entre 1 y 10 medios de pago.');
    }

    const pagos = [];
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
      if (l.referencia !== undefined) p.referencia = String(l.referencia).trim().slice(0, 60);
      pagos.push(p);
    }

    const { data, error } = await supabase.rpc('registrar_pago', {
      p_reserva_id: id, p_pagos: pagos, p_cobrado_por: req.usuario.id,
    });

    if (error) {
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