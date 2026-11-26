// paises.js · Códigos telefónicos por país.
//
// IMPORTANTE: este archivo debe ser IDÉNTICO en
//   react-turismo/src/utils/paises.js    (selector de país y aviso mientras se escribe)
//   backend-turismo/src/utils/paises.js  (validación real: el Front nunca es de fiar)
//
// Los teléfonos se guardan como "+<código><número>", por ejemplo "+51987654321".
// min / max = dígitos del número nacional (sin el código de país).

export const PAISES = [
  { iso: 'PE', nombre: 'Perú', cod: '+51', min: 9, max: 9 },
  { iso: 'AR', nombre: 'Argentina', cod: '+54', min: 10, max: 10 },
  { iso: 'BO', nombre: 'Bolivia', cod: '+591', min: 8, max: 8 },
  { iso: 'BR', nombre: 'Brasil', cod: '+55', min: 10, max: 11 },
  { iso: 'CL', nombre: 'Chile', cod: '+56', min: 9, max: 9 },
  { iso: 'CO', nombre: 'Colombia', cod: '+57', min: 10, max: 10 },
  { iso: 'CR', nombre: 'Costa Rica', cod: '+506', min: 8, max: 8 },
  { iso: 'CU', nombre: 'Cuba', cod: '+53', min: 8, max: 8 },
  { iso: 'EC', nombre: 'Ecuador', cod: '+593', min: 9, max: 9 },
  { iso: 'SV', nombre: 'El Salvador', cod: '+503', min: 8, max: 8 },
  { iso: 'GT', nombre: 'Guatemala', cod: '+502', min: 8, max: 8 },
  { iso: 'HN', nombre: 'Honduras', cod: '+504', min: 8, max: 8 },
  { iso: 'MX', nombre: 'México', cod: '+52', min: 10, max: 10 },
  { iso: 'NI', nombre: 'Nicaragua', cod: '+505', min: 8, max: 8 },
  { iso: 'PA', nombre: 'Panamá', cod: '+507', min: 8, max: 8 },
  { iso: 'PY', nombre: 'Paraguay', cod: '+595', min: 9, max: 9 },
  { iso: 'DO', nombre: 'República Dominicana', cod: '+1', min: 10, max: 10 },
  { iso: 'UY', nombre: 'Uruguay', cod: '+598', min: 8, max: 8 },
  { iso: 'VE', nombre: 'Venezuela', cod: '+58', min: 10, max: 10 },
  { iso: 'US', nombre: 'Estados Unidos', cod: '+1', min: 10, max: 10 },
  { iso: 'CA', nombre: 'Canadá', cod: '+1', min: 10, max: 10 },
  { iso: 'ES', nombre: 'España', cod: '+34', min: 9, max: 9 },
  { iso: 'PT', nombre: 'Portugal', cod: '+351', min: 9, max: 9 },
  { iso: 'FR', nombre: 'Francia', cod: '+33', min: 9, max: 9 },
  { iso: 'IT', nombre: 'Italia', cod: '+39', min: 9, max: 10 },
  { iso: 'DE', nombre: 'Alemania', cod: '+49', min: 10, max: 11 },
  { iso: 'GB', nombre: 'Reino Unido', cod: '+44', min: 10, max: 10 },
  { iso: 'IE', nombre: 'Irlanda', cod: '+353', min: 9, max: 9 },
  { iso: 'NL', nombre: 'Países Bajos', cod: '+31', min: 9, max: 9 },
  { iso: 'BE', nombre: 'Bélgica', cod: '+32', min: 9, max: 9 },
  { iso: 'CH', nombre: 'Suiza', cod: '+41', min: 9, max: 9 },
  { iso: 'SE', nombre: 'Suecia', cod: '+46', min: 9, max: 9 },
  { iso: 'RU', nombre: 'Rusia', cod: '+7', min: 10, max: 10 },
  { iso: 'IL', nombre: 'Israel', cod: '+972', min: 9, max: 9 },
  { iso: 'ZA', nombre: 'Sudáfrica', cod: '+27', min: 9, max: 9 },
  { iso: 'IN', nombre: 'India', cod: '+91', min: 10, max: 10 },
  { iso: 'CN', nombre: 'China', cod: '+86', min: 11, max: 11 },
  { iso: 'JP', nombre: 'Japón', cod: '+81', min: 10, max: 10 },
  { iso: 'KR', nombre: 'Corea del Sur', cod: '+82', min: 9, max: 10 },
  { iso: 'AU', nombre: 'Australia', cod: '+61', min: 9, max: 9 },
  { iso: 'NZ', nombre: 'Nueva Zelanda', cod: '+64', min: 8, max: 10 },
];

export const PAIS_POR_DEFECTO = PAISES[0]; // Perú

export const paisPorIso = (iso) => PAISES.find((p) => p.iso === iso) || PAIS_POR_DEFECTO;

// Códigos de mayor a menor largo, para reconocer "+591..." antes que "+59..."
const CODIGOS = [...new Set(PAISES.map((p) => p.cod))].sort((a, b) => b.length - a.length);

// "+51987654321" -> { pais, numero: '987654321' } | null si el código no está en la lista.
// Si el código lo comparten varios países (+1), se devuelve el primero de la lista.
export function separarTelefono(tel) {
  const t = String(tel || '').trim();
  const cod = CODIGOS.find((c) => t.startsWith(c));
  if (!cod) return null;
  return { pais: PAISES.find((p) => p.cod === cod), numero: t.slice(cod.length) };
}

// Largo correcto del número nacional para ese país
export const largoValido = (pais, numero) =>
  /^\d+$/.test(numero) && numero.length >= pais.min && numero.length <= pais.max;

export const textoLargo = (pais) =>
  pais.min === pais.max ? `${pais.min} dígitos` : `entre ${pais.min} y ${pais.max} dígitos`;

// "+<código><número>" con el largo correcto para algún país con ese código
export function telefonoValido(tel) {
  if (typeof tel !== 'string' || !/^\+\d{8,15}$/.test(tel)) return false;
  const s = separarTelefono(tel);
  if (!s) return false;
  return PAISES.some((p) => p.cod === s.pais.cod && largoValido(p, s.numero));
}
