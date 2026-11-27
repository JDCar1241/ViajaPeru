-- ViajaPeru · Concurrencia de reservas: apartar cupos en cuanto el cliente indica cuántas personas viajan
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 15-reclamos-pasaporte.sql. Se puede repetir sin problema.
-- Ejecutarlo ANTES de desplegar el Backend.
--
-- Criterio de aceptación: "El sistema debe crear una reserva en cuanto el cliente indica cuántas personas
-- viajan, y descontarlas del stock del paquete".
--
-- Flujo de la compra online:
--   1. apartar_cupos      -> reserva 'Borrador' con N personas; los cupos se descuentan YA (atómico).
--                            Vence en 30 min si no se completan los datos.
--   2. completar_reserva  -> titular + exactamente N-1 acompañantes; pasa a 'Pendiente' y tiene 30 min para pagarse.
--   3. registrar_pago     -> 'Pagada' (sin cambios; un trigger impide pagar una reserva ya vencida).
--   Si vence: liberar_reservas_vencidas la pasa a 'Vencida' y devuelve los cupos.
-- La reserva presencial (personal de caja) sigue usando crear_reserva y no vence.
--
-- Por qué no hay sobreventa: el descuento es un único UPDATE ... WHERE cupos_disponibles >= n.
-- Postgres bloquea la fila de la salida; dos reservas simultáneas se ejecutan una tras otra y la
-- segunda vuelve a evaluar la condición con el stock ya descontado. Además CHECK (cupos_disponibles >= 0).
--
-- Programar la liberación cada minuto (Supabase > Database > Extensions > pg_cron, y luego):
--   select cron.schedule('liberar-reservas-vencidas', '* * * * *', $$select public.liberar_reservas_vencidas()$$);
-- Aunque no se programe, se libera igual al apartar en esa salida y cuando el Backend consulta paquetes.

-- =========================================================
-- 1. ESTADOS NUEVOS Y VENCIMIENTO
-- =========================================================

alter table public.reservas drop constraint if exists reservas_estado_check;
alter table public.reservas
  add constraint reservas_estado_check
  check (estado in ('Borrador', 'Pendiente', 'Pagada', 'Cancelada', 'Vencida'));

alter table public.reservas add column if not exists expira_en timestamptz;

create index if not exists idx_reservas_por_vencer
  on public.reservas (expira_en)
  where estado in ('Borrador', 'Pendiente') and expira_en is not null;

-- =========================================================
-- 2. LIBERAR RESERVAS VENCIDAS
--    p_salida_id: solo esa salida (lo usa apartar_cupos) o NULL = todas (pg_cron / Backend).
--    SKIP LOCKED: si una reserva se está pagando o cancelando en este momento, se salta y
--    se revisa en la siguiente pasada (nunca se bloquea ni se libera dos veces).
--    Margen de 2 minutos: un pago con tarjeta que empezó antes del vencimiento alcanza a registrarse
--    (el Backend no inicia cobros de reservas ya vencidas).
-- =========================================================

create or replace function public.liberar_reservas_vencidas(p_salida_id bigint default null)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  r   record;
  n   integer := 0;
begin
  for r in
    select id, salida_id, num_personas
      from public.reservas
     where estado in ('Borrador', 'Pendiente')
       and expira_en is not null
       and expira_en < now() - interval '2 minutes' -- mismo margen que el trigger del punto 5
       and (p_salida_id is null or salida_id = p_salida_id)
     order by salida_id, id
       for update skip locked
  loop
    update public.reservas set estado = 'Vencida' where id = r.id;
    update public.salidas
       set cupos_disponibles = least(cupos_totales, cupos_disponibles + r.num_personas)
     where id = r.salida_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- =========================================================
-- 3. APARTAR CUPOS (paso 1 de la compra online)
--    Si la cuenta ya tiene un borrador vigente en esa salida, se ajusta (no se aparta dos veces).
--    p_cliente: datos de la cuenta, como titular provisional (completar_reserva puede cambiarlo).
--    Errores: DATOS_INVALIDOS | SALIDA_NO_DISPONIBLE | CUPOS_INSUFICIENTES
-- =========================================================

create or replace function public.apartar_cupos(
  p_salida_id bigint,
  p_personas  integer,
  p_cliente   jsonb,
  p_usuario   uuid,
  p_minutos   integer default 30
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_costo       numeric;
  v_cupos       integer;
  v_cliente_id  bigint;
  v_reserva     public.reservas%rowtype;
  v_diferencia  integer;
  v_expira      timestamptz := now() + make_interval(mins => greatest(coalesce(p_minutos, 30), 1));
begin
  if p_personas is null or p_personas < 1 or p_personas > 21 or p_cliente is null then
    raise exception 'DATOS_INVALIDOS';
  end if;

  -- Antes de apartar, devolver a esta salida los cupos de reservas vencidas
  perform public.liberar_reservas_vencidas(p_salida_id);

  select p.costo into v_costo
    from public.salidas s join public.paquetes p on p.id = s.paquete_id
   where s.id = p_salida_id and s.estado = 'Activa' and s.fecha_inicio_viaje > now();
  if not found then raise exception 'SALIDA_NO_DISPONIBLE'; end if;

  -- ¿Ya hay un borrador vigente de esta cuenta en esta salida? (p. ej. cambió la cantidad de personas)
  if p_usuario is not null then
    select * into v_reserva
      from public.reservas
     where creado_por = p_usuario and salida_id = p_salida_id
       and estado = 'Borrador' and expira_en > now()
     order by id desc
     limit 1
       for update;
  end if;

  if v_reserva.id is not null then
    v_diferencia := p_personas - v_reserva.num_personas;
    if v_diferencia > 0 then
      update public.salidas
         set cupos_disponibles = cupos_disponibles - v_diferencia
       where id = p_salida_id and cupos_disponibles >= v_diferencia
      returning cupos_disponibles into v_cupos;
      if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;
    else
      update public.salidas
         set cupos_disponibles = least(cupos_totales, cupos_disponibles - v_diferencia)
       where id = p_salida_id
      returning cupos_disponibles into v_cupos;
    end if;

    update public.reservas
       set num_personas = p_personas, total = v_costo * p_personas, expira_en = v_expira
     where id = v_reserva.id;
  else
    -- Descuento atómico del stock: si no alcanza, no se crea nada
    update public.salidas
       set cupos_disponibles = cupos_disponibles - p_personas
     where id = p_salida_id and cupos_disponibles >= p_personas
    returning cupos_disponibles into v_cupos;
    if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;

    insert into public.clientes (tipo_documento, dni, apellidos, nombres, fecha_nacimiento, correo, telefono, nacionalidad)
    values (coalesce(nullif(p_cliente->>'tipo_documento', ''), 'DNI'),
            p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres',
            nullif(p_cliente->>'fecha_nacimiento', '')::date,
            p_cliente->>'correo', p_cliente->>'telefono', nullif(p_cliente->>'nacionalidad', ''))
    on conflict (tipo_documento, dni) do update
       set apellidos = excluded.apellidos, nombres = excluded.nombres,
           fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.clientes.fecha_nacimiento),
           correo = excluded.correo, telefono = excluded.telefono,
           nacionalidad = coalesce(excluded.nacionalidad, public.clientes.nacionalidad)
    returning id into v_cliente_id;

    insert into public.reservas (cliente_id, salida_id, num_personas, total, creado_por, estado, expira_en)
    values (v_cliente_id, p_salida_id, p_personas, v_costo * p_personas, p_usuario, 'Borrador', v_expira)
    returning * into v_reserva;
  end if;

  return jsonb_build_object(
    'id', v_reserva.id,
    'codigo', 'VP-' || lpad(v_reserva.id::text, 6, '0'),
    'estado', 'Borrador',
    'num_personas', p_personas,
    'total', v_costo * p_personas,
    'expira_en', v_expira,
    'cupos_restantes', v_cupos
  );
end;
$$;

-- =========================================================
-- 4. COMPLETAR RESERVA (paso 2: titular y acompañantes)
--    Exige exactamente num_personas - 1 acompañantes. No toca el stock (ya se descontó al apartar).
--    Errores: RESERVA_NO_ENCONTRADA | RESERVA_VENCIDA | RESERVA_NO_BORRADOR | PERSONAS_NO_COINCIDEN
--             | CLIENTE_MENOR | DATOS_INVALIDOS
-- =========================================================

create or replace function public.completar_reserva(
  p_reserva_id   bigint,
  p_usuario      uuid,
  p_cliente      jsonb,
  p_acompanantes jsonb default '[]'::jsonb,
  p_minutos_pago integer default 30
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_acomp       jsonb := coalesce(p_acompanantes, '[]'::jsonb);
  v_reserva     public.reservas%rowtype;
  v_fecha       date;
  v_nac         date;
  v_cliente_id  bigint;
  v_menores     integer;
  v_expira      timestamptz;
begin
  if jsonb_typeof(v_acomp) <> 'array' or p_cliente is null then
    raise exception 'DATOS_INVALIDOS';
  end if;

  select * into v_reserva from public.reservas where id = p_reserva_id for update;
  if not found or v_reserva.creado_por is distinct from p_usuario then
    raise exception 'RESERVA_NO_ENCONTRADA';
  end if;
  if v_reserva.estado = 'Vencida' or (v_reserva.estado = 'Borrador' and v_reserva.expira_en < now()) then
    raise exception 'RESERVA_VENCIDA';
  end if;
  if v_reserva.estado <> 'Borrador' then raise exception 'RESERVA_NO_BORRADOR'; end if;

  if 1 + jsonb_array_length(v_acomp) <> v_reserva.num_personas then
    raise exception 'PERSONAS_NO_COINCIDEN';
  end if;

  select (s.fecha_inicio_viaje at time zone 'UTC')::date into v_fecha
    from public.salidas s where s.id = v_reserva.salida_id;

  -- El titular debe ser mayor de edad el día de la salida
  v_nac := nullif(p_cliente->>'fecha_nacimiento', '')::date;
  if v_nac is not null and extract(year from age(v_fecha, v_nac)) < 18 then
    raise exception 'CLIENTE_MENOR';
  end if;

  insert into public.clientes (tipo_documento, dni, apellidos, nombres, fecha_nacimiento, correo, telefono, nacionalidad)
  values (coalesce(nullif(p_cliente->>'tipo_documento', ''), 'DNI'),
          p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres', v_nac,
          p_cliente->>'correo', p_cliente->>'telefono', nullif(p_cliente->>'nacionalidad', ''))
  on conflict (tipo_documento, dni) do update
     set apellidos = excluded.apellidos, nombres = excluded.nombres,
         fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.clientes.fecha_nacimiento),
         correo = excluded.correo, telefono = excluded.telefono,
         nacionalidad = coalesce(excluded.nacionalidad, public.clientes.nacionalidad)
  returning id into v_cliente_id;

  v_expira := now() + make_interval(mins => greatest(coalesce(p_minutos_pago, 30), 1));

  update public.reservas
     set cliente_id = v_cliente_id, estado = 'Pendiente', expira_en = v_expira
   where id = p_reserva_id;

  delete from public.acompanantes where reserva_id = p_reserva_id;
  insert into public.acompanantes (reserva_id, tipo_documento, dni, apellidos, nombres, fecha_nacimiento, es_menor, telefono, nacionalidad)
  select p_reserva_id,
         coalesce(nullif(a.tipo_documento, ''), 'DNI'),
         a.dni, a.apellidos, a.nombres,
         nullif(a.fecha_nacimiento, '')::date,
         coalesce(extract(year from age(v_fecha, nullif(a.fecha_nacimiento, '')::date)) < 18, false),
         nullif(a.telefono, ''),
         nullif(a.nacionalidad, '')
    from jsonb_to_recordset(v_acomp)
      as a(tipo_documento text, dni text, apellidos text, nombres text, fecha_nacimiento text, telefono text, nacionalidad text);

  select count(*) into v_menores from public.acompanantes where reserva_id = p_reserva_id and es_menor;

  return jsonb_build_object(
    'id', p_reserva_id,
    'codigo', 'VP-' || lpad(p_reserva_id::text, 6, '0'),
    'estado', 'Pendiente',
    'num_personas', v_reserva.num_personas,
    'num_menores', v_menores,
    'total', v_reserva.total,
    'expira_en', v_expira
  );
end;
$$;

-- =========================================================
-- 5. NO PAGAR UNA RESERVA VENCIDA
--    registrar_pago y registrar_pago_con_saldo bloquean la reserva y la pasan a 'Pagada'.
--    Este trigger rechaza ese cambio si el plazo venció hace más de 2 minutos (margen para un
--    cobro con tarjeta que empezó a tiempo). El Backend devuelve el cargo si el SQL falla.
-- =========================================================

create or replace function public.reservas_controlar_vencimiento()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.estado = 'Pagada' and old.estado <> 'Pagada' then
    if old.estado = 'Borrador' then
      raise exception 'RESERVA_INCOMPLETA';
    end if;
    if old.expira_en is not null and old.expira_en < now() - interval '2 minutes' then
      raise exception 'RESERVA_VENCIDA';
    end if;
    new.expira_en := null; -- pagada: ya no vence
  end if;
  if new.estado = 'Cancelada' then
    new.expira_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_controlar_vencimiento on public.reservas;
create trigger reservas_controlar_vencimiento
  before update of estado on public.reservas
  for each row execute function public.reservas_controlar_vencimiento();

-- =========================================================
-- 6. crear_reserva (presencial) y obtener_reserva: + nacionalidad y expira_en
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

  perform public.liberar_reservas_vencidas(p_salida_id);

  select p.costo, (s.fecha_inicio_viaje at time zone 'UTC')::date into v_costo, v_fecha
    from public.salidas s join public.paquetes p on p.id = s.paquete_id
   where s.id = p_salida_id and s.estado = 'Activa' and s.fecha_inicio_viaje > now();
  if not found then raise exception 'SALIDA_NO_DISPONIBLE'; end if;

  v_nac := nullif(p_cliente->>'fecha_nacimiento', '')::date;
  if v_nac is not null and extract(year from age(v_fecha, v_nac)) < 18 then
    raise exception 'CLIENTE_MENOR';
  end if;

  update public.salidas
     set cupos_disponibles = cupos_disponibles - v_personas
   where id = p_salida_id and cupos_disponibles >= v_personas
  returning cupos_disponibles into v_cupos;
  if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;

  insert into public.clientes (tipo_documento, dni, apellidos, nombres, fecha_nacimiento, correo, telefono, nacionalidad)
  values (coalesce(nullif(p_cliente->>'tipo_documento', ''), 'DNI'),
          p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres', v_nac,
          p_cliente->>'correo', p_cliente->>'telefono', nullif(p_cliente->>'nacionalidad', ''))
  on conflict (tipo_documento, dni) do update
     set apellidos = excluded.apellidos, nombres = excluded.nombres,
         fecha_nacimiento = coalesce(excluded.fecha_nacimiento, public.clientes.fecha_nacimiento),
         correo = excluded.correo, telefono = excluded.telefono,
         nacionalidad = coalesce(excluded.nacionalidad, public.clientes.nacionalidad)
  returning id into v_cliente_id;

  insert into public.reservas (cliente_id, salida_id, num_personas, total, creado_por)
  values (v_cliente_id, p_salida_id, v_personas, v_costo * v_personas, p_creado_por)
  returning id into v_reserva_id;

  insert into public.acompanantes (reserva_id, tipo_documento, dni, apellidos, nombres, fecha_nacimiento, es_menor, telefono, nacionalidad)
  select v_reserva_id,
         coalesce(nullif(a.tipo_documento, ''), 'DNI'),
         a.dni, a.apellidos, a.nombres,
         nullif(a.fecha_nacimiento, '')::date,
         coalesce(extract(year from age(v_fecha, nullif(a.fecha_nacimiento, '')::date)) < 18, false),
         nullif(a.telefono, ''),
         nullif(a.nacionalidad, '')
    from jsonb_to_recordset(v_acomp)
      as a(tipo_documento text, dni text, apellidos text, nombres text, fecha_nacimiento text, telefono text, nacionalidad text);

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
    'expira_en', r.expira_en,
    'fecha_inicio_viaje', s.fecha_inicio_viaje,

    'cliente', jsonb_build_object(
      'tipo_documento', c.tipo_documento,
      'dni', c.dni,
      'numero_documento', c.dni,
      'nombres', c.nombres,
      'apellidos', c.apellidos,
      'nacionalidad', c.nacionalidad,
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
               'nacionalidad', a.nacionalidad,
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
-- 7. PERMISOS: solo el Backend (service_role)
-- =========================================================

revoke execute on function public.liberar_reservas_vencidas(bigint)                       from public, anon, authenticated;
revoke execute on function public.apartar_cupos(bigint, integer, jsonb, uuid, integer)    from public, anon, authenticated;
revoke execute on function public.completar_reserva(bigint, uuid, jsonb, jsonb, integer)  from public, anon, authenticated;
revoke execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid)               from public, anon, authenticated;
revoke execute on function public.obtener_reserva(bigint)                                 from public, anon, authenticated;
grant  execute on function public.liberar_reservas_vencidas(bigint)                       to service_role;
grant  execute on function public.apartar_cupos(bigint, integer, jsonb, uuid, integer)    to service_role;
grant  execute on function public.completar_reserva(bigint, uuid, jsonb, jsonb, integer)  to service_role;
grant  execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid)               to service_role;
grant  execute on function public.obtener_reserva(bigint)                                 to service_role;
