// src/culqi.js
const BASE = 'https://api.culqi.com/v2';

export class ErrorPasarela extends Error {
  constructor(mensajeUsuario, detalle) {
    super(mensajeUsuario);
    this.name = 'ErrorPasarela';
    this.detalle = detalle; // solo para logs del servidor, nunca al Front
  }
}

async function post(ruta, cuerpo) {
  const llave = process.env.CULQI_SECRET_KEY;
  if (!llave) throw new ErrorPasarela('Pasarela no configurada', 'Falta CULQI_SECRET_KEY');

  const res = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llave}`,
    },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.object === 'error') {
    throw new ErrorPasarela(
      data.user_message || 'El pago con tarjeta fue rechazado',
      data
    );
  }
  return data;
}

// monto en soles (ej. 350.5). Culqi pide céntimos enteros.
export function crearCargo({ monto, email, tokenId, descripcion, reservaId }) {
  return post('/charges', {
    amount: Math.round(monto * 100),
    currency_code: 'PEN',
    email,
    source_id: tokenId,
    description: descripcion,
    metadata: { reserva_id: String(reservaId) },
  });
}

// Para devolver el dinero si el cargo salió bien pero no pudimos registrar el pago
export function reembolsar({ cargoId, monto }) {
  return post('/refunds', {
    amount: Math.round(monto * 100),
    charge_id: cargoId,
    reason: 'solicitud_comprador',
  });
}