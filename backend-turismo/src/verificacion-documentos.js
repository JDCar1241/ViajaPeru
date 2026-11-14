import { analizarMrz } from './mrz.js';
import { consultarPersona } from './factiliza.js';
import { DOCUMENTOS } from './comunes.js';

// Verifica la identidad de quien se registra:
//   DNI y carné de extranjería -> consulta a Factiliza (RENIEC y Migraciones) y compara los nombres
//   Pasaporte                  -> validación de la zona MRZ (mrz.js). No certifica autenticidad.

// registro.routes.js sigue importándolo desde aquí
export { ErrorServicio } from './factiliza.js';

// Sin tildes, en mayúsculas y solo letras (la Ñ pasa a N, igual que en la MRZ)
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
// Compara sin importar el orden de las palabras
const conjunto = (t) => normalizar(t).split(' ').filter(Boolean).sort().join(' ');

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
  const invalido = { ok: false, motivo: `Ingrese un ${DOCUMENTOS[doc.tipo_documento].nombre} válido.` };
  const oficial = await consultarPersona(doc.tipo_documento, doc.numero_documento);
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