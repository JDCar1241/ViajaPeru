import { txt, esCorreo, esFechaISO, esTelefonoPeru, DOCUMENTOS } from './comunes.js';

// Validación de los datos de una reserva (HU-001 presencial). Se separa de la ruta
// para reutilizarla en la compra online (HU-004) sin copiarla.

const MAYORIA_EDAD = 18;
export const MAX_ACOMPANANTES = 20;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Edad cumplida en la fecha de la salida (no la de hoy)
function edadAl(nacimiento, referencia) {
  const n = new Date(`${nacimiento}T00:00:00Z`);
  const r = new Date(referencia);
  let e = r.getUTCFullYear() - n.getUTCFullYear();
  const m = r.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < n.getUTCDate())) e--;
  return e;
}

function persona(p) {
  const o = esObjeto(p) ? p : {};
  return {
    tipo_documento: txt(o.tipo_documento).toUpperCase() || 'DNI',
    nro_documento: txt(o.nro_documento ?? o.dni).toUpperCase(),
    apellidos: txt(o.apellidos),
    nombres: txt(o.nombres),
    fecha_nacimiento: txt(o.fecha_nacimiento),
  };
}

// Devuelve un mensaje de error o '' si la persona es válida. Calcula es_menor (no se confía en el cliente).
function revisar(p, quien, fechaSalida) {
  const regla = DOCUMENTOS[p.tipo_documento];
  if (!regla) return `El tipo de documento ${quien} no es válido.`;
  if (!regla.re.test(p.nro_documento)) return `El ${p.tipo_documento} ${quien} ${regla.msg}.`;
  if (!p.apellidos || !p.nombres) return `Faltan los apellidos o nombres ${quien}.`;
  if (!esFechaISO(p.fecha_nacimiento)) return `La fecha de nacimiento ${quien} no es válida.`;
  if (new Date(`${p.fecha_nacimiento}T00:00:00Z`) > new Date()) return `La fecha de nacimiento ${quien} no puede ser futura.`;
  const edad = edadAl(p.fecha_nacimiento, fechaSalida);
  if (edad > 110) return `Revisa la fecha de nacimiento ${quien}.`;
  p.es_menor = edad < MAYORIA_EDAD;
  return '';
}

// "dni" se sigue enviando por compatibilidad con la función SQL crear_reserva actual
export const paraRpc = (p) => ({ ...p, dni: p.nro_documento });

// Devuelve { error } o { cliente, acompanantes } ya limpios.
export function validarReserva(body, fechaSalida) {
  const { cliente: c, acompanantes } = body || {};
  if (!esObjeto(c)) return { error: 'Faltan los datos del cliente.' };

  const cliente = { ...persona(c), correo: txt(c.correo), telefono: txt(c.telefono) };
  let msg = revisar(cliente, 'del cliente', fechaSalida);
  if (msg) return { error: msg };
  if (cliente.es_menor) return { error: 'El cliente que reserva debe ser mayor de edad.' };
  if (!esCorreo(cliente.correo)) return { error: 'El correo del cliente no es válido.' };
  if (!esTelefonoPeru(cliente.telefono)) return { error: 'El teléfono del cliente debe tener 9 dígitos.' };

  const lista = acompanantes === undefined ? [] : acompanantes;
  if (!Array.isArray(lista)) return { error: 'Los acompañantes no son válidos.' };
  if (lista.length > MAX_ACOMPANANTES) return { error: `Máximo ${MAX_ACOMPANANTES} acompañantes por reserva.` };

  const acomp = [];
  const vistos = new Set([`${cliente.tipo_documento}:${cliente.nro_documento}`]);
  for (const [i, raw] of lista.entries()) {
    if (!esObjeto(raw)) return { error: `Los datos del acompañante ${i + 1} no son válidos.` };
    const a = persona(raw);
    msg = revisar(a, `del acompañante ${i + 1}`, fechaSalida);
    if (msg) return { error: msg };
    const clave = `${a.tipo_documento}:${a.nro_documento}`;
    if (vistos.has(clave)) return { error: `El documento ${a.nro_documento} está repetido en la reserva.` };
    vistos.add(clave);
    acomp.push(a);
  }
  return { cliente, acompanantes: acomp };
}