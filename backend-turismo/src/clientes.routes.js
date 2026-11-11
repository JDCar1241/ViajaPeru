import { Router } from 'express';
import { supabase, clienteAnon } from './supabase.js';
import { fallo } from './auth.middleware.js';
import { verificarDocumento, ErrorServicio } from './verificacion-documentos.js';

const router = Router();

const TIPOS = ['DNI', 'CE', 'PASAPORTE'];
const NOMBRE_DOC = { DNI: 'DNI', CE: 'carné de extranjería', PASAPORTE: 'pasaporte' };
const MSG_CORREO = 'El correo electrónico ya se encuentra registrado por otro usuario.';

// Dígitos del número nacional por código de país. Mantener igual que PAISES en Registro.jsx
const LARGOS = { '+51': 9, '+1': 10, '+34': 9, '+52': 10, '+54': 10, '+55': 11, '+56': 9, '+57': 10, '+58': 10, '+591': 8, '+593': 9 };
const CODIGOS = Object.keys(LARGOS).sort((a, b) => b.length - a.length);

const esCorreo = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const claveOk = (c) => typeof c === 'string' && c.length >= 8 && c.length <= 72 && /[A-Z]/.test(c) && /\d/.test(c);
function telefonoValido(t) {
  if (typeof t !== 'string' || !/^\+\d{9,15}$/.test(t)) return false;
  const cod = CODIGOS.find((c) => t.startsWith(c));
  return !!cod && t.length - cod.length === LARGOS[cod];
}

// Límite simple por IP: este endpoint es público y cada intento puede gastar consultas y enviar un correo.
// En Render conviene tener app.set('trust proxy', 1) en index.js para que req.ip sea la del visitante.
const intentos = new Map();
function limitar(req, res, next) {
  const ahora = Date.now();
  const VENTANA = 15 * 60 * 1000;
  const MAXIMO = 10;
  if (intentos.size > 1000) intentos.clear();
  const ip = req.ip || 'desconocida';
  const r = intentos.get(ip);
  if (!r || ahora - r.desde > VENTANA) { intentos.set(ip, { n: 1, desde: ahora }); return next(); }
  if (r.n >= MAXIMO) return fallo(res, 429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
  r.n++;
  next();
}

// Devuelve el mensaje de error si ya existe una cuenta con ese correo o ese documento
async function duplicado(tipo, numero, correo) {
  if (correo) {
    const { data } = await supabase.from('perfiles').select('id').eq('correo', correo).maybeSingle();
    if (data) return MSG_CORREO;
  }
  if (numero) {
    const { data } = await supabase.from('perfiles').select('id')
      .eq('tipo_documento', tipo).eq('numero_documento', numero).maybeSingle();
    if (data) return 'Ya existe una cuenta con este documento.';
  }
  return null;
}

// POST /api/clientes/registro
// DNI / CE:   { tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, correo, telefono, clave }
// PASAPORTE:  { tipo_documento: 'PASAPORTE', mrz: [linea1, linea2], correo, telefono, clave }
// El correo de confirmación lo envía Supabase Auth; hasta confirmarlo no se puede iniciar sesión.
router.post('/registro', limitar, async (req, res, next) => {
  try {
    const b = req.body || {};
    const tipo = String(b.tipo_documento || '').toUpperCase();
    if (!TIPOS.includes(tipo)) return fallo(res, 400, 'Elige un tipo de documento válido.');

    const correo = String(b.correo || '').trim().toLowerCase();
    if (!esCorreo(correo)) return fallo(res, 400, 'Escribe un correo válido.');
    if (!telefonoValido(b.telefono)) return fallo(res, 400, 'La longitud del teléfono no es la adecuada para el país elegido.');
    if (!claveOk(b.clave)) return fallo(res, 400, 'La contraseña debe tener mínimo 8 caracteres, al menos una letra mayúscula y un número.');

    // 1) Datos del documento, con validación de formato
    let doc;
    if (tipo === 'PASAPORTE') {
      if (!Array.isArray(b.mrz) || b.mrz.length !== 2) return fallo(res, 422, 'Escribe las dos líneas de la zona MRZ del pasaporte.');
      doc = { tipo_documento: tipo, mrz: b.mrz };
    } else {
      const numero = String(b.numero_documento || '').trim().toUpperCase();
      const formato = tipo === 'DNI' ? /^\d{8}$/ : /^[A-Z0-9]{9,12}$/;
      if (!formato.test(numero)) return fallo(res, 422, `Ingrese un ${NOMBRE_DOC[tipo]} válido.`);
      const nombres = String(b.nombres || '').trim();
      const paterno = String(b.apellido_paterno || '').trim();
      const materno = String(b.apellido_materno || '').trim();
      if (!nombres || !paterno) return fallo(res, 400, 'Escribe tus nombres y tu apellido paterno.');
      if (tipo === 'DNI' && !materno) return fallo(res, 400, 'Escribe tu apellido materno.');
      doc = { tipo_documento: tipo, numero_documento: numero, nombres, apellido_paterno: paterno, apellido_materno: materno };
    }

    // 2) Duplicados ANTES de gastar una consulta externa
    let msg = await duplicado(tipo, doc.numero_documento, correo);
    if (msg) return fallo(res, 409, msg);

    // 3) Verificación del documento
    let v;
    try {
      v = await verificarDocumento(doc);
    } catch (e) {
      if (e instanceof ErrorServicio) {
        console.error('Verificación de documento falló:', e.message);
        return fallo(res, 503, 'No pudimos verificar tu documento en este momento. Inténtalo de nuevo en unos minutos.');
      }
      throw e;
    }
    if (!v.ok) return fallo(res, 422, v.motivo);
    const p = v.persona;

    // En el pasaporte el número sale de la MRZ, así que el duplicado se revisa recién ahora
    if (tipo === 'PASAPORTE') {
      msg = await duplicado(tipo, p.numero_documento, null);
      if (msg) return fallo(res, 409, msg);
    }

    // 4) Crear la cuenta. signUp envía el correo de confirmación (Confirm email debe estar activado en Supabase)
    const front = (process.env.FRONT_URL || process.env.CORS_ORIGIN || '').replace(/\/$/, '');
    const { data, error } = await clienteAnon().auth.signUp({
      email: correo,
      password: b.clave,
      options: front ? { emailRedirectTo: front + '/#/login' } : undefined,
    });
    if (error) {
      console.error('signUp falló:', error.code, error.message);
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
        return fallo(res, 429, 'Se enviaron demasiados correos de confirmación. Inténtalo en unos minutos.');
      }
      if (error.code === 'user_already_exists' || error.code === 'email_exists') return fallo(res, 409, MSG_CORREO);
      if (error.code === 'weak_password') return fallo(res, 400, 'La contraseña es demasiado débil. Prueba con otra.');
      return fallo(res, 502, 'No pudimos enviar el correo de confirmación. Inténtalo más tarde.');
    }
    const usuario = data?.user;
    // Supabase devuelve identities vacío cuando el correo ya tenía cuenta
    if (!usuario || (Array.isArray(usuario.identities) && usuario.identities.length === 0)) return fallo(res, 409, MSG_CORREO);

    // 5) Perfil con rol Cliente. Si falla, se deshace la cuenta para no dejar usuarios a medias.
    const nombreCompleto = [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
    const { error: ePerfil } = await supabase.from('perfiles').upsert({
      id: usuario.id,
      nombre: nombreCompleto,
      nombres: p.nombres,
      rol: 'Cliente',
      correo,
      tipo_documento: p.tipo_documento,
      numero_documento: p.numero_documento,
      apellido_paterno: p.apellido_paterno,
      apellido_materno: p.apellido_materno,
      telefono: b.telefono,
      fecha_nacimiento: p.fecha_nacimiento,
    }, { onConflict: 'id' });
    if (ePerfil) {
      await supabase.auth.admin.deleteUser(usuario.id).catch(() => {});
      if (ePerfil.code === '23505') return fallo(res, 409, 'Ya existe una cuenta con estos datos.');
      throw ePerfil;
    }

    res.status(201).json({ ok: true, mensaje: 'Te enviamos un correo para confirmar tu cuenta.' });
  } catch (e) { next(e); }
});

export default router;