// mrz.js · Lectura y validación de la zona MRZ de un pasaporte (formato TD3: 2 líneas de 44 caracteres).
//
// IMPORTANTE: este archivo debe ser IDÉNTICO en
//   react-turismo/src/mrz.js      (para avisar al usuario mientras escribe)
//   backend-turismo/src/mrz.js    (para validar de verdad: el Front nunca es de fiar)
//
// Qué verifica: que los dígitos de control cuadren, que las fechas existan y que el pasaporte no esté vencido.
// Qué NO verifica: que el pasaporte sea auténtico. Detecta errores de digitación, no falsificaciones.

const LARGO = 44;
const PESOS = [7, 3, 1];

// Valor de cada carácter según la norma ICAO 9303: dígitos = su valor, A-Z = 10-35, "<" = 0
const valor = (c) => (c === '<' ? 0 : c >= '0' && c <= '9' ? Number(c) : c.charCodeAt(0) - 55);
const digitoControl = (texto) => [...texto].reduce((s, c, i) => s + valor(c) * PESOS[i % 3], 0) % 10;

// Deja solo los caracteres que puede tener una MRZ (mayúsculas, números y "<")
export const limpiarMrz = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9<]/g, '');

// YYMMDD -> 'YYYY-MM-DD' (o null si no es una fecha real). Para nacimiento, un año mayor al actual es del siglo pasado.
function fechaMrz(yymmdd, esNacimiento, hoy) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const yyHoy = hoy.getUTCFullYear() % 100;
  const anio = esNacimiento ? (yy > yyHoy ? 1900 + yy : 2000 + yy) : 2000 + yy;
  const f = new Date(Date.UTC(anio, mm - 1, dd));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mm - 1 || f.getUTCDate() !== dd) return null;
  return f.toISOString().slice(0, 10);
}

export function analizarMrz(linea1, linea2, hoy = new Date()) {
  const a = limpiarMrz(linea1);
  const b = limpiarMrz(linea2);
  if (a.length !== LARGO || b.length !== LARGO) return { ok: false, incompleto: true, errores: [], datos: null };

  const errores = [];
  if (a[0] !== 'P') errores.push('La primera línea debe empezar con la letra P (pasaporte).');

  // Cada bloque tiene un dígito de control a su lado. Si el bloque está vacío ("<<<"), el control puede ser "<" o "0".
  const control = (texto, digito, nombre) => {
    const vacio = /^<*$/.test(texto) && (digito === '<' || digito === '0');
    if (!vacio && digito !== String(digitoControl(texto))) errores.push(`El dígito de control ${nombre} no coincide. Revisa lo escrito.`);
  };
  control(b.slice(0, 9), b[9], 'del número de pasaporte');
  control(b.slice(13, 19), b[19], 'de la fecha de nacimiento');
  control(b.slice(21, 27), b[27], 'de la fecha de vencimiento');
  control(b.slice(28, 42), b[42], 'del número personal');
  // Control general sobre las partes principales de la segunda línea
  const compuesto = b.slice(0, 10) + b.slice(13, 20) + b.slice(21, 43);
  if (b[43] !== String(digitoControl(compuesto))) errores.push('El control general de la segunda línea no coincide. Revisa lo escrito.');

  // Datos
  const numero = b.slice(0, 9).replace(/</g, '');
  const [apellidoCrudo, ...resto] = a.slice(5).split('<<');
  const limpia = (t) => t.replace(/<+/g, ' ').replace(/\s+/g, ' ').trim();
  const apellidos = limpia(apellidoCrudo || '');
  const nombres = limpia(resto.join(' '));
  const nacimiento = fechaMrz(b.slice(13, 19), true, hoy);
  const vence = fechaMrz(b.slice(21, 27), false, hoy);

  if (!numero) errores.push('No se pudo leer el número de pasaporte.');
  if (!apellidos || !nombres) errores.push('No se pudieron leer los nombres y apellidos.');
  if (!nacimiento) errores.push('La fecha de nacimiento no es válida.');
  else if (new Date(nacimiento) > hoy) errores.push('La fecha de nacimiento no puede ser futura.');
  if (!vence) errores.push('La fecha de vencimiento no es válida.');
  else if (new Date(vence + 'T23:59:59Z') < hoy) errores.push('El pasaporte está vencido.');

  return {
    ok: errores.length === 0,
    incompleto: false,
    errores,
    datos: {
      numero,
      apellidos,
      nombres,
      nacionalidad: b.slice(10, 13).replace(/</g, ''),
      sexo: b[20] === 'M' || b[20] === 'F' ? b[20] : '',
      fecha_nacimiento: nacimiento,
      vence,
    },
  };
}