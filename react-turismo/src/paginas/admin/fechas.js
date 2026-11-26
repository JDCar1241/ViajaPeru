// Utilidades de fecha para las pantallas del Administrador (siempre en hora de Lima, UTC-5).

const LIMA_MS = 5 * 60 * 60 * 1000;

export const fechaHoraLima = (v) =>
  v
    ? new Date(v).toLocaleString('es-PE', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
      })
    : '';

// ISO -> "YYYY-MM-DDTHH:mm" en hora de Lima, para <input type="datetime-local">
export const aInputLima = (iso) => new Date(new Date(iso).getTime() - LIMA_MS).toISOString().slice(0, 16);

// Mínimo para el selector: ahora mismo en Lima (no se permiten fechas pasadas)
export const ahoraLima = () => aInputLima(new Date().toISOString());

export const soles = (n) =>
  Number(n).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

// Hoy en Lima "YYYY-MM-DD" (mínimo del selector de fecha de salida)
export const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// ISO -> "YYYY-MM-DD" en hora de Lima, para <input type="date">
export const aDiaLima = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Límite de cupos por salida (igual que MAX_CUPOS en backend-turismo/src/rutas/admin-catalogo.routes.js)
export const MAX_CUPOS = 40;

// Itinerario: una actividad = { dia, hora: "HH:mm" (24 h), descripcion }
export const MAX_DIAS = 30;

// Horas antiguas escritas a mano ("6:00 am", "6 pm", "06:30") -> "HH:mm". Si no se entiende, ''.
export function normalizarHora(texto) {
  const t = String(texto || '').trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/);
  if (!m) return '';
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const sufijo = (m[3] || '').replace(/[\s.]/g, '');
  if (sufijo === 'pm' && h < 12) h += 12;
  if (sufijo === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Orden cronológico (día y hora), igual que el Backend
export const ordenarItinerario = (it) =>
  it
    .map((a, k) => ({ a, k }))
    .sort((x, y) => (Number(x.a.dia) || 1) - (Number(y.a.dia) || 1)
      || String(x.a.hora).localeCompare(String(y.a.hora))
      || x.k - y.k)
    .map(({ a }) => a);

// Hora de salida = primera actividad del Día 1 (o null si no hay itinerario válido)
export const horaDeSalida = (it) => {
  const primera = Array.isArray(it) && it.length ? ordenarItinerario(it)[0] : null;
  return primera && /^([01]\d|2[0-3]):[0-5]\d$/.test(primera.hora) ? primera.hora : null;
};
