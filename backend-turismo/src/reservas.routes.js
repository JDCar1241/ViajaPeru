import { Router } from 'express';
import { supabase } from './supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const txt = (v) => (typeof v === 'string' ? v.trim() : '');
const esCorreo = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const esTel = (v) => /^\d{9}$/.test(v);

// Formatos por tipo de documento. Mantener iguales a frontend/documentos.js
// (las longitudes de CE y pasaporte son supuestos: confírmalas con el equipo)
const DOCUMENTOS = {
  DNI: { re: /^\d{8}$/, msg: 'debe tener 8 dígitos' },
  CE: { re: /^[A-Za-z0-9]{9,12}$/, msg: 'debe tener entre 9 y 12 letras o números' },
  PASAPORTE: { re: /^[A-Za-z0-9]{6,12}$/, msg: 'debe tener entre 6 y 12 letras o números' },
};
const MAYORIA_EDAD = 18;

const esFechaISO = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// Edad cumplida en la fecha de la salida (no la de hoy)
function edadAl(nacimiento, referencia) {
  const n = new Date(`${nacimiento}T00:00:00Z`);
  const r = new Date(referencia);
  let e = r.getUTCFullYear() - n.getUTCFullYear();
  const m = r.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < n.getUTCDate())) e--;
  return e;
}

function persona(p = {}) {
  return {
    tipo_documento: txt(p.tipo_documento).toUpperCase() || 'DNI',
    nro_documento: txt(p.nro_documento ?? p.dni),
    apellidos: txt(p.apellidos),
    nombres: txt(p.nombres),
    fecha_nacimiento: txt(p.fecha_nacimiento),
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
const paraRpc = (p) => ({ ...p, dni: p.nro_documento });

// POST /api/reservas
// { salida_id, cliente:{tipo_documento,nro_documento,apellidos,nombres,fecha_nacimiento,correo,telefono},
//   acompanantes:[{tipo_documento,nro_documento,apellidos,nombres,fecha_nacimiento}] }
router.post('/', requiereSesion(['Recepcionista', 'Gerente']), async (req, res, next) => {
  try {
    const { salida_id, cliente: c, acompanantes } = req.body || {};
    const salidaId = Number(salida_id);
    if (!Number.isInteger(salidaId) || salidaId < 1) return fallo(res, 400, 'La salida no es válida.');

    // La edad se calcula con la fecha de la salida
    const { data: salida, error: errSalida } = await supabase
      .from('salidas').select('fecha_inicio_viaje').eq('id', salidaId).maybeSingle();
    if (errSalida) throw errSalida;
    if (!salida) return fallo(res, 404, 'La salida no existe.');
    const fechaSalida = salida.fecha_inicio_viaje;

    const cliente = { ...persona(c), correo: txt(c?.correo), telefono: txt(c?.telefono) };
    let msg = revisar(cliente, 'del cliente', fechaSalida);
    if (msg) return fallo(res, 400, msg);
    if (cliente.es_menor) return fallo(res, 400, 'El cliente que reserva debe ser mayor de edad.');
    if (!esCorreo(cliente.correo)) return fallo(res, 400, 'El correo del cliente no es válido.');
    if (!esTel(cliente.telefono)) return fallo(res, 400, 'El teléfono del cliente debe tener 9 dígitos.');

    const lista = acompanantes === undefined ? [] : acompanantes;
    if (!Array.isArray(lista)) return fallo(res, 400, 'Los acompañantes no son válidos.');
    const acomp = lista.map(persona);
    const vistos = new Set([`${cliente.tipo_documento}:${cliente.nro_documento.toUpperCase()}`]);
    for (const [i, a] of acomp.entries()) {
      msg = revisar(a, `del acompañante ${i + 1}`, fechaSalida);
      if (msg) return fallo(res, 400, msg);
      const clave = `${a.tipo_documento}:${a.nro_documento.toUpperCase()}`;
      if (vistos.has(clave)) return fallo(res, 400, `El documento ${a.nro_documento} está repetido en la reserva.`);
      vistos.add(clave);
    }

    const { data, error } = await supabase.rpc('crear_reserva', {
      p_salida_id: salidaId,
      p_cliente: paraRpc(cliente),
      p_acompanantes: acomp.map(paraRpc),
      p_creado_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('CUPOS_INSUFICIENTES')) return fallo(res, 409, 'No hay cupos suficientes en esta salida.');
      if (m.includes('SALIDA_NO_DISPONIBLE')) return fallo(res, 409, 'La salida no está disponible.');
      if (m.includes('CLIENTE_MENOR')) return fallo(res, 400, 'El cliente que reserva debe ser mayor de edad.');
      if (m.includes('DATOS_INVALIDOS') || error.code === '23514') return fallo(res, 400, 'Los datos de la reserva no son válidos.');
      throw error;
    }
    res.status(201).json(data);
  } catch (e) { next(e); }
});

export default router;