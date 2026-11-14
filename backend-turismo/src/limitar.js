import { fallo } from './auth.middleware.js';

// Limitador simple en memoria (suficiente mientras haya una sola instancia en Render).
// Uso: const limitar = crearLimitador({ ventanaMs: 60_000, maximo: 20, clave: (req) => req.usuario.id });
export function crearLimitador({
  ventanaMs,
  maximo,
  clave = (req) => req.ip || 'desconocida',
  mensaje = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
}) {
  const registros = new Map();

  return (req, res, next) => {
    const ahora = Date.now();

    if (registros.size > 5000) {
      for (const [k, v] of registros) if (ahora - v.desde > ventanaMs) registros.delete(k);
      if (registros.size > 5000) registros.clear();
    }

    const k = clave(req);
    const r = registros.get(k);
    if (!r || ahora - r.desde > ventanaMs) {
      registros.set(k, { n: 1, desde: ahora });
      return next();
    }
    if (r.n >= maximo) return fallo(res, 429, mensaje);
    r.n++;
    next();
  };
}