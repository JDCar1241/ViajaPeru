
import { analizarMrz } from './mrz.js';
import { consultarPersona } from './factiliza.js';
import { DOCUMENTOS } from './comunes.js';

export { ErrorServicio } from './factiliza.js';

const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim();

const conjunto = (t) =>
  normalizar(t)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');

export async function verificarDocumento(doc) {
  const tipo = String(doc?.tipo_documento || '').toUpperCase();
  const numero = String(doc?.numero_documento || '').trim().toUpperCase();

  // Verificación de pasaporte mediante MRZ
  if (tipo === 'PASAPORTE') {
    const r = analizarMrz(doc?.mrz?.[0], doc?.mrz?.[1]);

    if (r.incompleto) {
      return {
        ok: false,
        motivo: 'Escribe las dos líneas de la zona MRZ (44 caracteres cada una).',
      };
    }

    if (!r.ok) {
      return { ok: false, motivo: r.errores[0] };
    }

    const d = r.datos;

    return {
      ok: true,
      persona: {
        tipo_documento: 'PASAPORTE',
        numero_documento: d.numero,
        nombres: d.nombres,
        apellido_paterno: d.apellidos,
        apellido_materno: null,
        fecha_nacimiento: d.fecha_nacimiento,
      },
    };
  }

  // Validar tipo de documento
  const configuracion = DOCUMENTOS[tipo];

  if (!configuracion) {
    return {
      ok: false,
      motivo: 'El tipo de documento no es válido.',
    };
  }

  // Validar formato del DNI
  if (tipo === 'DNI' && !/^\d{8}$/.test(numero)) {
    return {
      ok: false,
      motivo: 'El DNI debe contener exactamente 8 dígitos.',
    };
  }

  if (!numero) {
    return {
      ok: false,
      motivo: 'Ingresa el número de documento.',
    };
  }

  // Consultar datos oficiales
  const oficial = await consultarPersona(tipo, numero);

  if (!oficial) {
    return {
      ok: false,
      motivo: 'Factiliza no encontró el documento. Verifica el número ingresado.',
    };
  }

  // Comparar nombres
  const mismosNombres =
    conjunto(doc.nombres) === conjunto(oficial.nombres);

  if (!mismosNombres) {
    return {
      ok: false,
      motivo: 'Los nombres no coinciden con los datos oficiales.',
    };
  }

  // Comparar apellidos
  const apellidosIngresados = conjunto(
    `${doc.apellido_paterno || ''} ${doc.apellido_materno || ''}`
  );

  const apellidosOficiales = conjunto(oficial.apellidos);

  if (apellidosIngresados !== apellidosOficiales) {
    return {
      ok: false,
      motivo: 'Los apellidos no coinciden con los datos oficiales.',
    };
  }

  return {
    ok: true,
    persona: {
      tipo_documento: tipo,
      numero_documento: numero,
      nombres: String(doc.nombres || '').trim(),
      apellido_paterno: String(doc.apellido_paterno || '').trim(),
      apellido_materno: String(doc.apellido_materno || '').trim() || null,
      fecha_nacimiento: null,
    },
  };
}
