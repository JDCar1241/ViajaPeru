// Único punto de contacto con Factiliza (RENIEC, Migraciones y SUNAT).
// La llave FACTILIZA_TOKEN vive solo en el .env del Backend y en las variables de Render.

const BASE = 'https://api.factiliza.com/v1';
const TIMEOUT_MS = 8000;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // "DNI:12345678" -> { datos, expira }. Evita gastar consultas al reintentar.

// El servicio externo falló (no es culpa del usuario): se responde 502/503, no 400/422.
export class ErrorServicio extends Error {}

// Devuelve { ok, estado, cuerpo }. Lanza ErrorServicio si no hay llave, no hay conexión o se agota el tiempo.
export async function consultarFactiliza(ruta) {
  const token = process.env.FACTILIZA_TOKEN;
  if (!token) throw new ErrorServicio('Falta FACTILIZA_TOKEN en el .env');

  let res;
  try {
    res = await fetch(BASE + ruta, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ErrorServicio('Sin conexión con Factiliza: ' + (e.name === 'TimeoutError' ? 'tiempo agotado' : e.message));
  }
  const cuerpo = await res.json().catch(() => ({}));
  return { ok: res.ok, estado: res.status, cuerpo };
}

// DNI o carné de extranjería -> { nombres, apellidos } | null si el documento no existe.
export async function consultarPersona(tipo, numero) {
  const clave = `${tipo}:${numero}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.expira > Date.now()) return guardado.datos;

  const ruta = (tipo === 'DNI' ? '/dni/info/' : '/cee/info/') + encodeURIComponent(numero);
  const r = await consultarFactiliza(ruta);

  if (r.estado === 400 || r.estado === 404) return null; // el documento no existe
  const d = r.cuerpo?.data;
  if (!r.ok || !d) throw new ErrorServicio(`Factiliza respondió ${r.estado}: ${JSON.stringify(r.cuerpo)}`);

  const apellidoPaterno = String(d.apellido_paterno || '').trim();
  const apellidoMaterno = String(d.apellido_materno || '').trim();
  const datos = {
    nombres: String(d.nombres || '').trim(),
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    apellidos: [apellidoPaterno, apellidoMaterno].filter(Boolean).join(' '),
  };
  if (!datos.nombres && !datos.apellidos) return null;

  if (cache.size > 500) cache.clear();
  cache.set(clave, { datos, expira: Date.now() + TTL_MS });
  return datos;
}