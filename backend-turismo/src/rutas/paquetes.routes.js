
import { Router } from 'express';
import { liberarVencidas } from '../servicios/vencimientos.js';
import { supabase } from '../config/supabase.js';
import { fallo } from '../middlewares/auth.middleware.js';
import { idValido } from '../utils/comunes.js';
import { validarListado } from '../validaciones/paquetes.validacion.js';

const router = Router();

// Los cupos y el tipo de cambio pueden cambiar.
// No almacenar respuestas en caché.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ============================================
// TIPO DE CAMBIO
// GET /api/paquetes/tipo-cambio
// Respuesta: { usd: 3.75 }
// ============================================

// Consulta pública para mostrar precios en dólares.
// Utiliza la misma configuración que los pagos con Culqi.
router.get('/tipo-cambio', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'tipo_cambio_usd')
      .maybeSingle();

    if (error) throw error;

    const tipoCambio = Number(data?.valor);

    // Mismo rango de seguridad utilizado en cobros.routes.js.
    if (
      !Number.isFinite(tipoCambio) ||
      tipoCambio < 1 ||
      tipoCambio > 20
    ) {
      return fallo(res, 503, 'El tipo de cambio no está configurado.');
    }

    return res.status(200).json({
      usd: tipoCambio,
    });
  } catch (e) {
    next(e);
  }
});

// ============================================
// LISTADO DE PAQUETES
// GET /api/paquetes?lugar=&fecha_desde=&fecha_hasta=&ordenar_por=&orden=&limit=&offset=
// ============================================

router.get('/', async (req, res, next) => {
  try {
    const { error: invalido, valores } = validarListado(req.query);

    if (invalido) {
      return fallo(res, 400, invalido);
    }

    await liberarVencidas(); // cupos de compras online abandonadas

    const { data, error } = await supabase.rpc(
      'listar_paquetes',
      valores
    );

    if (error) throw error;

    // Sin resultados: arreglo vacío con 200 OK.
    const paquetes = (data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      foto_url: p.foto_url,
      costo: Number(p.costo),
      moneda: p.moneda || 'PEN',
      cupos_disponibles: p.cupos_disponibles,
      proxima_salida: p.proxima_salida,
    }));

    return res.status(200).json(paquetes);
  } catch (e) {
    next(e);
  }
});

// ============================================
// DETALLE DE PAQUETE
// GET /api/paquetes/:id
// Devuelve paquete + itinerario + aclaraciones + salidas.
// ============================================

router.get('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(
        res,
        400,
        'id debe ser un número entero mayor a 0'
      );
    }

    await liberarVencidas();

    const { data, error } = await supabase.rpc(
      'obtener_paquete',
      { p_id: id }
    );

    if (error) throw error;

    if (!data) {
      return fallo(res, 404, 'Paquete no encontrado');
    }

    const costo = Number(data.costo);

    if (!Number.isFinite(costo) || costo < 0) {
      return fallo(res, 500, 'El precio del paquete no es válido.');
    }

    return res.status(200).json({
      ...data,
      costo,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
