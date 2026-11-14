import { getSesion, cerrarSesion } from './auth.js';

// Dirección base del Backend. Acepta el valor antiguo de VITE_API_URL (que terminaba en /paquetes).
// Sin variable, usa el proxy de Vite (ver vite.config.js). Ejemplo en .env: VITE_API_URL=http://localhost:3000/api
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/paquetes\/?$/, '').replace(/\/$/, '');
const TIEMPO_MAX_MS = 60_000; // mayor que los 30 s que el Backend espera a Culqi

// Llama al Backend con la sesión (si hay). "ruta" empieza con "/", por ejemplo "/reservas/5".
export async function pedir(ruta, { signal, ...opciones } = {}) {
  const s = getSesion();
  const ctrl = new AbortController();
  let vencio = false;
  const reloj = setTimeout(() => { vencio = true; ctrl.abort(); }, TIEMPO_MAX_MS);
  const cortar = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) cortar();
    else signal.addEventListener('abort', cortar, { once: true });
  }

  let r;
  try {
    r = await fetch(BASE + ruta, {
      ...opciones,
      signal: ctrl.signal,
      headers: {
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...(s ? { Authorization: 'Bearer ' + s.token } : {}),
      },
    });
  } catch (e) {
    if (vencio) {
      const err = new Error('El servidor tardó demasiado en responder. Si estabas cobrando, revisa el estado de la reserva antes de repetir el cobro.');
      err.estado = 504;
      throw err;
    }
    if (e.name === 'AbortError') throw e; // lo canceló la pantalla al cambiar de vista
    const err = new Error('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    err.estado = 0;
    throw err;
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener('abort', cortar);
  }

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.mensaje || datos.error || 'Error inesperado');
    e.estado = r.status;
    // 401 = sesión vencida. En /auth/* el 401 significa credenciales incorrectas, no sesión vencida.
    if (r.status === 401 && s && !ruta.startsWith('/auth/')) cerrarSesion();
    throw e;
  }
  return datos;
}

const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

// ---- Cuentas ----
export const iniciarSesion = (correo, clave) => post('/auth/login', { correo, clave });
export const cambiarClave = (actual, nueva) => post('/auth/cambiar-clave', { actual, nueva });

// ---- Reservas ----
export const crearReserva = (cuerpo) => post('/reservas', cuerpo);
// Guarda lo que muestra la pantalla de confirmación
export const ultima = { datos: null };

// ---- Paquetes ----
// params: { lugar, fecha_desde, fecha_hasta, ordenar_por, orden, limit, offset }
// -> arreglo (puede ser []) de { id, nombre, foto_url, costo, cupos_disponibles, proxima_salida }
export function listarPaquetes(params, signal) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return pedir(`/paquetes?${qs}`, { signal });
}

// -> { id, nombre, foto_url, costo, aclaraciones, itinerario: [{ hora, descripcion }],
//      salidas: [{ fecha_inicio_viaje (ISO 8601), cupos_disponibles, estado }] }
export const obtenerPaquete = (id, signal) => pedir(`/paquetes/${encodeURIComponent(id)}`, { signal });