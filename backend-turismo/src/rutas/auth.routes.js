import { Router } from 'express';
import { supabase, clienteAnon } from '../config/supabase.js';
import { requiereSesion, obtenerPerfil, fallo } from '../middlewares/auth.middleware.js';
import { esCorreo, claveSegura, MSG_CLAVE } from '../utils/comunes.js';
import { crearLimitador } from '../middlewares/limitar.js';

const router = Router();
const QUINCE_MIN = 15 * 60 * 1000;

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