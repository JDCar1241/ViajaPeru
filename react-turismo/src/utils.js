export const moneda = n =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);

// El Back envía fechas ISO 8601; aquí se formatean según la zona horaria del cliente
export const fecha = iso =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

export const cupos = n => (n === 1 ? 'Queda 1 cupo' : `Quedan ${n} cupos`);

// Pone la primera letra de cada palabra en mayúscula: "jairo cardenas" -> "Jairo Cardenas"
const cap = s => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

// Devuelve solo primer nombre + primer apellido: "Jairo Cardenas"
export function nombreCorto(u) {
  if (!u) return '';
  // Caso ideal: nombres y apellidos vienen por separado
  if (u.nombres && u.apellidos) {
    const n = u.nombres.trim().split(/\s+/)[0];
    const a = u.apellidos.trim().split(/\s+/)[0];
    return cap(`${n} ${a}`);
  }
  // Si solo hay un texto con el nombre completo
  const p = String(u.nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 2) return cap(p.join(' '));
  return cap(`${p[0]} ${p.length >= 4 ? p[2] : p[1]}`);
}