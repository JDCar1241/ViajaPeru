import { Router } from 'express';
import { supabase } from './supabase.js';
import { validarListado } from './validacion.js';

const router = Router();

// Los cupos cambian con cada reserva: nunca cachear estas respuestas
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /api/paquetes?lugar=&fecha_desde=&fecha_hasta=&ordenar_por=&orden=&limit=&offset=
router.get('/', async (req, res) => {
  const { error: invalido, valores } = validarListado(req.query);
  if (invalido) return res.status(400).json({ error: invalido });

  const { data, error } = await supabase.rpc('listar_paquetes', valores);
  if (error) {
    console.error('listar_paquetes:', error);
    return res.status(500).json({ error: 'No se pudo consultar los paquetes' });
  }

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
});

// GET /api/paquetes/:id  -> paquete + itinerario + aclaraciones + salidas programadas
router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'id debe ser un número entero' });
  }

  const { data, error } = await supabase.rpc('obtener_paquete', { p_id: Number(req.params.id) });
  if (error) {
    console.error('obtener_paquete:', error);
    return res.status(500).json({ error: 'No se pudo consultar el paquete' });
  }
  if (!data) return res.status(404).json({ error: 'Paquete no encontrado' });

  res.status(200).json({ ...data, costo: Number(data.costo) });
});

export default router;