-- ViajaPeru · TUR-77 (historia: Registrar reserva presencialmente)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 01_schema.sql.

-- =========================================================
-- 1. PERFILES (rol de cada usuario)
--    El correo y la contraseña los maneja Supabase Auth (Authentication > Users).
--    Esta tabla solo guarda el nombre y el rol.
-- =========================================================
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null check (length(trim(nombre)) > 0),
  rol       text not null check (rol in ('Cliente', 'Guia', 'Gerente', 'Recepcionista')),
  creado_en timestamptz not null default now()
);

-- =========================================================
-- 2. CLIENTES, RESERVAS Y ACOMPAÑANTES
-- =========================================================
create table if not exists public.clientes (
  id         bigint generated always as identity primary key,
  dni        text not null unique check (dni ~ '^[0-9]{8}$'),
  apellidos  text not null check (length(trim(apellidos)) > 0),
  nombres    text not null check (length(trim(nombres)) > 0),
  correo     text not null check (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telefono   text not null check (telefono ~ '^[0-9]{9}$'),
  creado_en  timestamptz not null default now()
);

create table if not exists public.reservas (
  id            bigint generated always as identity primary key,
  cliente_id    bigint      not null references public.clientes(id),
  salida_id     bigint      not null references public.salidas(id),
  num_personas  integer     not null check (num_personas >= 1),
  estado        text        not null default 'Confirmada' check (estado in ('Confirmada', 'Cancelada')),
  creado_por    uuid        references auth.users(id),   -- quién la registró (recepcionista)
  creado_en     timestamptz not null default now()
);

create table if not exists public.acompanantes (
  id          bigint generated always as identity primary key,
  reserva_id  bigint not null references public.reservas(id) on delete cascade,
  dni         text   not null check (dni ~ '^[0-9]{8}$'),
  apellidos   text   not null check (length(trim(apellidos)) > 0),
  nombres     text   not null check (length(trim(nombres)) > 0),
  unique (reserva_id, dni)
);

create index if not exists idx_reservas_salida  on public.reservas (salida_id);
create index if not exists idx_reservas_cliente on public.reservas (cliente_id);
create index if not exists idx_acomp_reserva    on public.acompanantes (reserva_id);

-- =========================================================
-- 3. FUNCIÓN QUE CREA LA RESERVA  ->  POST /api/reservas
--    Todo ocurre en una sola transacción: si algo falla, no se descuenta nada.
--    El UPDATE de cupos es atómico: dos recepcionistas no pueden vender el mismo cupo.
--    Errores que el Back debe traducir:
--      SALIDA_NO_DISPONIBLE -> 409 | CUPOS_INSUFICIENTES -> 409 | DATOS_INVALIDOS -> 400
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
  v_cliente_id  bigint;
  v_reserva_id  bigint;
begin
  if jsonb_typeof(v_acomp) <> 'array' or p_cliente is null then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_personas := 1 + jsonb_array_length(v_acomp);

  -- La salida debe existir, estar Activa y ser futura
  perform 1 from public.salidas
   where id = p_salida_id and estado = 'Activa' and fecha_inicio_viaje > now();
  if not found then raise exception 'SALIDA_NO_DISPONIBLE'; end if;

  -- Descuenta cupos solo si alcanzan (cliente + acompañantes <= cupos restantes)
  update public.salidas
     set cupos_disponibles = cupos_disponibles - v_personas
   where id = p_salida_id and cupos_disponibles >= v_personas
  returning cupos_disponibles into v_cupos;
  if not found then raise exception 'CUPOS_INSUFICIENTES'; end if;

  -- Cliente repetido (mismo DNI): se reutiliza y se actualizan sus datos
  insert into public.clientes (dni, apellidos, nombres, correo, telefono)
  values (p_cliente->>'dni', p_cliente->>'apellidos', p_cliente->>'nombres',
          p_cliente->>'correo', p_cliente->>'telefono')
  on conflict (dni) do update
     set apellidos = excluded.apellidos, nombres  = excluded.nombres,
         correo    = excluded.correo,    telefono = excluded.telefono
  returning id into v_cliente_id;

  insert into public.reservas (cliente_id, salida_id, num_personas, creado_por)
  values (v_cliente_id, p_salida_id, v_personas, p_creado_por)
  returning id into v_reserva_id;

  insert into public.acompanantes (reserva_id, dni, apellidos, nombres)
  select v_reserva_id, a.dni, a.apellidos, a.nombres
    from jsonb_to_recordset(v_acomp) as a(dni text, apellidos text, nombres text);

  return jsonb_build_object(
    'id', v_reserva_id,
    'codigo', 'VP-' || lpad(v_reserva_id::text, 6, '0'),
    'num_personas', v_personas,
    'cupos_restantes', v_cupos
  );
end;
$$;

-- =========================================================
-- 4. SEGURIDAD
--    Estas tablas NO tienen lectura pública: solo el Backend (service_role) las usa.
-- =========================================================
alter table public.perfiles     enable row level security;
alter table public.clientes     enable row level security;
alter table public.reservas     enable row level security;
alter table public.acompanantes enable row level security;

drop policy if exists "perfil_propio" on public.perfiles;
create policy "perfil_propio" on public.perfiles
  for select to authenticated using (id = auth.uid());

revoke execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.crear_reserva(bigint, jsonb, jsonb, uuid) to service_role;

-- =========================================================
-- 5. PRIMER USUARIO (hazlo después de crearlo en Authentication > Users)
--    Copia el UUID del usuario y descomenta:
-- =========================================================
-- insert into public.perfiles (id, nombre, rol)
-- values ('PEGA-AQUI-EL-UUID', 'Nombre Apellido', 'Recepcionista');