
import {
  txt,
  esCorreo,
  esFechaISO,
  esTelefonoPeru,
  telefonoInternacionalValido,
  DOCUMENTOS,
} from '../utils/comunes.js';
import { analizarMrz } from '../utils/mrz.js';

// Validación compartida para reservas presenciales y reservas online.
//
// Teléfonos: titular y acompañantes con código de país ("+51987654321").
// Pasaporte: se exige la MRZ (2 líneas). Número, nombres, apellidos y fecha de nacimiento
// se toman de la MRZ (validada con sus dígitos de control), no de lo que se escribió a mano.

const MAYORIA_EDAD = 18;
export const MAX_ACOMPANANTES = 20;

const esObjeto = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// Se acepta también el formato antiguo de 9 dígitos peruanos (datos ya guardados).
const telefonoPorDefecto = (t) => telefonoInternacionalValido(t) || esTelefonoPeru(t);

// Edad cumplida en la fecha de salida, no en la fecha actual.
function edadAl(nacimiento, referencia) {
  const n = new Date(`${nacimiento}T00:00:00Z`);
  const r = new Date(referencia);

  let edad = r.getUTCFullYear() - n.getUTCFullYear();

  const mes = r.getUTCMonth() - n.getUTCMonth();

  if (mes < 0 || (mes === 0 && r.getUTCDate() < n.getUTCDate())) {
    edad--;
  }

  return edad;
}

function persona(p) {
  const o = esObjeto(p) ? p : {};

  return {
    tipo_documento: txt(o.tipo_documento).toUpperCase() || 'DNI',
    nro_documento: txt(o.nro_documento ?? o.dni).toUpperCase(),
    apellidos: txt(o.apellidos),
    nombres: txt(o.nombres),
    fecha_nacimiento: txt(o.fecha_nacimiento),
    mrz: Array.isArray(o.mrz) ? o.mrz.slice(0, 2).map((l) => String(l ?? '')) : null,
  };
}

// Pasaporte: lee y valida la MRZ y reemplaza los datos escritos por los de la MRZ.
function aplicarMrz(p, quien) {
  if (!p.mrz || p.mrz.length !== 2) {
    return `Escribe las dos líneas de la zona MRZ del pasaporte ${quien}.`;
  }

  const r = analizarMrz(p.mrz[0], p.mrz[1]);

  if (r.incompleto) {
    return `La MRZ del pasaporte ${quien} debe tener dos líneas de 44 caracteres.`;
  }

  if (!r.ok) {
    return `La MRZ del pasaporte ${quien} no es válida: ${r.errores[0]}`;
  }

  p.nro_documento = r.datos.numero;
  p.apellidos = r.datos.apellidos;
  p.nombres = r.datos.nombres;
  p.fecha_nacimiento = r.datos.fecha_nacimiento;
  p.verificado_mrz = true;

  return '';
}

// Valida los datos personales y calcula la mayoría de edad.
// exigirMrz: false solo para el titular que reserva con los datos de su propia cuenta
// (su pasaporte ya se validó con la MRZ al crear la cuenta).
function revisar(p, quien, fechaSalida, exigirMrz = true) {
  const regla = DOCUMENTOS[p.tipo_documento];

  if (!regla) {
    return `El tipo de documento ${quien} no es válido.`;
  }

  if (p.tipo_documento === 'PASAPORTE' && exigirMrz) {
    const msgMrz = aplicarMrz(p, quien);
    if (msgMrz) return msgMrz;
  }

  delete p.mrz; // no se guarda en la base

  if (!regla.re.test(p.nro_documento)) {
    return `El ${p.tipo_documento} ${quien} ${regla.msg}.`;
  }

  if (!p.apellidos || !p.nombres) {
    return `Faltan los apellidos o nombres ${quien}.`;
  }

  if (!esFechaISO(p.fecha_nacimiento)) {
    return `La fecha de nacimiento ${quien} no es válida.`;
  }

  if (
    new Date(`${p.fecha_nacimiento}T00:00:00Z`) > new Date()
  ) {
    return `La fecha de nacimiento ${quien} no puede ser futura.`;
  }

  if (!esFechaISO(String(fechaSalida).slice(0, 10))) {
    return 'La fecha de salida no es válida.';
  }

  const edad = edadAl(p.fecha_nacimiento, fechaSalida);

  if (edad < 0 || edad > 110) {
    return `Revisa la fecha de nacimiento ${quien}.`;
  }

  p.es_menor = edad < MAYORIA_EDAD;

  return '';
}

// Se conserva "dni" por compatibilidad con la función SQL crear_reserva.
export const paraRpc = (p) => {
  const { verificado_mrz: _, ...resto } = p;
  return { ...resto, dni: p.nro_documento };
};

// Devuelve { error } o { cliente, acompanantes } con los datos normalizados.
//
// opciones.telefonoValido  permite personalizar la validación telefónica.
// opciones.titularSinMrz   true si el titular viene de la cuenta del cliente (no se le pide MRZ).
export function validarReserva(body, fechaSalida, opciones = {}) {
  const { cliente: c, acompanantes } = body || {};

  if (!esObjeto(c)) {
    return { error: 'Faltan los datos del cliente.' };
  }

  const telefonoValido =
    typeof opciones.telefonoValido === 'function'
      ? opciones.telefonoValido
      : telefonoPorDefecto;

  const cliente = {
    ...persona(c),
    correo: txt(c.correo),
    telefono: txt(c.telefono),
  };

  let msg = revisar(cliente, 'del cliente', fechaSalida, !opciones.titularSinMrz);

  if (msg) return { error: msg };

  if (cliente.es_menor) {
    return { error: 'El cliente que reserva debe ser mayor de edad.' };
  }

  if (!esCorreo(cliente.correo)) {
    return { error: 'El correo del cliente no es válido.' };
  }

  if (!telefonoValido(cliente.telefono)) {
    return {
      error: 'El teléfono del cliente no tiene un formato válido para el país elegido.',
    };
  }

  const lista = acompanantes === undefined ? [] : acompanantes;

  if (!Array.isArray(lista)) {
    return { error: 'Los acompañantes no son válidos.' };
  }

  if (lista.length > MAX_ACOMPANANTES) {
    return {
      error: `Máximo ${MAX_ACOMPANANTES} acompañantes por reserva.`,
    };
  }

  const acomp = [];

  const vistos = new Set([
    `${cliente.tipo_documento}:${cliente.nro_documento}`,
  ]);

  for (const [i, raw] of lista.entries()) {
    if (!esObjeto(raw)) {
      return {
        error: `Los datos del acompañante ${i + 1} no son válidos.`,
      };
    }

    const a = { ...persona(raw), telefono: txt(raw.telefono) };

    msg = revisar(a, `del acompañante ${i + 1}`, fechaSalida);

    if (msg) return { error: msg };

    // El teléfono del acompañante es opcional: si viene, debe tener código de país y largo correcto
    if (a.telefono && !telefonoInternacionalValido(a.telefono)) {
      return {
        error: `El teléfono del acompañante ${i + 1} no tiene un formato válido para el país elegido.`,
      };
    }

    const clave = `${a.tipo_documento}:${a.nro_documento}`;

    if (vistos.has(clave)) {
      return {
        error: `El documento ${a.nro_documento} está repetido en la reserva.`,
      };
    }

    vistos.add(clave);
    acomp.push(a);
  }

  return {
    cliente,
    acompanantes: acomp,
  };
}
