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

// POST /api/auth/cambiar-clave  { actual, nueva }
router.post('/cambiar-clave', requiereSesion(), limitarCambio, async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    if (typeof actual !== 'string' || !actual) return fallo(res, 400, 'Escribe tu contraseña actual.');
    if (!claveSegura(nueva)) return fallo(res, 400, MSG_CLAVE);
    if (nueva === actual) return fallo(res, 400, 'La nueva contraseña debe ser distinta de la actual.');

    const { error: errActual } = await clienteAnon().auth.signInWithPassword({ email: req.usuario.correo, password: actual });
    if (errActual) return fallo(res, 422, 'La contraseña actual no es correcta.');

    const { error } = await supabase.auth.admin.updateUserById(req.usuario.id, { password: nueva });
    if (error) return fallo(res, 400, 'No se pudo cambiar la contraseña. Prueba con otra.');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;