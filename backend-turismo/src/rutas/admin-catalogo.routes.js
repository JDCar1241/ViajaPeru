import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { ROLES_ADMIN, idValido, txt } from '../utils/comunes.js';

// HU-009 · Gestionar catálogo de paquetes (solo Administrador).
// Requiere supabase/09-catalogo.sql (y 08 para salidas.guia_id).
const router = Router();

router.use(requiereSesion(ROLES_ADMIN));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const faltaSql = (error) => error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42703';
const noDisponible = (res) => {
  console.error('Falta ejecutar supabase/09-catalogo.sql');
  return fallo(res, 503, 'La gestión del catálogo aún no está disponible.');
};

// ---------------------------------------------
// Fotos (bucket público "paquetes" de Supabase Storage)
// ---------------------------------------------

const BUCKET = 'paquetes';
const MAX_FOTO = 5 * 1024 * 1024; // 5 MB, igual que el límite del bucket
const PREFIJO_PUBLICO = `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/`;

// El tipo se decide por los primeros bytes del archivo, no por lo que diga el navegador.
function tipoImagen(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// Ruta dentro del bucket si la URL es una foto subida por nosotros; si no (enlace externo), null.
const rutaPropia = (url) =>
  typeof url === 'string' && PREFIJO_PUBLICO.length > 40 && url.startsWith(PREFIJO_PUBLICO)
    ? decodeURIComponent(url.slice(PREFIJO_PUBLICO.length))
    : null;

// Borrar la foto vieja no debe hacer fallar la operación principal.
async function borrarFoto(url) {
  const ruta = rutaPropia(url);
  if (!ruta) return;
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
  if (error) console.error('No se pudo borrar la foto', ruta, error.message);
}

const MAX_ACTIVIDADES = 40;
const MAX_DIAS = 30;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/; // 24 h: 00:00 a 23:59

// Orden cronológico: día y luego hora. Si coinciden, se respeta el orden en que se escribieron.
const ordenarItinerario = (it) =>
  it
    .map((a, k) => ({ a, k }))
    .sort((x, y) => (Number(x.a.dia) || 1) - (Number(y.a.dia) || 1)
      || String(x.a.hora).localeCompare(String(y.a.hora))
      || x.k - y.k)
    .map(({ a }) => a);

const esUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---------------------------------------------
// Validación de paquetes
// ---------------------------------------------

function validarPaquete(b = {}) {
  const errores = {};

  const nombre = txt(b.nombre);
  if (nombre.length < 3 || nombre.length > 120) errores.nombre = 'El nombre debe tener entre 3 y 120 caracteres.';

  const destino = txt(b.destino);
  if (destino.length < 2 || destino.length > 80) errores.destino = 'El destino debe tener entre 2 y 80 caracteres.';

  const costo = Number(b.costo);
  if (!Number.isFinite(costo) || costo <= 0 || costo > 100000 || Math.abs(Math.round(costo * 100) - costo * 100) > 1e-6) {
    errores.costo = 'El precio debe ser mayor a 0, con hasta 2 decimales.';
  }

  // La foto es obligatoria: el catálogo muestra una por paquete.
  const foto = txt(b.foto_url);
  if (!foto) {
    errores.foto_url = 'Sube la foto del paquete.';
  } else {
    let ok = false;
    try { ok = ['http:', 'https:'].includes(new URL(foto).protocol); } catch { ok = false; }
    if (!ok || foto.length > 500) errores.foto_url = 'La foto debe ser un enlace http(s) válido.';
  }

  const aclaraciones = txt(b.aclaraciones);
  if (aclaraciones.length > 2000) errores.aclaraciones = 'Las aclaraciones no pueden pasar de 2000 caracteres.';

  // Itinerario obligatorio. Cada actividad: { dia: 1..30, hora: "HH:mm" (24 h), descripcion }.
  // Se guarda ordenado por día y hora. La primera actividad (Día 1) marca la hora de las salidas.
  let itinerario = [];
  if (!Array.isArray(b.itinerario)) {
    errores.itinerario = 'Agrega el itinerario del paquete.';
  } else {
    itinerario = b.itinerario.map((i) => ({
      dia: Number(i?.dia),
      hora: txt(i?.hora),
      descripcion: txt(i?.descripcion),
    }));
    if (itinerario.length === 0) {
      errores.itinerario = 'El paquete debe tener al menos una actividad en el itinerario.';
    } else if (itinerario.length > MAX_ACTIVIDADES) {
      errores.itinerario = `El itinerario puede tener como máximo ${MAX_ACTIVIDADES} actividades.`;
    } else if (itinerario.some((i) => !Number.isInteger(i.dia) || i.dia < 1 || i.dia > MAX_DIAS)) {
      errores.itinerario = `Cada actividad necesita un día entre 1 y ${MAX_DIAS}.`;
    } else if (itinerario.some((i) => !RE_HORA.test(i.hora))) {
      errores.itinerario = 'Cada actividad necesita una hora en formato 24 h (por ejemplo 06:30).';
    } else if (itinerario.some((i) => !i.descripcion || i.descripcion.length > 300)) {
      errores.itinerario = 'Cada actividad necesita una descripción (máx. 300 caracteres).';
    } else {
      itinerario = ordenarItinerario(itinerario);
      if (itinerario[0].dia !== 1) errores.itinerario = 'El itinerario debe empezar en el Día 1.';
    }
  }

  if (Object.keys(errores).length) return { errores };
  return {
    valores: {
      nombre, destino, costo,
      foto_url: foto || null,
      aclaraciones: aclaraciones || null,
      itinerario,
    },
  };
}

// "YYYY-MM-DDTHH:mm" en hora de Lima (UTC-5, sin horario de verano) -> Date
function fechaLima(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const MAX_CUPOS = 40; // cupos por salida (un bus turístico mediano)
const MSG_CUPOS = `Los cupos deben ser un número entero entre 1 y ${MAX_CUPOS}.`;
const cuposValidos = (v) => Number.isInteger(v) && v >= 1 && v <= MAX_CUPOS;

// "YYYY-MM-DD" + "HH:mm" en hora de Lima -> Date
const fechaConHora = (dia, hora) =>
  typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? fechaLima(`${dia}T${hora}`) : null;

// Date -> "YYYY-MM-DD" en hora de Lima
const diaLima = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Date -> "HH:mm" en hora de Lima
const horaLima = (d) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });

// Hora de la primera actividad del Día 1 (o null si el paquete no tiene itinerario)
const horaInicio = (itinerario) =>
  Array.isArray(itinerario) && itinerario.length ? ordenarItinerario(itinerario)[0].hora : null;

async function itinerarioDe(paqueteId) {
  const { data, error } = await supabase.from('paquetes').select('id, itinerario').eq('id', paqueteId).maybeSingle();
  if (error) throw error;
  return data;
}

async function guiaValido(id) {
  const { data, error } = await supabase.from('perfiles').select('id').eq('id', id).eq('rol', 'Guia').maybeSingle();
  if (error) throw error;
  return !!data;
}

// =============================================
// PAQUETES
// =============================================

// GET /api/admin/paquetes
router.get('/paquetes', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('admin_listar_paquetes');
    if (error) { if (faltaSql(error)) return noDisponible(res); throw error; }
    res.json((data || []).map((p) => ({ ...p, costo: Number(p.costo) })));
  } catch (e) { next(e); }
});

// GET /api/admin/paquetes/:id
router.get('/paquetes/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'El paquete no es válido.');

    const { data, error } = await supabase.rpc('admin_obtener_paquete', { p_id: id });
    if (error) { if (faltaSql(error)) return noDisponible(res); throw error; }
    if (!data) return fallo(res, 404, 'Paquete no encontrado.');

    res.json({ ...data, costo: Number(data.costo) });
  } catch (e) { next(e); }
});

// POST /api/admin/paquetes
router.post('/paquetes', async (req, res, next) => {
  try {
    const { errores, valores } = validarPaquete(req.body);
    if (errores) return res.status(400).json({ error: 'Revisa los datos del paquete.', mensaje: 'Revisa los datos del paquete.', errores });

    const { data, error } = await supabase.from('paquetes').insert(valores).select('id').single();
    if (error) throw error;

    res.status(201).json({ id: data.id, mensaje: 'Paquete creado.' });
  } catch (e) { next(e); }
});

// PUT /api/admin/paquetes/:id
router.put('/paquetes/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'El paquete no es válido.');

    const { errores, valores } = validarPaquete(req.body);
    if (errores) return res.status(400).json({ error: 'Revisa los datos del paquete.', mensaje: 'Revisa los datos del paquete.', errores });

    const { data: anterior, error: e1 } = await supabase.from('paquetes').select('foto_url, itinerario').eq('id', id).maybeSingle();
    if (e1) throw e1;
    if (!anterior) return fallo(res, 404, 'Paquete no encontrado.');

    // La hora de cada salida debe ser exactamente la de la primera actividad (Día 1).
    // Las salidas futuras con otra hora se mueven; las que ya tienen reservas no se tocan
    // (sus clientes compraron esa hora) y en ese caso no se permite el cambio.
    const horaNueva = horaInicio(valores.itinerario);

    const { data: futuras, error: e2 } = await supabase
      .from('salidas')
      .select('id, fecha_inicio_viaje, reservas(estado)')
      .eq('paquete_id', id)
      .neq('estado', 'Cancelada')
      .gt('fecha_inicio_viaje', new Date().toISOString());
    if (e2) throw e2;

    const distintas = (futuras || []).filter((s) => horaLima(s.fecha_inicio_viaje) !== horaNueva);
    const conReservas = distintas.filter((s) =>
      (s.reservas || []).some((r) => ['Pendiente', 'Pagada'].includes(r.estado)));

    if (conReservas.length) {
      const horas = [...new Set(conReservas.map((s) => horaLima(s.fecha_inicio_viaje)))].join(', ');
      return fallo(res, 409,
        `La primera actividad del Día 1 marca la hora de salida, y ${conReservas.length} salida(s) futura(s) ` +
        `con reservas salen a las ${horas}. Usa esa hora en la primera actividad.`);
    }

    const mover = distintas.map((s) => ({
      id: s.id,
      fecha: fechaConHora(diaLima(s.fecha_inicio_viaje), horaNueva),
    }));
    if (mover.some((m) => !m.fecha || m.fecha <= new Date())) {
      return fallo(res, 409, 'Con la nueva hora, alguna salida quedaría en el pasado. Revisa la hora de la primera actividad.');
    }

    const { data, error } = await supabase.from('paquetes').update(valores).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fallo(res, 404, 'Paquete no encontrado.');

    if (anterior.foto_url && anterior.foto_url !== valores.foto_url) await borrarFoto(anterior.foto_url);

    for (const m of mover) {
      const { error: e3 } = await supabase.from('salidas').update({ fecha_inicio_viaje: m.fecha.toISOString() }).eq('id', m.id);
      if (e3) console.error('No se pudo mover la salida', m.id, e3.message);
    }

    res.json({
      id,
      mensaje: mover.length
        ? `Paquete actualizado. ${mover.length} salida(s) futura(s) pasaron a las ${horaNueva}.`
        : 'Paquete actualizado.',
    });
  } catch (e) { next(e); }
});

// DELETE /api/admin/paquetes/:id  -> solo si ninguna de sus salidas tiene reservas
router.delete('/paquetes/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'El paquete no es válido.');

    const { data, error } = await supabase.from('paquetes').delete().eq('id', id).select('id, foto_url').maybeSingle();
    if (error) {
      if (error.code === '23503') {
        return fallo(res, 409, 'El paquete tiene reservas registradas y no se puede eliminar. Desactiva sus salidas para que deje de venderse.');
      }
      throw error;
    }
    if (!data) return fallo(res, 404, 'Paquete no encontrado.');

    await borrarFoto(data.foto_url);
    res.json({ mensaje: 'Paquete eliminado.' });
  } catch (e) { next(e); }
});

// =============================================
// SUBIR FOTO
// POST /api/admin/imagenes   (cuerpo = el archivo; Content-Type image/jpeg | image/png | image/webp)
// Respuesta: { url }  -> se guarda luego en foto_url al crear/editar el paquete
// =============================================

router.post(
  '/imagenes',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_FOTO }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return fallo(res, 400, 'Elige una imagen JPG, PNG o WebP.');
      }

      const tipo = tipoImagen(req.body);
      if (!tipo) return fallo(res, 400, 'El archivo no es una imagen JPG, PNG o WebP válida.');

      const ruta = `${randomUUID()}.${tipo.ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, req.body, { contentType: tipo.mime, cacheControl: '31536000', upsert: false });

      if (error) {
        if (/bucket not found/i.test(error.message || '')) return noDisponible(res);
        throw error;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
      res.status(201).json({ url: data.publicUrl });
    } catch (e) { next(e); }
  }
);

// =============================================
// SALIDAS (fechas y cupos de cada paquete)
// =============================================

// POST /api/admin/paquetes/:id/salidas   { fecha: "YYYY-MM-DD", cupos_totales, guia_id }
// La hora NO se elige: es la de la primera actividad del itinerario (Día 1).
router.post('/paquetes/:id/salidas', async (req, res, next) => {
  try {
    const paqueteId = idValido(req.params.id);
    if (!paqueteId) return fallo(res, 400, 'El paquete no es válido.');

    const paquete = await itinerarioDe(paqueteId);
    if (!paquete) return fallo(res, 404, 'Paquete no encontrado.');

    const hora = horaInicio(paquete.itinerario);
    if (!hora || !RE_HORA.test(hora)) {
      return fallo(res, 409, 'El paquete no tiene itinerario (o su hora no es válida). Guarda el itinerario antes de programar salidas.');
    }

    const fecha = fechaConHora(req.body?.fecha, hora);
    if (!fecha) return fallo(res, 400, 'Indica la fecha de salida.');
    if (fecha <= new Date()) return fallo(res, 400, 'La fecha de salida debe ser futura.');

    const cupos = req.body?.cupos_totales;
    if (!cuposValidos(cupos)) return fallo(res, 400, MSG_CUPOS);

    const guia = req.body?.guia_id || null;
    if (!guia) return fallo(res, 400, 'Elige el guía turístico de la salida.');
    if (!esUuid(guia) || !(await guiaValido(guia))) return fallo(res, 400, 'El guía elegido no es válido.');

    const { data, error } = await supabase
      .from('salidas')
      .insert({
        paquete_id: paqueteId,
        fecha_inicio_viaje: fecha.toISOString(),
        cupos_totales: cupos,
        cupos_disponibles: cupos,
        estado: 'Activa',
        guia_id: guia,
      })
      .select('id')
      .single();
    if (error) { if (faltaSql(error)) return noDisponible(res); throw error; }

    res.status(201).json({ id: data.id, mensaje: 'Salida programada.' });
  } catch (e) { next(e); }
});

const ERRORES_SALIDA = {
  SALIDA_NO_ENCONTRADA: [404, 'La salida no existe.'],
  SALIDA_CANCELADA: [409, 'La salida está cancelada y ya no se puede modificar.'],
  FECHA_PASADA: [400, 'La fecha de salida debe ser futura.'],
  FECHA_CON_RESERVAS: [409, 'La salida ya tiene reservas: no se puede cambiar su fecha.'],
  CUPOS_INVALIDOS: [400, MSG_CUPOS],
  CUPOS_MENOR_A_RESERVADOS: [409, 'Los cupos totales no pueden ser menores que los cupos ya reservados.'],
  GUIA_NO_VALIDO: [400, 'El guía elegido no es válido.'],
  ESTADO_NO_VALIDO: [400, 'El estado debe ser Activa o Inactiva.'],
};

// PUT /api/admin/salidas/:id   { fecha?: "YYYY-MM-DD", cupos_totales?, guia_id?, estado? ('Activa'|'Inactiva') }
// La hora sigue siendo la de la primera actividad del itinerario. El guía no se puede quitar.
router.put('/salidas/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La salida no es válida.');
    const b = req.body || {};

    const { data: actual, error: e0 } = await supabase
      .from('salidas').select('id, paquete_id, cupos_totales').eq('id', id).maybeSingle();
    if (e0) throw e0;
    if (!actual) return fallo(res, 404, 'La salida no existe.');

    let fecha = null;
    if (b.fecha !== undefined) {
      const paquete = await itinerarioDe(actual.paquete_id);
      const hora = horaInicio(paquete?.itinerario);
      if (!hora || !RE_HORA.test(hora)) {
        return fallo(res, 409, 'El paquete no tiene itinerario (o su hora no es válida). Guarda el itinerario primero.');
      }
      fecha = fechaConHora(b.fecha, hora);
      if (!fecha) return fallo(res, 400, 'Indica la fecha de salida.');
    }

    // Una salida antigua con más cupos que el límite puede conservarlos; no se puede subir de 40.
    if (b.cupos_totales !== undefined && b.cupos_totales !== actual.cupos_totales && !cuposValidos(b.cupos_totales)) {
      return fallo(res, 400, MSG_CUPOS);
    }

    if (b.guia_id === null || b.guia_id === '') {
      return fallo(res, 400, 'Elige el guía turístico de la salida.');
    }
    if (b.guia_id !== undefined && !esUuid(b.guia_id)) {
      return fallo(res, 400, 'El guía elegido no es válido.');
    }

    if (b.estado !== undefined && !['Activa', 'Inactiva'].includes(b.estado)) {
      return fallo(res, 400, 'El estado debe ser Activa o Inactiva.');
    }

    const { data, error } = await supabase.rpc('admin_editar_salida', {
      p_id: id,
      p_fecha: fecha ? fecha.toISOString() : null,
      p_cupos_totales: b.cupos_totales ?? null,
      p_guia_id: b.guia_id ?? null,
      p_quitar_guia: false,
      p_estado: b.estado ?? null,
    });

    if (error) {
      const clave = Object.keys(ERRORES_SALIDA).find((k) => (error.message || '').includes(k));
      if (clave) return fallo(res, ...ERRORES_SALIDA[clave]);
      if (faltaSql(error)) return noDisponible(res);
      throw error;
    }

    res.json({ ...data, mensaje: 'Salida actualizada.' });
  } catch (e) { next(e); }
});

// DELETE /api/admin/salidas/:id  -> solo si nunca tuvo reservas; si las tiene, se desactiva
router.delete('/salidas/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La salida no es válida.');

    const { data, error } = await supabase.from('salidas').delete().eq('id', id).select('id').maybeSingle();
    if (error) {
      if (error.code === '23503') {
        return fallo(res, 409, 'La salida tiene reservas registradas y no se puede eliminar. Puedes desactivarla para que deje de venderse.');
      }
      throw error;
    }
    if (!data) return fallo(res, 404, 'La salida no existe.');

    res.json({ mensaje: 'Salida eliminada.' });
  } catch (e) { next(e); }
});

// =============================================
// GUÍAS disponibles para asignar a una salida
// GET /api/admin/guias
// =============================================

router.get('/guias', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('perfiles').select('id, nombre').eq('rol', 'Guia').order('nombre');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

export default router;
