import { Router } from 'express';
import { supabase } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const txt = (v) => (typeof v === 'string' ? v.trim() : '');
const esDni = (v) => /^\d{8}$/.test(v);
const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const esTel = (v) => /^\d{9}$/.test(v);

function persona(p = {}) {
  return { dni: txt(p.dni), apellidos: txt(p.apellidos), nombres: txt(p.nombres) };
}

// POST /api/reservas
// { salida_id, cliente:{dni,apellidos,nombres,correo,telefono}, acompanantes:[{dni,apellidos,nombres}] }
router.post('/', requiereSesion(['Recepcionista', 'Gerente']), async (req, res, next) => {
  try {
    const { salida_id, cliente: c, acompanantes } = req.body || {};
    const salidaId = Number(salida_id);
    if (!Number.isInteger(salidaId) || salidaId < 1) return fallo(res, 400, 'La salida no es válida.');

    const cliente = { ...persona(c), correo: txt(c?.correo), telefono: txt(c?.telefono) };
    if (!esDni(cliente.dni)) return fallo(res, 400, 'El DNI del cliente debe tener 8 dígitos.');
    if (!cliente.apellidos || !cliente.nombres) return fallo(res, 400, 'Faltan los apellidos o nombres del cliente.');
    if (!esCorreo(cliente.correo)) return fallo(res, 400, 'El correo del cliente no es válido.');
    if (!esTel(cliente.telefono)) return fallo(res, 400, 'El teléfono del cliente debe tener 9 dígitos.');

    const lista = acompanantes === undefined ? [] : acompanantes;
    if (!Array.isArray(lista)) return fallo(res, 400, 'Los acompañantes no son válidos.');
    const acomp = lista.map(persona);
    const dnis = new Set([cliente.dni]);
    for (const a of acomp) {
      if (!esDni(a.dni) || !a.apellidos || !a.nombres) return fallo(res, 400, 'Cada acompañante necesita DNI de 8 dígitos, apellidos y nombres.');
      if (dnis.has(a.dni)) return fallo(res, 400, `El DNI ${a.dni} está repetido en la reserva.`);
      dnis.add(a.dni);
    }

    const { data, error } = await supabase.rpc('crear_reserva', {
      p_salida_id: salidaId,
      p_cliente: cliente,
      p_acompanantes: acomp,
      p_creado_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('CUPOS_INSUFICIENTES')) return fallo(res, 409, 'No hay cupos suficientes en esta salida.');
      if (m.includes('SALIDA_NO_DISPONIBLE')) return fallo(res, 409, 'La salida no está disponible.');
      if (m.includes('DATOS_INVALIDOS') || error.code === '23514') return fallo(res, 400, 'Los datos de la reserva no son válidos.');
      throw error;
    }
    res.status(201).json(data);
  } catch (e) { next(e); }
});

export default router;