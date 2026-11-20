import { Router } from 'express';
import { supabase, clienteAnon } from '../config/supabase.js';
import { fallo } from '../middlewares/auth.middleware.js';
import { verificarDocumento, ErrorServicio } from '../servicios/verificacion-documentos.js';
import { DOCUMENTOS, esCorreo, claveSegura, MSG_CLAVE, telefonoInternacionalValido } from '../utils/comunes.js';
import { crearLimitador } from '../middlewares/limitar.js';

const router = Router();

const TIPOS = Object.keys(DOCUMENTOS);
const MSG_CORREO = 'El correo electrónico ya se encuentra registrado por otro usuario.';

// Este endpoint es público y cada intento puede gastar consultas y enviar un correo.
// En Render hace falta app.set('trust proxy', 1) en index.js para que req.ip sea la del visitante.
const limitar = crearLimitador({ ventanaMs: 15 * 60 * 1000, maximo: 10 });

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
    if (!telefonoInternacionalValido(b.telefono)) return fallo(res, 400, 'La longitud del teléfono no es la adecuada para el país elegido.');
    if (!claveSegura(b.clave)) return fallo(res, 400, MSG_CLAVE);

    // 1) Datos del documento, con validación de formato
    let doc;
    if (tipo === 'PASAPORTE') {
      if (!Array.isArray(b.mrz) || b.mrz.length !== 2) return fallo(res, 422, 'Escribe las dos líneas de la zona MRZ del pasaporte.');
      doc = { tipo_documento: tipo, mrz: b.mrz };
    } else {
      const numero = String(b.numero_documento || '').trim().toUpperCase();
      if (!DOCUMENTOS[tipo].re.test(numero)) return fallo(res, 422, `Ingrese un ${DOCUMENTOS[tipo].nombre} válido.`);
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