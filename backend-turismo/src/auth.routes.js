import { Router } from 'express';
import { supabase, clienteAnon } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const esCorreo = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const claveSegura = (c) => typeof c === 'string' && c.length >= 8 && /[A-Z]/.test(c) && /[a-z]/.test(c) && /\d/.test(c);

// POST /api/auth/login  { correo, clave } -> { token, usuario: { nombre, rol } }
router.post('/login', async (req, res, next) => {
  try {
    const { correo, clave } = req.body || {};
    if (!esCorreo(correo)) return fallo(res, 400, 'El correo no tiene un formato válido.');
    if (!clave) return fallo(res, 400, 'La contraseña no puede estar vacía.');

    const { data, error } = await clienteAnon().auth.signInWithPassword({ email: correo.trim(), password: clave });
    if (error || !data?.session) return fallo(res, 401, 'Correo o contraseña incorrectos.');

    const { data: perfil } = await supabase
      .from('perfiles').select('nombre, rol').eq('id', data.user.id).maybeSingle();
    if (!perfil) return fallo(res, 403, 'Tu usuario no tiene un rol asignado.');

    res.json({ token: data.session.access_token, usuario: { nombre: perfil.nombre, rol: perfil.rol } });
  } catch (e) { next(e); }
});

// POST /api/auth/cambiar-clave  { actual, nueva }
router.post('/cambiar-clave', requiereSesion(), async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    if (!actual) return fallo(res, 400, 'Escribe tu contraseña actual.');
    if (!claveSegura(nueva)) return fallo(res, 400, 'La nueva contraseña debe tener 8 caracteres, mayúscula, minúscula y número.');

    const { error: errActual } = await clienteAnon().auth.signInWithPassword({ email: req.usuario.correo, password: actual });
    if (errActual) return fallo(res, 401, 'La contraseña actual no es correcta.');

    const { error } = await supabase.auth.admin.updateUserById(req.usuario.id, { password: nueva });
    if (error) return fallo(res, 400, 'No se pudo cambiar la contraseña. Prueba con otra.');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;