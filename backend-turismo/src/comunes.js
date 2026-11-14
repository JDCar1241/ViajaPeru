// Reglas y utilidades compartidas por todo el Backend.
// Antes estaban copiadas en auth, clientes, reservas, cobros, comprobantes y consultas.

export const ROLES_CAJA = ['Recepcionista', 'Gerente'];

export const txt = (v) => (typeof v === 'string' ? v.trim() : '');
export const idValido = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// ---- Correo ----
export const esCorreo = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

// ---- Contraseña: UNA sola regla para registro y cambio de clave ----
export const MSG_CLAVE = 'La contraseña debe tener entre 8 y 72 caracteres, al menos una mayúscula y un número.';
export const claveSegura = (c) =>
  typeof c === 'string' && c.length >= 8 && c.length <= 72 && /[A-Z]/.test(c) && /\d/.test(c);

// ---- Documentos de identidad: UNA sola definición ----
// Los números se comparan en MAYÚSCULAS: quien llame debe hacer .toUpperCase() antes de probar "re".
// Las longitudes de CE y pasaporte son supuestos del equipo.
export const DOCUMENTOS = {
  DNI: { re: /^\d{8}$/, msg: 'debe tener 8 dígitos', nombre: 'DNI' },
  CE: { re: /^[A-Z0-9]{9,12}$/, msg: 'debe tener entre 9 y 12 letras o números', nombre: 'carné de extranjería' },
  PASAPORTE: { re: /^[A-Z0-9]{6,12}$/, msg: 'debe tener entre 6 y 12 letras o números', nombre: 'pasaporte' },
};

// ---- Fechas ----
export const esFechaISO = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// ---- Teléfonos ----
// Reservas presenciales: 9 dígitos peruanos, sin código de país.
export const esTelefonoPeru = (v) => typeof v === 'string' && /^\d{9}$/.test(v);

// Registro de cuentas: con código de país. Mantener igual que PAISES en Registro.jsx
const LARGOS = { '+51': 9, '+1': 10, '+34': 9, '+52': 10, '+54': 10, '+55': 11, '+56': 9, '+57': 10, '+58': 10, '+591': 8, '+593': 9 };
const CODIGOS = Object.keys(LARGOS).sort((a, b) => b.length - a.length);
export function telefonoInternacionalValido(t) {
  if (typeof t !== 'string' || !/^\+\d{9,15}$/.test(t)) return false;
  const cod = CODIGOS.find((c) => t.startsWith(c));
  return !!cod && t.length - cod.length === LARGOS[cod];
}
