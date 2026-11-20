import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { crearLimitador } from '../middlewares/limitar.js';
import { esFechaISO, idValido } from '../utils/comunes.js';

// HU-011 · Control de asistencia de pasajeros en el punto de encuentro.
// El Guía ve SOLO las salidas que tiene asignadas; el Administrador puede ver todas.
// Requiere supabase/08-asistencia-guias.sql.
const router = Router();

router.use(requiereSesion(['Guia', 'Administrador']));

// Cada check-in es un clic: margen amplio, pero evita abusos.
const limitarMarcas = crearLimitador({
  ventanaMs: 60_000,
  maximo: 120,
  clave: (req) => req.usuario.id,
  mensaje: 'Demasiadas marcas seguidas. Espera un momento.',
});

const MAX_DIAS = 93; // unos 3 meses: el Front consulta por defecto los próximos 2
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD
const esAdmin = (req) => req.usuario.rol === 'Administrador';

// La función SQL aún no existe: falta ejecutar 08-asistencia-guias.sql
const faltaSql = (error) => error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42703';

// La salida existe y (si es Guía) está asignada a quien consulta.
async function comprobarSalida(req, salidaId) {
  const { data, error } = await supabase
    .from('salidas')
    .select('id, guia_id')
    .eq('id', salidaId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { estado: 404, error: 'La salida no existe.' };
  if (!esAdmin(req) && data.guia_id !== req.usuario.id) {
    return { estado: 403, error: 'Esta salida no está asignada a ti.' };
  }
  return { salida: data };
}

// GET /api/guia/salidas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD   (por defecto: hoy en Lima)
router.get('/salidas', async (req, res, next) => {
  try {
    const desde = String(req.query.desde || hoyLima());
    const hasta = String(req.query.hasta || desde);

    if (!esFechaISO(desde) || !esFechaISO(hasta)) {
      return fallo(res, 400, 'Las fechas deben tener formato YYYY-MM-DD.');
    }
    if (desde > hasta) {
      return fallo(res, 400, 'La fecha inicial no puede ser mayor que la final.');
    }
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    if (dias > MAX_DIAS) {
      return fallo(res, 400, `Consulta como máximo ${MAX_DIAS} días.`);
    }

    const { data, error } = await supabase.rpc('salidas_de_guia', {
      p_guia: esAdmin(req) ? null : req.usuario.id,
      p_desde: desde,
      p_hasta: hasta,
    });

    if (error) {
      if (faltaSql(error)) {
        console.error('Falta ejecutar supabase/08-asistencia-guias.sql');
        return fallo(res, 503, 'El control de asistencia aún no está disponible.');
      }
      throw error;
    }

    res.set('Cache-Control', 'no-store');
    res.json(data || []);
  } catch (e) { next(e); }
});

// GET /api/guia/salidas/:id/pasajeros
router.get('/salidas/:id/pasajeros', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La salida no es válida.');

    const v = await comprobarSalida(req, id);
    if (v.error) return fallo(res, v.estado, v.error);

    const { data, error } = await supabase.rpc('pasajeros_de_salida', { p_salida_id: id });

    if (error) {
      if (faltaSql(error)) return fallo(res, 503, 'El control de asistencia aún no está disponible.');
      throw error;
    }

    res.set('Cache-Control', 'no-store');
    res.json(data || []);
  } catch (e) { next(e); }
});

// POST /api/guia/salidas/:id/asistencia   { reserva_id, acompanante_id?: number|null, presente: boolean }
router.post('/salidas/:id/asistencia', limitarMarcas, async (req, res, next) => {
  try {
    const salidaId = idValido(req.params.id);
    if (!salidaId) return fallo(res, 400, 'La salida no es válida.');

    const reservaId = idValido(req.body?.reserva_id);
    if (!reservaId) return fallo(res, 400, 'La reserva no es válida.');

    const crudo = req.body?.acompanante_id;
    const acompananteId = crudo === undefined || crudo === null ? null : idValido(crudo);
    if (crudo !== undefined && crudo !== null && !acompananteId) {
      return fallo(res, 400, 'El acompañante no es válido.');
    }

    if (typeof req.body?.presente !== 'boolean') {
      return fallo(res, 400, 'Indica si el pasajero está presente.');
    }

    const v = await comprobarSalida(req, salidaId);
    if (v.error) return fallo(res, v.estado, v.error);

    const { data, error } = await supabase.rpc('marcar_asistencia', {
      p_salida_id: salidaId,
      p_reserva_id: reservaId,
      p_acompanante_id: acompananteId,
      p_presente: req.body.presente,
      p_marcado_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('RESERVA_NO_ENCONTRADA')) return fallo(res, 404, 'El pasajero no pertenece a esta salida.');
      if (m.includes('ACOMPANANTE_NO_ENCONTRADO')) return fallo(res, 404, 'El acompañante no pertenece a esta reserva.');
      if (m.includes('RESERVA_NO_PAGADA')) return fallo(res, 409, 'La reserva de este pasajero no está pagada.');
      if (faltaSql(error)) return fallo(res, 503, 'El control de asistencia aún no está disponible.');
      throw error;
    }

    res.json(data);
  } catch (e) { next(e); }
});

export default router;
