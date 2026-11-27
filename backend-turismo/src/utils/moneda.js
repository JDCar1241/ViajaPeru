// Moneda de las reservas (supabase/17-moneda.sql).
// reservas.total siempre está en SOLES; una reserva en USD guarda además total_moneda (su precio en
// dólares) y el tipo_cambio fijado al reservar. Los cobros en dólares de esa reserva usan SU tipo de
// cambio (no el del día), y si se paga todo se cobra exactamente su precio en dólares.

export const MONEDAS = ['PEN', 'USD'];

export const esUsd = (reserva) => reserva?.moneda === 'USD' && Number(reserva?.tipo_cambio) > 0;

// Tipo de cambio que se aplica a una reserva: el suyo (USD) o el vigente (PEN).
export const tipoCambioDe = (reserva, tcVigente) => (esUsd(reserva) ? Number(reserva.tipo_cambio) : tcVigente);

// Céntimos de sol -> céntimos de dólar para esta reserva.
export function aCentimosUsd(centSoles, reserva, tcVigente) {
  if (esUsd(reserva) && centSoles === Math.round(Number(reserva.total) * 100)) {
    return Math.round(Number(reserva.total_moneda) * 100);
  }
  const tc = tipoCambioDe(reserva, tcVigente);
  return tc ? Math.round(centSoles / tc) : 0;
}

// Importe con su símbolo: "S/ 1,500.00" o "US$ 400.00"
export const formatoMoneda = (n, moneda = 'PEN') =>
  moneda === 'USD'
    ? 'US$ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
