-- ViajaPeru · TUR-70 (historia: Cobrar reserva de paquetes)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 03_reservas.sql. Una sola vez.

-- =========================================================
-- 1. RESERVAS: nuevos estados y total guardado
--    Estados: Pendiente (antes "Confirmada") -> Pagada | Cancelada
-- =========================================================
alter table public.reservas drop constraint if exists reservas_estado_check;
update public.reservas set estado = 'Pendiente' where estado = 'Confirmada';
alter table public.reservas
  add constraint reservas_estado_check check (estado in ('Pendiente', 'Pagada', 'Cancelada'));
alter table public.reservas alter column estado set default 'Pendiente';

alter table public.reservas add column if not exists total numeric(10,2);
alter table public.reservas add column if not exists pagada_en timestamptz;

-- Reservas que ya existían: total = costo del paquete x personas
update public.reservas r
   set total = p.costo * r.num_personas
  from public.salidas s
  join public.paquetes p on p.id = s.paquete_id
 where s.id = r.salida_id and r.total is null;

alter table public.reservas alter column total set not null;
alter table public.reservas drop constraint if exists reservas_total_check;
alter table public.reservas add constraint reservas_total_check check (total >= 0);

-- =========================================================
-- 2. PAGOS: un pago por reserva, con una línea por cada medio usado
-- =========================================================
create table if not exists public.pagos (
  id           bigint generated always as identity primary key,
  reserva_id   bigint        not null unique references public.reservas(id),
  total        numeric(10,2) not null check (total >= 0),
  vuelto       numeric(10,2) not null default 0 check (vuelto >= 0),
  cobrado_por  uuid          references auth.users(id),
  creado_en    timestamptz   not null default now()
);

create table if not exists public.pago_detalles (
  id          bigint generated always as identity primary key,
  pago_id     bigint        not null references public.pagos(id) on delete cascade,
  metodo      text          not null check (metodo in ('Efectivo', 'Tarjeta', 'QR')),
  medio       text          check (medio in ('Yape', 'Plin')),     -- solo para QR
  monto       numeric(10,2) not null check (monto > 0),            -- lo que se aplica a la reserva
  recibido    numeric(10,2),                                       -- solo efectivo
  referencia  text,
  check ((metodo = 'QR') = (medio is not null)),
  check ((metodo = 'Efectivo') = (recibido is not null)),
  check (recibido is null or recibido >= monto)
);
create index if not exists idx_pago_detalles_pago on public.pago_detalles (pago_id);

-- =========================================================
-- 3. crear_reserva (reemplaza la anterior): ahora guarda el total
-- =========================================================
create or replace function public.crear_reserva(
  p_salida_id    bigint,
  p_cliente      jsonb,
  p_acompanantes jsonb default '[]'::jsonb,
  p_creado_por   uuid  default null
)
returns jsonb
language plpgsql
as $$
declare
  v_acomp       jsonb := coalesce(p_acompanantes, '[]'::jsonb);
  v_personas    integer;
  v_cupos       integer;
  v_costo       numeric;
  v_cliente_id  bigint;
  v_reserva_id  bigint;
begin
  if jsonb_typeof(v_acomp) <> 'array' or p_cliente is null then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_personas := 1 + jsonb_array_length(v_acomp);

  select p.costo into v_costo
    from public.salidas s join public.paquetes p on p.id = s.paquete_id
   where s.id = p_salida_id and s.estado = 'Activa' and s.fecha_inicio_viaje > now();
  if not found then raise exception 'SALIDA_NO_DISPONIBLE'; end if;

  update public.salidas
     set cupos_disponibles = cupos_disponibles - v_personas
   where id = p_salida_id and cupos_disponibles >= v_personas
  returning cupos_disponibles into v_cupos;
  if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;

  insert into public.clientes (dni, apellidos, nombres, correo, telefono)
  values (p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres',
          p_cliente->>'correo', p_cliente->>'telefono')
  on conflict (dni) do update
     set apellidos = excluded.apellidos, nombres  = excluded.nombres,
         correo    = excluded.correo,    telefono = excluded.telefono
  returning id into v_cliente_id;

  insert into public.reservas (cliente_id, salida_id, num_personas, total, creado_por)
  values (v_cliente_id, p_salida_id, v_personas, v_costo * v_personas, p_creado_por)
  returning id into v_reserva_id;

  insert into public.acompanantes (reserva_id, dni, apellidos, nombres)
  select v_reserva_id, a.dni, a.apellidos, a.nombres
    from jsonb_to_recordset(v_acomp) as a(dni text, apellidos text, nombres text);

  return jsonb_build_object(
    'id', v_reserva_id,
    'codigo', 'VP-' || lpad(v_reserva_id::text, 6, '0'),
    'num_personas', v_personas,
    'total', v_costo * v_personas,
    'cupos_restantes', v_cupos
  );
end;
$$;

-- =========================================================
-- 4. CONSULTAS PARA EL COBRO
--    obtener_reserva(id)  -> GET /api/reservas/:id   (NULL si no existe)
--    listar_reservas(...) -> GET /api/reservas?estado=&q=  (busca por DNI o código VP-000012)
-- =========================================================
create or replace function public.obtener_reserva(p_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', r.id,
    'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
    'estado', r.estado,
    'num_personas', r.num_personas,
    'total', r.total,
    'fecha_inicio_viaje', s.fecha_inicio_viaje,
    'cliente', jsonb_build_object('dni', c.dni, 'nombres', c.nombres, 'apellidos', c.apellidos),
    'paquete', jsonb_build_object('nombre', p.nombre)
  )
  from public.reservas r
  join public.clientes c on c.id = r.cliente_id
  join public.salidas  s on s.id = r.salida_id
  join public.paquetes p on p.id = s.paquete_id
  where r.id = p_id;
$$;

create or replace function public.listar_reservas(
  p_estado text    default 'Pendiente',
  p_q      text    default null,
  p_limit  integer default 50
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(public.obtener_reserva(t.id) order by t.id desc), '[]'::jsonb)
  from (
    select r.id
    from public.reservas r
    join public.clientes c on c.id = r.cliente_id
    where (p_estado is null or r.estado = p_estado)
      and (
        coalesce(trim(p_q), '') = ''
        or c.dni like trim(p_q) || '%'
        or (case when upper(trim(p_q)) ~ '^VP-?[0-9]+$'
                 then r.id = regexp_replace(upper(trim(p_q)), '[^0-9]', '', 'g')::bigint
                 else false end)
      )
    order by r.id desc
    limit least(greatest(p_limit, 1), 100)
  ) t;
$$;

-- =========================================================
-- 5. FUNCIÓN QUE REGISTRA EL PAGO  ->  POST /api/reservas/:id/pagos
--    Una sola transacción. La suma de los montos debe ser igual al total.
--    El vuelto sale solo del efectivo (recibido - monto).
--    Errores: RESERVA_NO_ENCONTRADA | RESERVA_NO_PENDIENTE | MONTO_NO_COINCIDE | DATOS_INVALIDOS
-- =========================================================
create or replace function public.registrar_pago(
  p_reserva_id   bigint,
  p_pagos        jsonb,
  p_cobrado_por  uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_total    numeric;
  v_estado   text;
  v_suma     numeric;
  v_vuelto   numeric;
  v_pago_id  bigint;
begin
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array'
     or jsonb_array_length(p_pagos) not between 1 and 10 then
    raise exception 'DATOS_INVALIDOS';
  end if;

  -- Bloquea la reserva: dos cobros simultáneos no pueden pasar a la vez
  select total, estado into v_total, v_estado
    from public.reservas where id = p_reserva_id for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if v_estado <> 'Pendiente' then raise exception 'RESERVA_NO_PENDIENTE'; end if;

  select coalesce(sum(round((x->>'monto')::numeric, 2)), 0),
         coalesce(sum(greatest(coalesce((x->>'recibido')::numeric, (x->>'monto')::numeric)
                               - (x->>'monto')::numeric, 0))
                  filter (where x->>'metodo' = 'Efectivo'), 0)
    into v_suma, v_vuelto
    from jsonb_array_elements(p_pagos) x;

  if v_suma <> v_total then raise exception 'MONTO_NO_COINCIDE'; end if;

  insert into public.pagos (reserva_id, total, vuelto, cobrado_por)
  values (p_reserva_id, v_total, v_vuelto, p_cobrado_por)
  returning id into v_pago_id;

  insert into public.pago_detalles (pago_id, metodo, medio, monto, recibido, referencia)
  select v_pago_id,
         d.metodo,
         case when d.metodo = 'QR' then d.medio end,
         round(d.monto, 2),
         case when d.metodo = 'Efectivo' then round(coalesce(d.recibido, d.monto), 2) end,
         nullif(trim(d.referencia), '')
    from jsonb_to_recordset(p_pagos)
      as d(metodo text, medio text, monto numeric, recibido numeric, referencia text);

  update public.reservas set estado = 'Pagada', pagada_en = now() where id = p_reserva_id;

  return jsonb_build_object('id', v_pago_id, 'reserva_id', p_reserva_id,
                            'total', v_total, 'vuelto', v_vuelto, 'estado', 'Pagada');
end;
$$;

-- =========================================================
-- 6. SEGURIDAD: solo el Backend (service_role) puede usar estas tablas y funciones
-- =========================================================
alter table public.pagos         enable row level security;
alter table public.pago_detalles enable row level security;

revoke execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid)  from public, anon, authenticated;
revoke execute on function public.obtener_reserva(bigint)                    from public, anon, authenticated;
revoke execute on function public.listar_reservas(text, text, integer)       from public, anon, authenticated;
revoke execute on function public.registrar_pago(bigint, jsonb, uuid)        from public, anon, authenticated;
grant  execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid)  to service_role;
grant  execute on function public.obtener_reserva(bigint)                    to service_role;
grant  execute on function public.listar_reservas(text, text, integer)       to service_role;
grant  execute on function public.registrar_pago(bigint, jsonb, uuid)        to service_role;