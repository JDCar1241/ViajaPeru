import { getSesion } from './auth.js';

export async function pedir(ruta, opciones = {}) {
  const s = getSesion();
  const r = await fetch('/api' + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(datos.mensaje || 'Error inesperado'); e.estado = r.status; throw e; }
  return datos;
}
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

export const iniciarSesion = (correo, clave) => post('/auth/login', { correo, clave });
export const cambiarClave = (actual, nueva) => post('/auth/cambiar-clave', { actual, nueva });
export const crearReserva = (cuerpo) => post('/reservas', cuerpo);

// Guarda lo que muestra la pantalla de confirmación
export const ultima = { datos: null };