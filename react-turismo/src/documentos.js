// Tipos de documento y reglas. Mantener iguales a backend/reservas.routes.js
// (las longitudes de CE y pasaporte son supuestos: confírmalas con el equipo)
export const TIPOS = [
  { valor: 'DNI', texto: 'DNI' },
  { valor: 'CE', texto: 'Carné de extranjería' },
  { valor: 'PASAPORTE', texto: 'Pasaporte' },
];

const REGLAS = {
  DNI: { re: /^\d{8}$/, msg: 'El DNI tiene 8 dígitos.' },
  CE: { re: /^[A-Za-z0-9]{9,12}$/, msg: 'El carné de extranjería tiene entre 9 y 12 letras o números.' },
  PASAPORTE: { re: /^[A-Za-z0-9]{6,12}$/, msg: 'El pasaporte tiene entre 6 y 12 letras o números.' },
};

export const validarDocumento = (tipo, nro) =>
  REGLAS[tipo] ? (REGLAS[tipo].re.test((nro || '').trim()) ? '' : REGLAS[tipo].msg) : 'Elige un tipo de documento.';

// Solo deja caracteres válidos según el tipo mientras se escribe
export const limpiarDocumento = (tipo, v) =>
  tipo === 'DNI' ? v.replace(/\D/g, '').slice(0, 8) : v.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);

// Edad cumplida en la fecha de la salida
export function edadAl(nacimiento, referencia) {
  const n = new Date(`${nacimiento}T00:00:00Z`);
  const r = new Date(referencia);
  let e = r.getUTCFullYear() - n.getUTCFullYear();
  const m = r.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < n.getUTCDate())) e--;
  return e;
}

export function validarNacimiento(nac, fechaSalida) {
  if (!nac) return 'Escribe la fecha de nacimiento.';
  const d = new Date(`${nac}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== nac) return 'La fecha no es válida.';
  if (d > new Date()) return 'La fecha no puede ser futura.';
  if (edadAl(nac, fechaSalida) > 110) return 'Revisa la fecha de nacimiento.';
  return '';
}