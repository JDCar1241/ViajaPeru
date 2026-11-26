
import { analizarMrz } from '../utils/mrz.js';
import { consultarPersona, ErrorServicio } from './factiliza.js';
import { DOCUMENTOS } from '../utils/comunes.js';

export { ErrorServicio };

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
      noEncontrado: true, // la fuente no tiene el documento (pasa con menores de edad)
      motivo: tipo === 'CE'
        ? 'El carné de extranjería no figura en Migraciones. Verifica el número ingresado.'
        : 'El DNI no figura en RENIEC. Verifica el número ingresado.',
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

// =========================================================
// Identidad de los pasajeros de una reserva (presencial y online)
// =========================================================

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

// Verifica que el documento corresponda a ese nombre:
//   DNI -> RENIEC   ·   CE -> Migraciones   ·   PASAPORTE -> su MRZ (ya leída en validarReserva)
// Devuelve { ok } | { error, estado } (estado = código HTTP a responder).
export async function verificarIdentidad(persona, quien) {
  const tipo = texto(persona.tipo_documento).toUpperCase();

  // El pasaporte se verifica con su MRZ (dígitos de control) en validarReserva:
  // allí se toman número, nombres y nacimiento de la MRZ. No hay fuente oficial en línea.
  if (tipo === 'PASAPORTE') {
    return persona.verificado_mrz
      ? { ok: true }
      : { estado: 400, error: `Escribe la MRZ del pasaporte ${quien}.` };
  }

  const apellidos = texto(persona.apellidos).split(/\s+/).filter(Boolean);
  const apellidoPaterno = apellidos.shift() || '';
  const apellidoMaterno = apellidos.join(' ');

  let resultado;

  try {
    resultado = await verificarDocumento({
      tipo_documento: tipo,
      numero_documento: texto(persona.nro_documento ?? persona.numero_documento ?? persona.dni).toUpperCase(),
      nombres: texto(persona.nombres),
      apellido_paterno: apellidoPaterno,
      apellido_materno: apellidoMaterno,
    });
  } catch (e) {
    // Factiliza caído o sin llave: no es culpa de quien registra.
    if (e instanceof ErrorServicio) {
      console.error(`Verificación de identidad ${quien} falló:`, e.message);
      return {
        estado: 503,
        error: 'No pudimos verificar los documentos en este momento. Inténtalo de nuevo en unos minutos.',
      };
    }
    throw e;
  }

  if (resultado.ok) return { ok: true };

  // Muchos menores de edad no figuran en la fuente: sin resultado no es motivo para rechazarlos.
  // Si SÍ figuran y los nombres no coinciden, se rechaza igual que a un adulto.
  if (resultado.noEncontrado && persona.es_menor) return { ok: true };

  return {
    estado: 400,
    error: `No se pudo verificar la identidad ${quien}: ${resultado.motivo}`,
  };
}

// Verifica a todos los pasajeros de una reserva ya validada con validarReserva.
// Las consultas van en paralelo; se informa el primer problema en el orden de la reserva.
// verificarTitular: false cuando el titular son los datos de la propia cuenta (ya verificados).
export async function verificarPasajeros({ cliente, acompanantes }, { verificarTitular = true } = {}) {
  const tareas = [
    verificarTitular ? verificarIdentidad(cliente, 'del titular') : Promise.resolve({ ok: true }),
    ...acompanantes.map((a, i) => verificarIdentidad(a, `del acompañante ${i + 1}`)),
  ];
  const resultados = await Promise.all(tareas);
  return resultados.find((r) => r.error) || { ok: true };
}
