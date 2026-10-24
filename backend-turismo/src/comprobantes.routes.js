import { Router } from 'express';
import { supabase } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';
import { generarPdf, numeroCompleto } from './comprobante.pdf.js';

// Se monta en /api: define /reservas/:id/comprobante y /comprobantes/:id/pdf
const router = Router();
const ROLES = ['Recepcionista', 'Gerente'];
const DOCS_BOLETA = ['DNI', 'CE', 'Pasaporte'];

const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const txt = (v) => (typeof v === 'string' ? v.trim() : '');
const doc = (v) => txt(v).replace(/\s+/g, '').toUpperCase();

// Devuelve { error } o { comprador } (comprador puede ser null en la boleta simple)
function validarComprador(tipo, c) {
  const hay = c && typeof c === 'object' && txt(c.numero_documento) !== '';
  if (tipo === 'Factura') {
    if (!hay) return { error: 'La factura necesita RUC, razón social y dirección.' };
    const numero = doc(c.numero_documento);
    if (c.tipo_documento !== 'RUC' || !/^\d{11}$/.test(numero)) return { error: 'El RUC debe tener 11 dígitos.' };
    const nombre = txt(c.nombre), direccion = txt(c.direccion);
    if (!nombre || nombre.length > 200) return { error: 'Escribe la razón social (máximo 200 caracteres).' };
    if (!direccion || direccion.length > 250) return { error: 'Escribe la dirección fiscal (máximo 250 caracteres).' };
    return { comprador: { tipo_documento: 'RUC', numero_documento: numero, nombre, direccion } };
  }
  if (!hay) return { comprador: null };
  const numero = doc(c.numero_documento);
  if (!DOCS_BOLETA.includes(c.tipo_documento)) return { error: 'El tipo de documento del comprador no es válido.' };
  if (c.tipo_documento === 'DNI' && !/^\d{8}$/.test(numero)) return { error: 'El DNI debe tener 8 dígitos.' };
  if (c.tipo_documento !== 'DNI' && !/^[A-Z0-9]{6,15}$/.test(numero)) return { error: 'El documento debe tener entre 6 y 15 letras o números.' };
  const nombre = txt(c.nombre);
  if (!nombre || nombre.length > 200) return { error: 'Escribe el nombre del comprador (máximo 200 caracteres).' };
  return { comprador: { tipo_documento: c.tipo_documento, numero_documento: numero, nombre } };
}

// POST /api/reservas/:id/comprobante   { tipo: 'Boleta' | 'Factura', comprador? }
router.post('/reservas/:id/comprobante', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La reserva no es válida.');
    const tipo = req.body?.tipo;
    if (!['Boleta', 'Factura'].includes(tipo)) return fallo(res, 400, 'El tipo de comprobante no es válido.');
    const v = validarComprador(tipo, req.body?.comprador);
    if (v.error) return fallo(res, 400, v.error);

    const { data, error } = await supabase.rpc('emitir_comprobante', {
      p_reserva_id: id, p_tipo: tipo, p_comprador: v.comprador, p_emitido_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('RESERVA_NO_ENCONTRADA')) return fallo(res, 404, 'La reserva no existe.');
      if (m.includes('RESERVA_NO_PAGADA')) return fallo(res, 409, 'Primero hay que cobrar la reserva.');
      if (m.includes('COMPROBANTE_YA_EMITIDO') || error.code === '23505') return fallo(res, 409, 'Esta reserva ya tiene un comprobante.');
      if (m.includes('COMPRADOR_REQUERIDO')) return fallo(res, 400, 'Con ese total debes identificar al comprador.');
      if (m.includes('DATOS_INVALIDOS') || error.code === '23514') return fallo(res, 400, 'Los datos del comprobante no son válidos.');
      throw error;
    }
    res.status(201).json(data);
  } catch (e) { next(e); }
});

// GET /api/reservas/:id/comprobante  -> comprobante emitido o 404
router.get('/reservas/:id/comprobante', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La reserva no es válida.');
    const { data, error } = await supabase.rpc('comprobante_de_reserva', { p_reserva_id: id });
    if (error) throw error;
    if (!data) return fallo(res, 404, 'Esta reserva aún no tiene comprobante.');
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/comprobantes/:id/pdf  -> archivo PDF
router.get('/comprobantes/:id/pdf', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'El comprobante no es válido.');
    const { data, error } = await supabase.rpc('obtener_comprobante', { p_id: id });
    if (error) throw error;
    if (!data) return fallo(res, 404, 'El comprobante no existe.');

    const pdf = await generarPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${numeroCompleto(data)}.pdf"`,
      'Cache-Control': 'no-store',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (e) { next(e); }
});

export default router;