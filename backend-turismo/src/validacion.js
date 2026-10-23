// Validación de los query params de GET /api/paquetes (acordados en TUR-75)
const ORDENAR_POR = ['costo', 'capacidad'];
const ORDEN = ['asc', 'desc'];
const LIMIT_DEFECTO = 10;
const LIMIT_MAX = 50;

const esFechaISO = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const entero = (v, defecto) => {
  if (v === undefined || v === '') return defecto;
  return /^\d+$/.test(v) ? Number(v) : NaN;
};

// Devuelve { error } o { valores } con los parámetros de la función SQL
export function validarListado(q) {
  const lugar = typeof q.lugar === 'string' ? q.lugar.trim() : '';
  const desde = q.fecha_desde || null;
  const hasta = q.fecha_hasta || null;
  const ordenar_por = q.ordenar_por || 'costo';
  const orden = q.orden || 'asc';
  const limit = entero(q.limit, LIMIT_DEFECTO);
  const offset = entero(q.offset, 0);

  if (lugar.length > 100) return { error: 'lugar admite hasta 100 caracteres' };
  if (desde && !esFechaISO(desde)) return { error: 'fecha_desde debe tener formato YYYY-MM-DD' };
  if (hasta && !esFechaISO(hasta)) return { error: 'fecha_hasta debe tener formato YYYY-MM-DD' };
  if (desde && hasta && desde > hasta) return { error: 'fecha_desde no puede ser mayor que fecha_hasta' };
  if (!ORDENAR_POR.includes(ordenar_por)) return { error: `ordenar_por debe ser: ${ORDENAR_POR.join(' o ')}` };
  if (!ORDEN.includes(orden)) return { error: `orden debe ser: ${ORDEN.join(' o ')}` };
  if (Number.isNaN(limit) || limit < 1) return { error: 'limit debe ser un entero mayor o igual a 1' };
  if (Number.isNaN(offset)) return { error: 'offset debe ser un entero mayor o igual a 0' };

  return {
    valores: {
      p_lugar: lugar || null,
      p_fecha_desde: desde,
      p_fecha_hasta: hasta,
      p_ordenar_por: ordenar_por,
      p_orden: orden,
      p_limit: Math.min(limit, LIMIT_MAX),
      p_offset: offset,
    },
  };
}