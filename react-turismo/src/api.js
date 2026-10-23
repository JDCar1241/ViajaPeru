// URL base del Backend (Node.js). Por defecto usa el proxy de Vite (ver vite.config.js).
// Si prefieres CORS directo, crea un .env con: VITE_API_URL=http://localhost:3000/api/paquetes
const API = import.meta.env.VITE_API_URL || '/api/paquetes';

async function pedir(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

/**
 * GET /api/paquetes
 * params: { lugar, fecha_desde, fecha_hasta, ordenar_por, orden, limit, offset }
 * Respuesta esperada: arreglo (puede ser []) de
 *   { id, nombre, foto_url, costo, cupos_disponibles }
 */
export function listarPaquetes(params, signal) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return pedir(`${API}?${qs}`, signal);
}

/**
 * GET /api/paquetes/:id
 * Respuesta esperada:
 *   { id, nombre, foto_url, costo, aclaraciones,
 *     itinerario: [{ hora, descripcion }],
 *     salidas: [{ fecha_inicio_viaje (ISO 8601), cupos_disponibles, estado }] }
 */
export function obtenerPaquete(id, signal) {
  return pedir(`${API}/${id}`, signal);
}