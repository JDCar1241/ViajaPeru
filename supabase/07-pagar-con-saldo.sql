-- ViajaPeru · Pagar una reserva usando el saldo a favor del cliente
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 06-obtener-reserva.sql. Se puede repetir sin problema.
--
-- HU "Comprar paquetes online": si el cliente tiene saldo, puede usarlo; se gasta TODO el saldo
-- posible y el resto (si queda) se paga con tarjeta. Si el saldo cubre el total, no hay tarjeta.
--
-- registrar_pago_con_saldo(reserva, cliente, monto_saldo, pagos_restantes, cobrado_por)
--   * Bloquea la reserva y el saldo del cliente: dos pagos simultáneos no pueden gastar el mismo saldo.
--   * Agrega una línea metodo = 'Saldo' a los pagos y llama a registrar_pago (misma transacción).
--   * Descuenta el saldo, guarda el movimiento USO_EN_RESERVA y marca reservas.saldo_utilizado.
--   Errores: SALDO_INSUFICIENTE | MONTO_SALDO_INVALIDO | más los de registrar_pago
--            (RESERVA_NO_ENCONTRADA, RESERVA_NO_PENDIENTE, MONTO_NO_COINCIDE, DATOS_INVALIDOS).

CREATE OR REPLACE FUNCTION public.registrar_pago_con_saldo(
  p_reserva_id   bigint,
  p_cliente_id   bigint,
  p_monto_saldo  numeric,
  p_pagos        jsonb DEFAULT '[]'::jsonb,
  p_cobrado_por  uuid  DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_monto     numeric(12,2) := round(coalesce(p_monto_saldo, 0), 2);
  v_estado    text;
  v_anterior  numeric(12,2);
  v_posterior numeric(12,2);
  v_pagos     jsonb := coalesce(p_pagos, '[]'::jsonb);
  v_resultado jsonb;
begin
  if v_monto <= 0 then raise exception 'MONTO_SALDO_INVALIDO'; end if;
  if jsonb_typeof(v_pagos) <> 'array' then raise exception 'DATOS_INVALIDOS'; end if;

  -- 1. Bloquear la reserva (registrar_pago la vuelve a bloquear: misma transacción, no se traba)
  select estado into v_estado from public.reservas where id = p_reserva_id for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if v_estado <> 'Pendiente' then raise exception 'RESERVA_NO_PENDIENTE'; end if;

  -- 2. Bloquear y comprobar el saldo
  select saldo_disponible into v_anterior
    from public.saldos_cliente where cliente_id = p_cliente_id for update;
  if not found or v_anterior < v_monto then raise exception 'SALDO_INSUFICIENTE'; end if;
  v_posterior := v_anterior - v_monto;

  -- 3. Registrar el pago completo (saldo + lo demás). registrar_pago valida que la suma = total.
  v_resultado := public.registrar_pago(
    p_reserva_id,
    v_pagos || jsonb_build_array(jsonb_build_object('metodo', 'Saldo', 'monto', v_monto)),
    p_cobrado_por
  );

  -- 4. Descontar el saldo y dejar constancia
  update public.saldos_cliente
     set saldo_disponible = v_posterior, actualizado_en = now()
   where cliente_id = p_cliente_id;

  insert into public.movimientos_saldo (
    cliente_id, reserva_id, tipo, monto, saldo_anterior, saldo_posterior,
    clave_idempotencia, descripcion, detalle, creado_por
  ) values (
    p_cliente_id, p_reserva_id, 'USO_EN_RESERVA', v_monto, v_anterior, v_posterior,
    'USO_SALDO_RESERVA:' || p_reserva_id,
    'Saldo a favor usado para pagar la reserva',
    jsonb_build_object('reserva_id', p_reserva_id, 'monto_saldo', v_monto),
    p_cobrado_por
  );

  update public.reservas set saldo_utilizado = v_monto where id = p_reserva_id;

  return v_resultado || jsonb_build_object(
    'saldo_utilizado', v_monto,
    'saldo_disponible', v_posterior
  );
end;
$function$;

-- Solo el Backend (service_role) puede ejecutarla.
REVOKE EXECUTE ON FUNCTION public.registrar_pago_con_saldo(bigint, bigint, numeric, jsonb, uuid) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_con_saldo(bigint, bigint, numeric, jsonb, uuid) TO service_role;
