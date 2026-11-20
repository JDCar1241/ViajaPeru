// Aceptan null/undefined (perfiles incompletos) sin lanzar errores.
const limpio = (v) => String(v ?? '').trim();
export const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio(v));
export const esDni = (v) => /^\d{8}$/.test(limpio(v));
export const esTelefono = (v) => /^\d{9}$/.test(limpio(v));
export const noVacio = (v) => limpio(v).length > 0;

// Política de contraseña. Mantener igual que claveSegura en backend-turismo/src/utils/comunes.js
export const CLAVE_MAX = 72;
export const criteriosClave = [
  { texto: 'Mínimo 8 caracteres', ok: (c) => c.length >= 8 },
  { texto: 'Una mayúscula', ok: (c) => /[A-Z]/.test(c) },
  { texto: 'Un número', ok: (c) => /\d/.test(c) },
];
export const claveValida = (c) => c.length <= CLAVE_MAX && criteriosClave.every((k) => k.ok(c));