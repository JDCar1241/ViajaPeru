
import { getSesion, cerrarSesion } from './auth.js';

// Dirección base del backend.
// Si no existe VITE_API_URL, utiliza el proxy de Vite.
const BASE = (import.meta.env.VITE_API_URL || '/api')
  .replace(/\/paquetes\/?$/, '')
  .replace(/\/$/, '');

const TIEMPO_MAX_MS = 60_000;

// ============================================
// FUNCIÓN GENERAL PARA LLAMADAS AL BACKEND
// ============================================

export async function pedir(ruta, { signal, ...opciones } = {}) {
  const s = getSesion();
  const ctrl = new AbortController();

  let vencio = false;

  const reloj = setTimeout(() => {
    vencio = true;
    ctrl.abort();
  }, TIEMPO_MAX_MS);

  const cortar = () => ctrl.abort();

  if (signal) {
    if (signal.aborted) {
      cortar();
    } else {
      signal.addEventListener('abort', cortar, { once: true });
    }
  }

  let r;

  try {
    r = await fetch(BASE + ruta, {
      ...opciones,
      signal: ctrl.signal,
      headers: {
        ...(opciones.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(s ? { Authorization: 'Bearer ' + s.token } : {}),
        ...opciones.headers,
      },
    });
  } catch (e) {
    if (vencio) {
      const err = new Error(
        'El servidor tardó demasiado en responder. Si estabas cobrando, revisa el estado de la reserva antes de repetir el cobro.'
      );
      err.estado = 504;
      throw err;
    }

    if (e.name === 'AbortError') {
      throw e;
    }

    const err = new Error(
      'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
    );
    err.estado = 0;
    throw err;
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener('abort', cortar);
  }

  const datos = await r.json().catch(() => ({}));

  if (!r.ok) {
    const e = new Error(
      datos.mensaje || datos.error || 'Error inesperado'
    );

    e.estado = r.status;

    // No cerrar sesión por credenciales incorrectas al iniciar sesión.
    if (
      r.status === 401 &&
      s &&
      !ruta.startsWith('/auth/login')
    ) {
      cerrarSesion();
    }

    throw e;
  }

  return datos;
}

// ============================================
// ARCHIVOS (PDF de comprobantes)
// Un enlace normal no puede enviar el token: se descarga con fetch y se devuelve un Blob.
// ============================================

export async function pedirArchivo(ruta) {
  const s = getSesion();

  let r;

  try {
    r = await fetch(BASE + ruta, {
      headers: s ? { Authorization: 'Bearer ' + s.token } : {},
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    });
  } catch {
    const err = new Error(
      'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
    );
    err.estado = 0;
    throw err;
  }

  if (!r.ok) {
    const datos = await r.json().catch(() => ({}));
    const e = new Error(datos.mensaje || datos.error || 'No pudimos obtener el archivo.');
    e.estado = r.status;
    if (r.status === 401 && s) cerrarSesion();
    throw e;
  }

  return r.blob();
}

// ============================================
// MÉTODOS HTTP
// ============================================

const post = (ruta, cuerpo) =>
  pedir(ruta, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  });

// ============================================
// CUENTAS
// ============================================

export const iniciarSesion = (correo, clave) =>
  post('/auth/login', { correo, clave });

// El cliente vuelve del enlace de confirmación con un token: inicia sesión y recibe la bienvenida.
export const confirmarCuenta = (token) =>
  post('/auth/confirmado', { token });

export const cambiarClave = (actual, nueva) =>
  post('/auth/cambiar-clave', { actual, nueva });

// ============================================
// RESERVAS
// ============================================

export const crearReserva = (cuerpo) =>
  post('/reservas', cuerpo);

// Guarda los datos que muestra la pantalla de confirmación.
export const ultima = { datos: null };

// ============================================
// PAQUETES
// ============================================

// Listar paquetes con filtros y paginación.
export function listarPaquetes(params = {}, signal) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== '' && v != null
    )
  );

  return pedir(`/paquetes?${qs}`, { signal });
}

// Obtener detalle de un paquete.
export const obtenerPaquete = (id, signal) =>
  pedir(`/paquetes/${encodeURIComponent(id)}`, { signal });

// ============================================
// TIPO DE CAMBIO
// ============================================

// Obtener el tipo de cambio configurado en el backend.
// Respuesta esperada: { usd: 3.75 }
export const obtenerTipoCambio = (signal) =>
  pedir('/paquetes/tipo-cambio', { signal });
