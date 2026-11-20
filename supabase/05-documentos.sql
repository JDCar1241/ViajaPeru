CREATE OR REPLACE FUNCTION public.crear_reserva(p_salida_id bigint, p_cliente jsonb, p_acompanantes jsonb DEFAULT '[]'::jsonb, p_creado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_acomp       jsonb := coalesce(p_acompanantes, '[]'::jsonb);
  v_personas    integer;
  v_cupos       integer;
  v_costo       numeric;
  v_fecha       date;
  v_nac         date;
  v_menores     integer;
  v_cliente_id  bigint;
  v_reserva_id  bigint;
begin
  if jsonb_typeof(v_acomp) <> 'array' or p_cliente is null then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_personas := 1 + jsonb_array_length(v_acomp);

  select p.costo, (s.fecha_inicio_viaje at time zone 'UTC')::date into v_costo, v_fecha
    from public.salidas s join public.paquetes p on p.id = s.paquete_id
   where s.id = p_salida_id and s.estado = 'Activa' and s.fecha_inicio_viaje > now();
  if not found then raise exception 'SALIDA_NO_DISPONIBLE'; end if;

  -- El cliente que reserva debe ser mayor de edad el día de la salida
  v_nac := nullif(p_cliente->>'fecha_nacimiento', '')::date;
  if v_nac is not null and extract(year from age(v_fecha, v_nac)) < 18 then
    raise exception 'CLIENTE_MENOR';
  end if;

  update public.salidas
     set cupos_disponibles = cupos_disponibles - v_personas
   where id = p_salida_id and cupos_disponibles >= v_personas
  returning cupos_disponibles into v_cupos;
  if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;

  insert into public.clientes (tipo_documento, dni, apellidos, nombres, fecha_nacimiento, correo, telefono)
  values (coalesce(nullif(p_cliente->>'tipo_documento', ''), 'DNI'),
          p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres', v_nac,
          p_cliente->>'correo', p_cliente->>'telefono')
  on conflict (tipo_documento, dni) do update
     set apellidos = excluded.apellidos, nombres = excluded.nombres,
         fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.clientes.fecha_nacimiento),
         correo = excluded.correo, telefono = excluded.telefono
  returning id into v_cliente_id;

  insert into public.reservas (cliente_id, salida_id, num_personas, total, creado_por)
  values (v_cliente_id, p_salida_id, v_personas, v_costo * v_personas, p_creado_por)
  returning id into v_reserva_id;

  insert into public.acompanantes (reserva_id, tipo_documento, dni, apellidos, nombres, fecha_nacimiento, es_menor)
  select v_reserva_id,
         coalesce(nullif(a.tipo_documento, ''), 'DNI'),
         a.dni, a.apellidos, a.nombres,
         nullif(a.fecha_nacimiento, '')::date,
         coalesce(extract(year from age(v_fecha, nullif(a.fecha_nacimiento, '')::date)) < 18, false)
    from jsonb_to_recordset(v_acomp)
      as a(tipo_documento text, dni text, apellidos text, nombres text, fecha_nacimiento text);

  select count(*) into v_menores from public.acompanantes where reserva_id = v_reserva_id and es_menor;

  return jsonb_build_object(
    'id', v_reserva_id,
    'codigo', 'VP-' || lpad(v_reserva_id::text, 6, '0'),
    'num_personas', v_personas,
    'num_menores', v_menores,
    'total', v_costo * v_personas,
    'cupos_restantes', v_cupos
  );
end;