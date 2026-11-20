-- ViajaPeru · obtener_reserva devuelve también el correo del cliente y los acompañantes
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de esquema-actual.sql. Se puede repetir sin problema.
--
-- Por qué:
--   * Cobrar (personal) rellena el correo para pagar con tarjeta con cliente.correo: antes llegaba vacío.
--   * Mi reserva (portal) muestra la lista de acompañantes: antes nunca aparecía.
--   * Comprobante y Cobrar leen cliente.numero_documento (se mantiene "dni" por compatibilidad).
-- No quita ningún campo: todo lo que ya usaba el código sigue igual.
-- listar_reservas usa esta función, así que la lista de Cobros también trae estos datos.

CREATE OR REPLACE FUNCTION public.obtener_reserva(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'id', r.id,
    'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
    'estado', r.estado,
    'num_personas', r.num_personas,
    'total', r.total,
    'fecha_inicio_viaje', s.fecha_inicio_viaje,

    'cliente', jsonb_build_object(
      'tipo_documento', c.tipo_documento,
      'dni', c.dni,
      'numero_documento', c.dni,
      'nombres', c.nombres,
      'apellidos', c.apellidos,
      'correo', c.correo
    ),

    'paquete', jsonb_build_object(
      'nombre', p.nombre,
      'foto_url', p.foto_url
    ),

    'acompanantes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'tipo_documento', a.tipo_documento,
               'numero_documento', a.dni,
               'nombres', a.nombres,
               'apellidos', a.apellidos,
               'es_menor', a.es_menor
             ) ORDER BY a.id)
        FROM public.acompanantes a
       WHERE a.reserva_id = r.id
    ), '[]'::jsonb)
  )
  FROM public.reservas r
  JOIN public.clientes c ON c.id = r.cliente_id
  JOIN public.salidas s ON s.id = r.salida_id
  JOIN public.paquetes p ON p.id = s.paquete_id
  WHERE r.id = p_id;
$function$;

-- Igual que las demás funciones: solo el Backend (service_role) puede ejecutarla.
REVOKE EXECUTE ON FUNCTION public.obtener_reserva(bigint) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.obtener_reserva(bigint) TO service_role;
