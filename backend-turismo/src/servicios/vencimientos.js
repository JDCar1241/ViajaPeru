import { supabase } from '../config/supabase.js';

// Apartado de cupos de la compra online (supabase/16-apartar-cupos.sql):
//   - 30 minutos para completar los datos (reserva 'Borrador')
//   - luego 30 minutos para pagar (reserva 'Pendiente')
// Si vence, la reserva pasa a 'Vencida' y sus cupos vuelven a la salida.
export const MINUTOS_APARTADO = 30;
export const MINUTOS_PAGO = 30;

// La liberación la hace pg_cron cada minuto (si está programado). Por si no lo está, el Backend
// también la pide al consultar paquetes y reservas, como máximo una vez cada 30 segundos.
const CADA_MS = 30_000;
let ultima = 0;

export async function liberarVencidas() {
  const ahora = Date.now();
  if (ahora - ultima < CADA_MS) return;
  ultima = ahora;
  const { error } = await supabase.rpc('liberar_reservas_vencidas', { p_salida_id: null });
  // No debe romper la consulta: si falta ejecutar el SQL 16 solo se deja constancia.
  if (error) console.error('No se pudieron liberar las reservas vencidas:', error.message);
}

// ¿Ya venció el plazo de la reserva? (expira_en NULL = no vence, p. ej. reserva presencial)
export const vencida = (expiraEn) => !!expiraEn && new Date(expiraEn).getTime() <= Date.now();
