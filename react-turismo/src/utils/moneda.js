export const soles = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
export const dolaresFmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
// Trabajamos en céntimos para evitar errores de decimales
export const cent = (v) => Math.round((parseFloat(v) || 0) * 100);

// Importe en su moneda: "S/ 1,500.00" o "US$400.00" (cada paquete tiene la suya, ver 17-moneda.sql)
export const importe = (n, moneda = 'PEN') => (moneda === 'USD' ? dolaresFmt(n) : soles(n));

// Total de una reserva en la moneda del paquete. reservas.total siempre está en soles;
// las reservas en USD traen además total_moneda (su precio en dólares) y tipo_cambio.
export const esUsd = (r) => r?.moneda === 'USD' && Number(r?.tipo_cambio) > 0;
export const totalReserva = (r) => (esUsd(r) ? dolaresFmt(r.total_moneda) : soles(r?.total));
// "US$400.00 (S/ 1,500.00 al tipo de cambio 3.75)" o solo "S/ 100.00"
export const totalReservaDetalle = (r) =>
  esUsd(r)
    ? `${dolaresFmt(r.total_moneda)} (${soles(r.total)} al tipo de cambio ${Number(r.tipo_cambio).toFixed(2)})`
    : soles(r?.total);
