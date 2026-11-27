import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { EMPRESA, correoInterno } from '../config/empresa.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { crearLimitador } from '../middlewares/limitar.js';
import { enviarCorreo } from '../servicios/correo.js';
import { ROLES_ADMIN, DOCUMENTOS, esCorreo, idValido, txt } from '../utils/comunes.js';
import { analizarMrz } from '../utils/mrz.js';
import { nombreNacionalidad, normalizarNacionalidad } from '../utils/nacionalidades.js';

// Libro de Reclamaciones virtual (Código de Protección y Defensa del Consumidor, Ley 29571,
// y su reglamento). Requiere supabase/12-libro-reclamaciones.sql.
//   POST /api/reclamos                 público: registra la hoja y envía la copia al consumidor
//   GET  /api/reclamos                 Administrador: lista de hojas
//   POST /api/reclamos/:id/respuesta   Administrador: guarda la respuesta y la envía por correo
const router = Router();

const PLAZO_DIAS_HABILES = 15;

const escaparHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const faltaSql = (error) => error?.code === '42P01' || error?.code === 'PGRST205';
const noDisponible = (res) => {
  console.error('Falta ejecutar supabase/12-libro-reclamaciones.sql');
  return fallo(res, 503, 'El Libro de Reclamaciones no está disponible en este momento. Escríbenos por correo.');
};

// ---- Días hábiles (Perú): sin sábados, domingos ni feriados nacionales ----
const FERIADOS_FIJOS = ['01-01', '05-01', '06-07', '06-29', '07-23', '07-28', '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'];

// Domingo de Pascua (algoritmo de Meeus) -> jueves y viernes santo también son feriados.
function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function esFeriado(d) {
  if (FERIADOS_FIJOS.includes(d.toISOString().slice(5, 10))) return true;
  const p = pascua(d.getUTCFullYear()).getTime();
  const t = d.getTime();
  return t === p - 3 * 864e5 || t === p - 2 * 864e5;
}

// Fecha de hoy en Lima (como fecha UTC a medianoche) + N días hábiles.
function sumarDiasHabiles(n) {
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const d = new Date(`${hoyLima}T00:00:00Z`);
  let faltan = n;
  while (faltan > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6 && !esFeriado(d)) faltan--;
  }
  return d.toISOString().slice(0, 10);
}

export const numeroHoja = (r) =>
  `${String(r.id).padStart(6, '0')}-${new Date(r.creado_en).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 4)}`;

const fechaLarga = (v) =>
  new Date(v).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' });
const fechaCorta = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { dateStyle: 'long', timeZone: 'UTC' });
const soles = (n) => Number(n).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

// ---- Validación ----
function validar(b) {
  const errores = {};
  const tipo = b?.tipo;
  if (!['Reclamo', 'Queja'].includes(tipo)) errores.tipo = 'Elige si es un reclamo o una queja.';

  const tipoDoc = String(b?.tipo_documento || '').toUpperCase();
  let numDoc = txt(b?.numero_documento).replace(/\s+/g, '').toUpperCase();
  let nombres = txt(b?.nombres);
  let apellidos = txt(b?.apellidos);
  let nacionalidad = normalizarNacionalidad(txt(b?.nacionalidad));

  // Pasaporte con MRZ (opcional): se valida y sus datos reemplazan a los escritos.
  // Un pasaporte vencido no impide reclamar.
  const mrz = Array.isArray(b?.mrz) ? b.mrz.slice(0, 2).map((l) => String(l ?? '')) : null;
  if (tipoDoc === 'PASAPORTE' && mrz && mrz.some(Boolean)) {
    const r = analizarMrz(mrz[0], mrz[1], new Date(), { permitirVencido: true });
    if (r.incompleto) errores.mrz = 'Cada línea de la MRZ debe tener 44 caracteres.';
    else if (!r.ok) errores.mrz = r.errores[0];
    else {
      numDoc = r.datos.numero;
      nombres = r.datos.nombres;
      apellidos = r.datos.apellidos;
      nacionalidad = normalizarNacionalidad(r.datos.nacionalidad);
    }
  }

  // Una pestaña abierta antes de este cambio todavía envía "consumidor_nombre" en un solo campo
  const nombreAntiguo = !nombres && !apellidos ? txt(b?.consumidor_nombre) : '';
  if (!nombreAntiguo) {
    if (nombres.length < 1 || nombres.length > 75) errores.nombres = 'Escribe tus nombres.';
    if (apellidos.length < 1 || apellidos.length > 75) errores.apellidos = 'Escribe tus apellidos.';
  }
  const nombre = nombreAntiguo || `${nombres} ${apellidos}`.trim();
  if (nombreAntiguo && (nombre.length < 3 || nombre.length > 150)) errores.nombres = 'Escribe tus nombres.';

  const regla = DOCUMENTOS[tipoDoc];
  if (!regla) errores.tipo_documento = 'Elige el tipo de documento.';
  else if (!regla.re.test(numDoc)) errores.numero_documento = `El ${regla.nombre} ${regla.msg}.`;

  // Nacionalidad: DNI = peruana; pasaporte = obligatoria; carné de extranjería = opcional
  if (tipoDoc === 'DNI') nacionalidad = 'PER';
  if (nacionalidad && !/^[A-Z]{1,3}$/.test(nacionalidad)) errores.nacionalidad = 'Elige una nacionalidad válida.';
  if (tipoDoc === 'PASAPORTE' && !nacionalidad) errores.nacionalidad = 'Elige tu nacionalidad.';

  const domicilio = txt(b?.domicilio);
  if (domicilio.length < 5 || domicilio.length > 250) errores.domicilio = 'Escribe tu domicilio.';

  const telefono = txt(b?.telefono).replace(/[\s-]/g, '');
  if (!/^\+?\d{6,15}$/.test(telefono)) errores.telefono = 'Escribe un teléfono válido (solo números).';

  const correo = txt(b?.correo).toLowerCase();
  if (!esCorreo(correo) || correo.length > 150) errores.correo = 'Escribe un correo válido: ahí te enviaremos la copia.';

  const esMenor = b?.es_menor === true;
  const apoderado = txt(b?.apoderado);
  if (esMenor && (apoderado.length < 3 || apoderado.length > 150)) {
    errores.apoderado = 'Escribe el nombre del padre, madre o apoderado.';
  }

  const bienTipo = b?.bien_tipo === 'Producto' ? 'Producto' : 'Servicio';
  const descripcion = txt(b?.bien_descripcion);
  if (descripcion.length < 3 || descripcion.length > 300) errores.bien_descripcion = 'Indica el paquete o servicio contratado.';

  let monto = null;
  if (b?.monto !== undefined && b?.monto !== null && String(b.monto).trim() !== '') {
    monto = Number(b.monto);
    if (!Number.isFinite(monto) || monto < 0 || monto > 1_000_000 || Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) {
      errores.monto = 'Escribe un monto válido (hasta 2 decimales).';
    }
  }

  const codigo = txt(b?.codigo_reserva).toUpperCase();
  if (codigo && !/^VP-\d{6}$/.test(codigo)) errores.codigo_reserva = 'El código tiene la forma VP-000123.';

  const detalle = txt(b?.detalle);
  if (detalle.length < 10 || detalle.length > 3000) errores.detalle = 'Cuéntanos qué pasó (entre 10 y 3000 caracteres).';

  const pedido = txt(b?.pedido);
  if (pedido.length < 5 || pedido.length > 2000) errores.pedido = 'Indica qué solicitas (entre 5 y 2000 caracteres).';

  if (b?.acepta !== true) errores.acepta = 'Confirma que los datos son verdaderos.';

  if (Object.keys(errores).length) return { errores };

  return {
    fila: {
      tipo,
      consumidor_nombre: nombre,
      consumidor_nombres: nombreAntiguo ? null : nombres,
      consumidor_apellidos: nombreAntiguo ? null : apellidos,
      nacionalidad: nacionalidad || null,
      tipo_documento: tipoDoc,
      numero_documento: numDoc,
      domicilio,
      telefono,
      correo,
      es_menor: esMenor,
      apoderado: esMenor ? apoderado : null,
      bien_tipo: bienTipo,
      bien_descripcion: descripcion,
      monto,
      codigo_reserva: codigo || null,
      detalle,
      pedido,
    },
  };
}

// ---- Hoja en HTML (copia para el consumidor y aviso interno) ----
const fila = (etiqueta, valor) =>
  `<tr><td style="padding:6px 10px;color:#55657A;width:38%;vertical-align:top">${escaparHtml(etiqueta)}</td>` +
  `<td style="padding:6px 10px;color:#0A2540;white-space:pre-wrap">${escaparHtml(valor)}</td></tr>`;

const seccion = (titulo, filas) =>
  `<h3 style="margin:22px 0 6px;color:#1456D6;font-size:15px">${escaparHtml(titulo)}</h3>` +
  `<table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #DCE4EF">${filas.join('')}</table>`;

function hojaHtml(r, intro) {
  const docs = { DNI: 'DNI', CE: 'Carné de extranjería', PASAPORTE: 'Pasaporte' };
  const proveedor = [
    fila('Proveedor', EMPRESA.razon_social),
    EMPRESA.ruc ? fila('RUC', EMPRESA.ruc) : '',
    EMPRESA.direccion ? fila('Dirección', EMPRESA.direccion) : '',
  ];
  const consumidor = [
    ...(r.consumidor_apellidos
      ? [fila('Nombres', r.consumidor_nombres), fila('Apellidos', r.consumidor_apellidos)]
      : [fila('Nombre', r.consumidor_nombre)]),
    fila(docs[r.tipo_documento] || r.tipo_documento, r.numero_documento),
    r.nacionalidad ? fila('Nacionalidad', nombreNacionalidad(r.nacionalidad)) : '',
    fila('Domicilio', r.domicilio),
    fila('Teléfono', r.telefono),
    fila('Correo', r.correo),
    r.es_menor ? fila('Padre, madre o apoderado', r.apoderado) : '',
  ];
  const bien = [
    fila('Tipo', r.bien_tipo),
    fila('Descripción', r.bien_descripcion),
    r.monto != null ? fila('Monto reclamado', soles(r.monto)) : '',
    r.codigo_reserva ? fila('Código de reserva', r.codigo_reserva) : '',
  ];
  const detalle = [fila('Tipo', r.tipo), fila('Detalle', r.detalle), fila('Pedido del consumidor', r.pedido)];
  const respuesta = r.respuesta
    ? seccion('Observaciones y acciones adoptadas por el proveedor', [
        fila('Respuesta', r.respuesta),
        fila('Fecha de respuesta', fechaLarga(r.respondido_en)),
      ])
    : '';

  return `
    <div style="font-family:Arial,sans-serif;color:#243247;max-width:640px;margin:auto">
      <h2 style="color:#0A2540;margin-bottom:4px">Libro de Reclamaciones · Hoja N.° ${escaparHtml(numeroHoja(r))}</h2>
      <p style="margin-top:0;color:#55657A">Registrada el ${escaparHtml(fechaLarga(r.creado_en))}</p>
      ${intro}
      ${seccion('1. Proveedor', proveedor)}
      ${seccion('2. Consumidor reclamante', consumidor)}
      ${seccion('3. Bien contratado', bien)}
      ${seccion('4. Detalle de la reclamación', detalle)}
      ${respuesta}
      <p style="font-size:12px;color:#55657A;margin-top:22px">
        <strong>Reclamo:</strong> disconformidad relacionada con los productos o servicios.
        <strong>Queja:</strong> disconformidad no relacionada con los productos o servicios, o malestar respecto a la atención al público.<br><br>
        El proveedor debe responder en un plazo no mayor a quince (15) días hábiles improrrogables.
        La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo
        para interponer una denuncia ante el INDECOPI.
      </p>
    </div>`;
}

// ---- POST /api/reclamos (público) ----
const limitarReclamos = crearLimitador({
  ventanaMs: 10 * 60_000,
  maximo: 5,
  mensaje: 'Ya registraste varias hojas en pocos minutos. Espera un momento e inténtalo de nuevo.',
});

router.post('/', limitarReclamos, async (req, res, next) => {
  try {
    const v = validar(req.body);
    if (v.errores) {
      return res.status(400).json({
        error: 'Revisa los datos marcados.',
        mensaje: 'Revisa los datos marcados.',
        errores: v.errores,
      });
    }

    const { data: r, error } = await supabase
      .from('reclamos')
      .insert({ ...v.fila, fecha_limite: sumarDiasHabiles(PLAZO_DIAS_HABILES) })
      .select('*')
      .single();

    if (error) {
      if (faltaSql(error)) return noDisponible(res);
      if (error.code === '23514') return fallo(res, 400, 'Algunos datos no son válidos. Revísalos e inténtalo de nuevo.');
      throw error;
    }

    const numero = numeroHoja(r);

    // Copia al consumidor (obligatoria) y aviso a ViajaPerú. Se esperan para poder informar si llegó.
    let correoEnviado = false;
    try {
      await enviarCorreo({
        destinatario: r.correo,
        asunto: `Libro de Reclamaciones - Hoja N.° ${numero} - ${EMPRESA.nombre}`,
        html: hojaHtml(
          r,
          `<p>Registramos tu ${r.tipo.toLowerCase()}. Esta es tu copia. Te responderemos a este correo a más tardar el
           <strong>${escaparHtml(fechaCorta(r.fecha_limite))}</strong>.</p>`
        ),
      });
      correoEnviado = true;
    } catch (e) {
      console.error(`Reclamo ${numero}: no se pudo enviar la copia al consumidor:`, e.message || e);
    }

    const interno = correoInterno();
    if (interno) {
      try {
        await enviarCorreo({
          destinatario: interno,
          asunto: `Nuevo ${r.tipo.toLowerCase()} N.° ${numero} - responder antes del ${fechaCorta(r.fecha_limite)}`,
          html: hojaHtml(r, '<p>Llegó una nueva hoja al Libro de Reclamaciones. Respóndela desde el panel de administración.</p>'),
        });
      } catch (e) {
        console.error(`Reclamo ${numero}: no se pudo avisar a ViajaPerú:`, e.message || e);
      }
    }

    res.status(201).json({
      id: r.id,
      numero,
      tipo: r.tipo,
      creado_en: r.creado_en,
      fecha_limite: r.fecha_limite,
      correo: r.correo,
      correo_enviado: correoEnviado,
    });
  } catch (e) { next(e); }
});

// ---- Administrador ----
router.get('/', requiereSesion(ROLES_ADMIN), async (req, res, next) => {
  try {
    const estado = req.query.estado;
    let q = supabase.from('reclamos').select('*').order('creado_en', { ascending: false }).limit(200);
    if (estado === 'Pendiente' || estado === 'Respondido') q = q.eq('estado', estado);

    const { data, error } = await q;
    if (error) {
      if (faltaSql(error)) return noDisponible(res);
      throw error;
    }
    res.set('Cache-Control', 'no-store');
    res.json(data.map((r) => ({ ...r, numero: numeroHoja(r) })));
  } catch (e) { next(e); }
});

router.post('/:id/respuesta', requiereSesion(ROLES_ADMIN), async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'La hoja no es válida.');

    const respuesta = txt(req.body?.respuesta);
    if (respuesta.length < 10 || respuesta.length > 4000) {
      return fallo(res, 400, 'Escribe la respuesta (entre 10 y 4000 caracteres).');
    }

    // Solo se responde una vez: la condición estado = 'Pendiente' evita pisar una respuesta.
    const { data: r, error } = await supabase
      .from('reclamos')
      .update({ estado: 'Respondido', respuesta, respondido_en: new Date().toISOString(), respondido_por: req.usuario.id })
      .eq('id', id)
      .eq('estado', 'Pendiente')
      .select('*')
      .maybeSingle();

    if (error) {
      if (faltaSql(error)) return noDisponible(res);
      throw error;
    }
    if (!r) return fallo(res, 409, 'Esta hoja no existe o ya fue respondida.');

    const numero = numeroHoja(r);
    let correoEnviado = false;
    try {
      await enviarCorreo({
        destinatario: r.correo,
        asunto: `Respuesta a tu ${r.tipo.toLowerCase()} N.° ${numero} - ${EMPRESA.nombre}`,
        html: hojaHtml(r, `<p>Hola, ${escaparHtml(r.consumidor_nombre)}. Esta es nuestra respuesta a tu ${r.tipo.toLowerCase()}.</p>`),
      });
      correoEnviado = true;
    } catch (e) {
      console.error(`Reclamo ${numero}: se guardó la respuesta, pero falló el correo:`, e.message || e);
    }

    res.json({ ...r, numero, correo_enviado: correoEnviado });
  } catch (e) { next(e); }
});

export default router;
