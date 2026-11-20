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

  const foto = txt(b.foto_url);
  if (foto) {
    let ok = false;
    try { ok = ['http:', 'https:'].includes(new URL(foto).protocol); } catch { ok = false; }
    if (!ok || foto.length > 500) errores.foto_url = 'La foto debe ser un enlace http(s) válido.';
  }

  const aclaraciones = txt(b.aclaraciones);
  if (aclaraciones.length > 2000) errores.aclaraciones = 'Las aclaraciones no pueden pasar de 2000 caracteres.';

  let itinerario = [];
  if (b.itinerario !== undefined && !Array.isArray(b.itinerario)) {
    errores.itinerario = 'El itinerario no es válido.';
  } else {
    itinerario = (b.itinerario || []).map((i) => ({ hora: txt(i?.hora), descripcion: txt(i?.descripcion) }));
    if (itinerario.length > 40) errores.itinerario = 'El itinerario puede tener como máximo 40 actividades.';
    else if (itinerario.some((i) => !i.hora || i.hora.length > 20 || !i.descripcion || i.descripcion.length > 300)) {
      errores.itinerario = 'Cada actividad necesita hora (máx. 20 caracteres) y descripción (máx. 300).';
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

const cuposValidos = (v) => Number.isInteger(v) && v >= 1 && v <= 500;

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

    const { data: anterior, error: e1 } = await supabase.from('paquetes').select('foto_url').eq('id', id).maybeSingle();
    if (e1) throw e1;
    if (!anterior) return fallo(res, 404, 'Paquete no encontrado.');

    const { data, error } = await supabase.from('paquetes').update(valores).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fallo(res, 404, 'Paquete no encontrado.');

    if (anterior.foto_url && anterior.foto_url !== valores.foto_url) await borrarFoto(anterior.foto_url);

    res.json({ id, mensaje: 'Paquete actualizado.' });
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

// POST /api/admin/paquetes/:id/salidas   { fecha: "YYYY-MM-DDTHH:mm" (Lima), cupos_totales, guia_id? }
router.post('/paquetes/:id/salidas', async (req, res, next) => {
  try {
    const paqueteId = idValido(req.params.id);
    if (!paqueteId) return fallo(res, 400, 'El paquete no es válido.');

    const fecha = fechaLima(req.body?.fecha);
    if (!fecha) return fallo(res, 400, 'Indica la fecha y hora de salida.');
    if (fecha <= new Date()) return fallo(res, 400, 'La fecha de salida debe ser futura.');

    const cupos = req.body?.cupos_totales;
    if (!cuposValidos(cupos)) return fallo(res, 400, 'Los cupos deben ser un número entero entre 1 y 500.');

    const guia = req.body?.guia_id || null;
    if (guia && (!esUuid(guia) || !(await guiaValido(guia)))) return fallo(res, 400, 'El guía elegido no es válido.');

    const { data: paquete, error: e1 } = await supabase.from('paquetes').select('id').eq('id', paqueteId).maybeSingle();
    if (e1) throw e1;
    if (!paquete) return fallo(res, 404, 'Paquete no encontrado.');

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
  CUPOS_INVALIDOS: [400, 'Los cupos deben ser un número entero entre 1 y 500.'],
  CUPOS_MENOR_A_RESERVADOS: [409, 'Los cupos totales no pueden ser menores que los cupos ya reservados.'],
  GUIA_NO_VALIDO: [400, 'El guía elegido no es válido.'],
  ESTADO_NO_VALIDO: [400, 'El estado debe ser Activa o Inactiva.'],
};

// PUT /api/admin/salidas/:id   { fecha?, cupos_totales?, guia_id? (null = quitar), estado? ('Activa'|'Inactiva') }
router.put('/salidas/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La salida no es válida.');
    const b = req.body || {};

    let fecha = null;
    if (b.fecha !== undefined) {
      fecha = fechaLima(b.fecha);
      if (!fecha) return fallo(res, 400, 'Indica la fecha y hora de salida.');
    }

    if (b.cupos_totales !== undefined && !cuposValidos(b.cupos_totales)) {
      return fallo(res, 400, 'Los cupos deben ser un número entero entre 1 y 500.');
    }

    const quitarGuia = b.guia_id === null || b.guia_id === '';
    if (!quitarGuia && b.guia_id !== undefined && !esUuid(b.guia_id)) {
      return fallo(res, 400, 'El guía elegido no es válido.');
    }

    if (b.estado !== undefined && !['Activa', 'Inactiva'].includes(b.estado)) {
      return fallo(res, 400, 'El estado debe ser Activa o Inactiva.');
    }

    const { data, error } = await supabase.rpc('admin_editar_salida', {
      p_id: id,
      p_fecha: fecha ? fecha.toISOString() : null,
      p_cupos_totales: b.cupos_totales ?? null,
      p_guia_id: quitarGuia ? null : (b.guia_id ?? null),
      p_quitar_guia: quitarGuia,
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
