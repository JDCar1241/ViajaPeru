export const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const esDni = (v) => /^\d{8}$/.test(v.trim());
export const esTelefono = (v) => /^\d{9}$/.test(v.trim());
export const noVacio = (v) => v.trim().length > 0;

// Política de contraseña. Mantener igual que claveSegura en backend-turismo/src/comunes.js
export const CLAVE_MAX = 72;
export const criteriosClave = [
  { texto: 'Mínimo 8 caracteres', ok: (c) => c.length >= 8 },
  { texto: 'Una mayúscula', ok: (c) => /[A-Z]/.test(c) },
  { texto: 'Un número', ok: (c) => /\d/.test(c) },
];
export const claveValida = (c) => c.length <= CLAVE_MAX && criteriosClave.every((k) => k.ok(c));