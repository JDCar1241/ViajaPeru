import { Router } from 'express';
import { supabase } from './config/supabase.js';
import { fallo } from './auth.middleware.js';
import { idValido } from './comunes.js';
import { validarListado } from './validacion.js';

const router = Router();

// Los cupos cambian con cada reserva: nunca cachear estas respuestas
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /api/paquetes?lugar=&fecha_desde=&fecha_hasta=&ordenar_por=&orden=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const { error: invalido, valores } = validarListado(req.query);
    if (invalido) return fallo(res, 400, invalido);

    const { data, error } = await supabase.rpc('listar_paquetes', valores);
    if (error) throw error;

    // Sin resultados: arreglo vacío con 200 OK (acuerdo de TUR-75)
    res.status(200).json(
      (data ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        foto_url: p.foto_url,
        costo: Number(p.costo),
        cupos_disponibles: p.cupos_disponibles,
        proxima_salida: p.proxima_salida, // ISO 8601
      }))
    );
  } catch (e) { next(e); }
});

// GET /api/paquetes/:id  -> paquete + itinerario + aclaraciones + salidas programadas
router.get('/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'id debe ser un número entero mayor a 0');

    const { data, error } = await supabase.rpc('obtener_paquete', { p_id: id });
    if (error) throw error;
    if (!data) return fallo(res, 404, 'Paquete no encontrado');

    res.status(200).json({ ...data, costo: Number(data.costo) });
  } catch (e) { next(e); }
});

export default router;