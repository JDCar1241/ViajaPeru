import { analizarMrz } from './mrz.js';

// Verifica la identidad de quien se registra:
//   DNI y carné de extranjería -> consulta a Factiliza (RENIEC y Migraciones) y compara los nombres
//   Pasaporte                  -> validación de la zona MRZ (mrz.js). No certifica autenticidad.
// La llave FACTILIZA_TOKEN vive solo en el .env del Backend y en las variables de Render.

const BASE = 'https://api.factiliza.com/v1';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // "DNI:12345678" -> { datos, expira }. Evita gastar consultas si reintentan el registro.

const NOMBRE_DOC = { DNI: 'DNI', CE: 'carné de extranjería', PASAPORTE: 'pasaporte' };

// El servicio externo falló (no es culpa del usuario): se responde 503, no 422.
export class ErrorServicio extends Error {}

// Sin tildes, en mayúsculas y solo letras (la Ñ pasa a N, igual que en la MRZ)
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
// Compara sin importar el orden de las palabras
const conjunto = (t) => normalizar(t).split(' ').filter(Boolean).sort().join(' ');

async function consultar(tipo, numero) {
  const clave = `${tipo}:${numero}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.expira > Date.now()) return guardado.datos;

  const token = process.env.FACTILIZA_TOKEN;
  if (!token) throw new ErrorServicio('Falta FACTILIZA_TOKEN en el .env');

  const ruta = tipo === 'DNI' ? `/dni/info/${encodeURIComponent(numero)}` : `/cee/info/${encodeURIComponent(numero)}`;
  let res;
  try {
    res = await fetch(BASE + ruta, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new ErrorServicio('Sin conexión con Factiliza: ' + e.message);
  }
  const cuerpo = await res.json().catch(() => ({}));

  if (res.status === 400 || res.status === 404) return null; // el documento no existe
  if (!res.ok || !cuerpo?.data) throw new ErrorServicio(`Factiliza respondió ${res.status}: ${JSON.stringify(cuerpo)}`);

  const d = cuerpo.data;
  const datos = {
    nombres: d.nombres,
    apellidos: [d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' '),
  };
  cache.set(clave, { datos, expira: Date.now() + TTL_MS });
  return datos;
}

// Devuelve { ok: true, persona } o { ok: false, motivo }. Lanza ErrorServicio si el servicio externo falla.
export async function verificarDocumento(doc) {
  if (doc.tipo_documento === 'PASAPORTE') {
    const r = analizarMrz(doc.mrz?.[0], doc.mrz?.[1]);
    if (r.incompleto) return { ok: false, motivo: 'Escribe las dos líneas de la zona MRZ (44 caracteres cada una).' };
    if (!r.ok) return { ok: false, motivo: r.errores[0] };
    const d = r.datos;
    return {
      ok: true,
      persona: {
        tipo_documento: 'PASAPORTE',
        numero_documento: d.numero,
        nombres: d.nombres,
        apellido_paterno: d.apellidos, // la MRZ no separa paterno y materno
        apellido_materno: null,
        fecha_nacimiento: d.fecha_nacimiento,
      },
    };
  }

  // DNI o carné de extranjería
  const invalido = { ok: false, motivo: `Ingrese un ${NOMBRE_DOC[doc.tipo_documento]} válido.` };
  const oficial = await consultar(doc.tipo_documento, doc.numero_documento);
  if (!oficial) return invalido;

  const mismosNombres = conjunto(doc.nombres) === conjunto(oficial.nombres);
  const mismosApellidos = conjunto(`${doc.apellido_paterno} ${doc.apellido_materno || ''}`) === conjunto(oficial.apellidos);
  if (!mismosNombres || !mismosApellidos) return invalido;

  return {
    ok: true,
    persona: {
      tipo_documento: doc.tipo_documento,
      numero_documento: doc.numero_documento,
      nombres: doc.nombres.trim(),
      apellido_paterno: doc.apellido_paterno.trim(),
      apellido_materno: doc.apellido_materno?.trim() || null,
      fecha_nacimiento: null,
    },
  };
}