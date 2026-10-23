export const moneda = n =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);

// El Back envía fechas ISO 8601; aquí se formatean según la zona horaria del cliente
export const fecha = iso =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

export const cupos = n => (n === 1 ? 'Queda 1 cupo' : `Quedan ${n} cupos`);