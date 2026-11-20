import { soles } from './moneda.js';

// Formato de soles: una sola implementación (moneda.js). Mantiene el nombre "moneda" para no tocar los componentes.
export const moneda = soles;

// El Back envía fechas ISO 8601. Se muestran siempre en hora de Lima: la salida ocurre en Perú.
export const fecha = iso =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });

export const cupos = n => (n === 1 ? 'Queda 1 cupo' : `Quedan ${n} cupos`);

// Pone la primera letra de cada palabra en mayúscula: "jairo cardenas" -> "Jairo Cardenas"
const cap = s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

// Devuelve solo primer nombre + primer apellido: "Jairo Cardenas"
export function nombreCorto(u) {
  if (!u) return '';
  // Caso ideal: nombres y apellidos vienen por separado (clientes registrados)
  if (u.nombres && u.apellidos) {
    const n = u.nombres.trim().split(/\s+/)[0];
    const a = u.apellidos.trim().split(/\s+/)[0];
    return cap(`${n} ${a}`);
  }
  // Si solo hay un texto con el nombre completo (personal de recepción y gerencia)
  const p = String(u.nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 2) return cap(p.join(' '));
  return cap(`${p[0]} ${p.length >= 4 ? p[2] : p[1]}`);
}