// src/config/culqi.js
const BASE = 'https://api.culqi.com/v2';
// Generoso a propósito: si se corta justo cuando Culqi ya cobró, queda un cargo sin pago registrado.
const TIMEOUT_MS = 30_000;

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

  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llave}`,
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // No sabemos si Culqi llegó a procesar la petición. "sin_respuesta" avisa a quien llama.
    throw new ErrorPasarela(
      'No pudimos confirmar el pago con la pasarela. No repitas el cobro hasta revisar el panel de Culqi.',
      { sin_respuesta: true, motivo: e.name, ruta }
    );
  }
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.object === 'error') {
    throw new ErrorPasarela(
      data.user_message || 'El pago con tarjeta fue rechazado',
      data
    );
  }
  return data;
}

// "centimos" es un ENTERO en la moneda del cargo (S/ 350.50 = 35050; US$ 93.47 = 9347).
// moneda: 'PEN' | 'USD'
export function crearCargo({ centimos, moneda = 'PEN', email, tokenId, descripcion, reservaId, metadata = {} }) {
  return post('/charges', {
    amount: centimos,
    currency_code: moneda,
    email,
    source_id: tokenId,
    description: descripcion,
    metadata: { reserva_id: String(reservaId), ...metadata },
  });
}

// Devuelve el dinero si el cargo salió bien pero no pudimos registrar el pago.
// "centimos" va en la misma moneda del cargo original.
export function reembolsar({ cargoId, centimos }) {
  return post('/refunds', {
    amount: centimos,
    charge_id: cargoId,
    reason: 'solicitud_comprador',
  });
}