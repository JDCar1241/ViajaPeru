export const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const esDni = (v) => /^\d{8}$/.test(v.trim());
export const esTelefono = (v) => /^\d{9}$/.test(v.trim());
export const noVacio = (v) => v.trim().length > 0;

// Criterios mínimos de seguridad (confírmalos con el equipo)
export const criteriosClave = [
  { texto: 'Al menos 8 caracteres', ok: (c) => c.length >= 8 },
  { texto: 'Una mayúscula y una minúscula', ok: (c) => /[A-Z]/.test(c) && /[a-z]/.test(c) },
  { texto: 'Un número', ok: (c) => /\d/.test(c) },
];