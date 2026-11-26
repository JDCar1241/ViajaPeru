-- ViajaPeru · Teléfono con código de país para cada acompañante
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 12-libro-reclamaciones.sql. Se puede repetir sin problema.
--
-- 1. acompanantes.telefono ("+51987654321"). Los acompañantes antiguos quedan con NULL.
-- 2. crear_reserva guarda el teléfono de cada acompañante.
-- 3. obtener_reserva y pasajeros_de_salida lo devuelven (portal del cliente y lista del guía).

-- =========================================================
-- 1. COLUMNA NUEVA
-- =========================================================

alter table public.acompanantes
  add column if not exists telefono text;

alter table public.acompanantes
  drop constraint if exists acompanantes_telefono_check;

alter table public.acompanantes
  add constraint acompanantes_telefono_check
  check (telefono is null or telefono ~ '^\+[0-9]{9,15}$');

-- =========================================================
-- 2. crear_reserva (igual que antes + telefono del acompañante)
-- =========================================================

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

  insert into public.acompanantes (reserva_id, tipo_documento, dni, apellidos, nombres, fecha_nacimiento, es_menor, telefono)
  select v_reserva_id,
         coalesce(nullif(a.tipo_documento, ''), 'DNI'),
         a.dni, a.apellidos, a.nombres,
         nullif(a.fecha_nacimiento, '')::date,
         coalesce(extract(year from age(v_fecha, nullif(a.fecha_nacimiento, '')::date)) < 18, false),
         nullif(a.telefono, '')
    from jsonb_to_recordset(v_acomp)
      as a(tipo_documento text, dni text, apellidos text, nombres text, fecha_nacimiento text, telefono text);

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
$function$;

-- =========================================================
-- 3. obtener_reserva (igual que 06 + telefono del acompañante)
-- =========================================================

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
               'es_menor', a.es_menor,
               'telefono', a.telefono
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

-- =========================================================
-- 4. pasajeros_de_salida (igual que 08 + telefono del acompañante)
-- =========================================================

create or replace function public.pasajeros_de_salida(p_salida_id bigint)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'apellidos', x->>'nombres'), '[]'::jsonb)
  from (
    -- Titulares
    select jsonb_build_object(
      'reserva_id', r.id,
      'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
      'acompanante_id', null,
      'es_titular', true,
      'tipo_documento', c.tipo_documento,
      'numero_documento', c.dni,
      'nombres', c.nombres,
      'apellidos', c.apellidos,
      'titular', c.apellidos || ' ' || c.nombres,
      'telefono', c.telefono,
      'es_menor', false,
      'asistencia_en', r.asistencia_en
    ) as x
    from public.reservas r
    join public.clientes c on c.id = r.cliente_id
    where r.salida_id = p_salida_id and r.estado = 'Pagada'

    union all

    -- Acompañantes
    select jsonb_build_object(
      'reserva_id', r.id,
      'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
      'acompanante_id', a.id,
      'es_titular', false,
      'tipo_documento', a.tipo_documento,
      'numero_documento', a.dni,
      'nombres', a.nombres,
      'apellidos', a.apellidos,
      'titular', c.apellidos || ' ' || c.nombres,
      'telefono', a.telefono,
      'es_menor', a.es_menor,
      'asistencia_en', a.asistencia_en
    )
    from public.acompanantes a
    join public.reservas r on r.id = a.reserva_id
    join public.clientes c on c.id = r.cliente_id
    where r.salida_id = p_salida_id and r.estado = 'Pagada'
  ) t;
$$;

-- Solo el Backend (service_role)
revoke execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.obtener_reserva(bigint)                   from public, anon, authenticated;
revoke execute on function public.pasajeros_de_salida(bigint)               from public, anon, authenticated;
grant  execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid) to service_role;
grant  execute on function public.obtener_reserva(bigint)                   to service_role;
grant  execute on function public.pasajeros_de_salida(bigint)               to service_role;
