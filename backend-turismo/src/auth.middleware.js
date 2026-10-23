import { supabase } from './supabase.js';

// Responde con { error, mensaje } (el Front lee "mensaje")
export const fallo = (res, estado, texto) => res.status(estado).json({ error: texto, mensaje: texto });

// Uso: router.post('/', requiereSesion(['Recepcionista', 'Gerente']), ...)
export const requiereSesion = (rolesPermitidos = null) => async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fallo(res, 401, 'Debes iniciar sesión.');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return fallo(res, 401, 'Tu sesión venció. Inicia sesión de nuevo.');

    const { data: perfil } = await supabase
      .from('perfiles').select('nombre, rol').eq('id', data.user.id).maybeSingle();
    if (!perfil) return fallo(res, 403, 'Tu usuario no tiene un rol asignado.');
    if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) {
      return fallo(res, 403, 'Tu rol no tiene permiso para esta acción.');
    }

    req.usuario = { id: data.user.id, correo: data.user.email, nombre: perfil.nombre, rol: perfil.rol };
    next();
  } catch (e) { next(e); }
};