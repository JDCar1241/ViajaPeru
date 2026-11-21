import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { supabase, clienteAnon } from '../config/supabase.js';
import { requiereSesion, obtenerPerfil, fallo } from '../middlewares/auth.middleware.js';
import { esCorreo, claveSegura, MSG_CLAVE } from '../utils/comunes.js';
import { crearLimitador } from '../middlewares/limitar.js';
import { enviarCorreo } from '../servicios/correo.js';

const router = Router();
const QUINCE_MIN = 15 * 60 * 1000;

const limitarConfirmado = crearLimitador({ ventanaMs: QUINCE_MIN, maximo: 20 });

const escapar = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Respuesta de sesión: la misma forma que devuelve /login
const respuestaSesion = (token, perfil) => ({
  token,
  usuario: {
    nombre: perfil.nombre,
    rol: perfil.rol,
    nombres: perfil.nombres || undefined,
    apellidos: perfil.apellido_paterno || undefined,
  },
});

// POST /api/auth/confirmado  { token }  -> { token, usuario, bienvenida }
// Lo llama el Front cuando el cliente vuelve desde el enlace de confirmación del correo
// (Supabase entrega un access_token en la URL). Inicia la sesión y envía el correo de
// bienvenida UNA sola vez (se marca en user_metadata.bienvenida_enviada).
router.post('/confirmado', limitarConfirmado, async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return fallo(res, 400, 'Falta el token de confirmación.');

    const { data, error } = await supabase.auth.getUser(token);
    const usuario = data?.user;
    if (error || !usuario) {
      return fallo(res, 401, 'El enlace de confirmación venció. Inicia sesión con tu correo y contraseña.');
    }
    if (!usuario.email_confirmed_at) {
      return fallo(res, 403, 'Tu correo todavía no está confirmado.');
    }

    const perfil = await obtenerPerfil(usuario.id);
    if (!perfil) return fallo(res, 403, 'Tu usuario no tiene un rol asignado.');

    let bienvenida = false;
    const meta = usuario.user_metadata || {};

    if (perfil.rol === 'Cliente' && !meta.bienvenida_enviada) {
      try {
        const nombre = escapar(perfil.nombres || perfil.nombre);
        await enviarCorreo({
          destinatario: usuario.email,
          asunto: 'Bienvenido a ViajaPerú',
          html: `
            <div style="font-family:Arial,sans-serif;color:#243247;max-width:600px;margin:auto">
              <h2 style="color:#1456D6">¡Bienvenido a ViajaPerú, ${nombre}!</h2>
              <p>Tu cuenta quedó confirmada. Ya puedes reservar y pagar tus paquetes turísticos en línea.</p>
              <p>Desde <strong>Mis reservas</strong> puedes ver tus viajes, pagarlos y descargar tus comprobantes.</p>
              <p>Gracias por elegirnos.</p>
            </div>`,
        });
        await supabase.auth.admin.updateUserById(usuario.id, {
          user_metadata: { ...meta, bienvenida_enviada: true },
        });
        bienvenida = true;
      } catch (e) {
        // La sesión no depende del correo: si falla, se intenta otra vez en la próxima confirmación.
        console.error('No se pudo enviar el correo de bienvenida:', e.message || e);
      }
    }

    res.json({ ...respuestaSesion(token, perfil), bienvenida });
  } catch (e) { next(e); }
});

// Por IP + correo, para no bloquear a toda una oficina que comparte internet
const limitarLogin = crearLimitador({
  ventanaMs: QUINCE_MIN,
  maximo: 10,
  clave: (req) => `${req.ip}:${String(req.body?.correo || '').trim().toLowerCase()}`,
});
const limitarCambio = crearLimitador({ ventanaMs: QUINCE_MIN, maximo: 5, clave: (req) => req.usuario.id });

// POST /api/auth/login  { correo, clave } -> { token, usuario: { nombre, rol, nombres, apellidos } }
router.post('/login', limitarLogin, async (req, res, next) => {
  try {
    const { correo, clave } = req.body || {};
    if (!esCorreo(correo)) return fallo(res, 400, 'El correo no tiene un formato válido.');
    if (typeof clave !== 'string' || !clave) return fallo(res, 400, 'La contraseña no puede estar vacía.');

    const { data, error } = await clienteAnon().auth.signInWithPassword({ email: correo.trim(), password: clave });

    // Cuenta creada pero con el correo todavía sin confirmar (clientes que se registraron por su cuenta)
    if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) {
      return fallo(res, 403, 'Confirma tu correo para poder iniciar sesión. Revisa tu bandeja de entrada y la carpeta de spam.');
    }
    if (error || !data?.session) return fallo(res, 401, 'Correo o contraseña incorrectos.');

    const perfil = await obtenerPerfil(data.user.id);
    if (!perfil) return fallo(res, 403, 'Tu usuario no tiene un rol asignado.');

    res.json({
      token: data.session.access_token,
      usuario: {
        nombre: perfil.nombre,
        rol: perfil.rol,
        nombres: perfil.nombres || undefined,
        apellidos: perfil.apellido_paterno || undefined,
      },
    });
  } catch (e) { next(e); }
});

// =============================================
// CAMBIAR CONTRASEÑA CON CÓDIGO POR CORREO
// 1) POST /api/auth/cambiar-clave/codigo  { actual }            -> envía un código de 6 dígitos
// 2) POST /api/auth/cambiar-clave         { actual, nueva, codigo } -> cambia la contraseña
// El código vale 10 minutos y admite 5 intentos. Se guarda solo su hash, en memoria
// (como los limitadores: basta con una instancia; si el servidor se reinicia, se pide otro).
// =============================================

const DIEZ_MIN = 10 * 60 * 1000;
const MAX_INTENTOS_CODIGO = 5;
const codigosClave = new Map(); // usuarioId -> { hash, expira, intentos, enviado }

const hashCodigo = (usuarioId, codigo) =>
  createHash('sha256').update(`${usuarioId}:${codigo}`).digest();

const ocultarCorreo = (c = '') => c.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

const limitarCodigo = crearLimitador({
  ventanaMs: QUINCE_MIN,
  maximo: 5,
  clave: (req) => req.usuario.id,
  mensaje: 'Pediste demasiados códigos. Espera unos minutos e inténtalo de nuevo.',
});

async function claveActualCorrecta(correo, actual) {
  const { error } = await clienteAnon().auth.signInWithPassword({ email: correo, password: actual });
  return !error;
}

// POST /api/auth/cambiar-clave/codigo  { actual }
router.post('/cambiar-clave/codigo', requiereSesion(), limitarCodigo, async (req, res, next) => {
  try {
    const actual = req.body?.actual;
    if (typeof actual !== 'string' || !actual) return fallo(res, 400, 'Escribe tu contraseña actual.');
    if (!req.usuario.correo) return fallo(res, 400, 'Tu cuenta no tiene un correo registrado.');

    if (!(await claveActualCorrecta(req.usuario.correo, actual))) {
      return fallo(res, 422, 'La contraseña actual no es correcta.');
    }

    // Un minuto entre envíos para no llenar la bandeja
    const previo = codigosClave.get(req.usuario.id);
    if (previo && Date.now() - previo.enviado < 60_000) {
      return fallo(res, 429, 'Espera un minuto antes de pedir otro código.');
    }

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    codigosClave.set(req.usuario.id, {
      hash: hashCodigo(req.usuario.id, codigo),
      expira: Date.now() + DIEZ_MIN,
      intentos: 0,
      enviado: Date.now(),
    });

    try {
      await enviarCorreo({
        destinatario: req.usuario.correo,
        asunto: `${codigo} es tu código para cambiar la contraseña - ViajaPerú`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#0F1B2D;max-width:600px;margin:auto">
            <h2 style="color:#0A2540">Código para cambiar tu contraseña</h2>
            <p>Hola ${escapar(req.usuario.nombre || '')}, usa este código para confirmar el cambio de contraseña en ViajaPerú:</p>
            <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1456D6;margin:24px 0">${codigo}</p>
            <p>Vence en 10 minutos. Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>
          </div>
        `,
      });
    } catch (e) {
      codigosClave.delete(req.usuario.id);
      console.error('No se pudo enviar el código de cambio de contraseña:', e.message || e);
      return fallo(res, 502, 'No pudimos enviar el código a tu correo. Inténtalo de nuevo.');
    }

    res.json({ ok: true, correo: ocultarCorreo(req.usuario.correo), vence_en_min: 10 });
  } catch (e) { next(e); }
});

// POST /api/auth/cambiar-clave  { actual, nueva, codigo }
router.post('/cambiar-clave', requiereSesion(), limitarCambio, async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    const codigo = String(req.body?.codigo ?? '').replace(/\s+/g, '');
    if (typeof actual !== 'string' || !actual) return fallo(res, 400, 'Escribe tu contraseña actual.');
    if (!claveSegura(nueva)) return fallo(res, 400, MSG_CLAVE);
    if (nueva === actual) return fallo(res, 400, 'La nueva contraseña debe ser distinta de la actual.');
    if (!/^\d{6}$/.test(codigo)) return fallo(res, 400, 'Escribe el código de 6 dígitos que te enviamos.');

    // Verificar el código del correo
    const reg = codigosClave.get(req.usuario.id);
    if (!reg || Date.now() > reg.expira) {
      codigosClave.delete(req.usuario.id);
      return fallo(res, 410, 'El código venció. Pide uno nuevo.');
    }
    if (reg.intentos >= MAX_INTENTOS_CODIGO) {
      codigosClave.delete(req.usuario.id);
      return fallo(res, 429, 'Demasiados intentos con este código. Pide uno nuevo.');
    }
    if (!timingSafeEqual(reg.hash, hashCodigo(req.usuario.id, codigo))) {
      reg.intentos++;
      const quedan = MAX_INTENTOS_CODIGO - reg.intentos;
      return fallo(res, 422, quedan > 0
        ? `El código no es correcto. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`
        : 'El código no es correcto. Pide uno nuevo.');
    }

    // La contraseña actual se vuelve a comprobar (pudo cambiar mientras tanto)
    if (!(await claveActualCorrecta(req.usuario.correo, actual))) {
      return fallo(res, 422, 'La contraseña actual no es correcta.');
    }

    const { error } = await supabase.auth.admin.updateUserById(req.usuario.id, { password: nueva });
    if (error) return fallo(res, 400, 'No se pudo cambiar la contraseña. Prueba con otra.');
    codigosClave.delete(req.usuario.id);

    // Aviso de seguridad (en segundo plano)
    enviarCorreo({
      destinatario: req.usuario.correo,
      asunto: 'Tu contraseña de ViajaPerú cambió',
      html: `
        <div style="font-family:Arial,sans-serif;color:#0F1B2D;max-width:600px;margin:auto">
          <h2 style="color:#0A2540">Tu contraseña cambió</h2>
          <p>Hola ${escapar(req.usuario.nombre || '')}, la contraseña de tu cuenta de ViajaPerú se cambió correctamente.</p>
          <p>Si no fuiste tú, comunícate con ViajaPerú de inmediato.</p>
        </div>
      `,
    }).catch((e) => console.error('No se pudo enviar el aviso de cambio de contraseña:', e.message || e));

    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;