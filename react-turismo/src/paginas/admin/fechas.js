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
