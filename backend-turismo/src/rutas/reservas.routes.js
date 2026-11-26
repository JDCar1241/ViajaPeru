import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { ROLES_CAJA } from '../utils/comunes.js';
import { validarReserva, paraRpc } from '../validaciones/reservas.validacion.js';
import { verificarPasajeros } from '../servicios/verificacion-documentos.js';

const router = Router();

// POST /api/reservas
// { salida_id, cliente:{tipo_documento,nro_documento,apellidos,nombres,fecha_nacimiento,correo,telefono},
//   acompanantes:[{tipo_documento,nro_documento,apellidos,nombres,fecha_nacimiento,telefono,mrz?}] }
// Cada documento se verifica contra el nombre antes de crear la reserva.
router.post('/', requiereSesion(ROLES_CAJA), async (req, res, next) => {
  try {
    const body = req.body || {};
    const salidaId = Number(body.salida_id);
    if (!Number.isInteger(salidaId) || salidaId < 1) return fallo(res, 400, 'La salida no es válida.');

    // La edad se calcula con la fecha de la salida
    const { data: salida, error: errSalida } = await supabase
      .from('salidas').select('fecha_inicio_viaje').eq('id', salidaId).maybeSingle();
    if (errSalida) throw errSalida;
    if (!salida) return fallo(res, 404, 'La salida no existe.');

    const v = validarReserva(body, salida.fecha_inicio_viaje);
    if (v.error) return fallo(res, 400, v.error);

    // Que cada documento corresponda a ese nombre (DNI -> RENIEC, CE -> Migraciones,
    // pasaporte -> MRZ), igual que en la reserva online. Menores que no figuran: se aceptan.
    const identidad = await verificarPasajeros(v);
    if (identidad.error) return fallo(res, identidad.estado, identidad.error);

    const { data, error } = await supabase.rpc('crear_reserva', {
      p_salida_id: salidaId,
      p_cliente: paraRpc(v.cliente),
      p_acompanantes: v.acompanantes.map(paraRpc),
      p_creado_por: req.usuario.id,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('CUPOS_INSUFICIENTES')) return fallo(res, 409, 'La cantidad de pasajeros excede la capacidad disponible del paquete.');
      if (m.includes('SALIDA_NO_DISPONIBLE')) return fallo(res, 409, 'La salida no está disponible.');
      if (m.includes('CLIENTE_MENOR')) return fallo(res, 400, 'El cliente que reserva debe ser mayor de edad.');
      if (m.includes('DATOS_INVALIDOS') || error.code === '23514') return fallo(res, 400, 'Los datos de la reserva no son válidos.');
      throw error;
    }
    res.status(201).json(data);
  } catch (e) { next(e); }
});

export default router;