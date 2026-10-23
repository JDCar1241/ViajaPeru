-- ViajaPeru · TUR-77 Crear base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en Supabase > SQL Editor.

-- =========================================================
-- 1. TABLAS
-- =========================================================
create table if not exists public.paquetes (
  id            bigint generated always as identity primary key,
  nombre        text           not null check (length(trim(nombre)) > 0),
  destino       text           not null check (length(trim(destino)) > 0), -- lo que busca el filtro "lugar"
  foto_url      text,                                                       -- solo la URL, nunca el archivo
  costo         numeric(10,2)  not null check (costo >= 0),
  itinerario    jsonb          not null default '[]'::jsonb
                check (jsonb_typeof(itinerario) = 'array'),                 -- [{ "hora": "06:00", "descripcion": "..." }]
  aclaraciones  text,
  creado_en     timestamptz    not null default now()
);

create table if not exists public.salidas (
  id                  bigint generated always as identity primary key,
  paquete_id          bigint       not null references public.paquetes(id) on delete cascade,
  fecha_inicio_viaje  timestamptz  not null,
  cupos_totales       integer      not null check (cupos_totales >= 0),
  cupos_disponibles   integer      not null check (cupos_disponibles >= 0),
  estado              text         not null default 'Activa'
                      check (estado in ('Activa', 'Inactiva', 'Cancelada')),
  creado_en           timestamptz  not null default now(),
  check (cupos_disponibles <= cupos_totales)
);

-- =========================================================
-- 2. ÍNDICES
-- =========================================================
create index if not exists idx_salidas_paquete on public.salidas (paquete_id);
create index if not exists idx_salidas_estado_fecha on public.salidas (estado, fecha_inicio_viaje);
create index if not exists idx_paquetes_costo on public.paquetes (costo);

-- =========================================================
-- 3. FUNCIÓN DEL CATÁLOGO  ->  GET /api/paquetes
--    Devuelve un paquete por fila, con los cupos de su próxima salida
--    Activa y futura que cumpla el rango de fechas.
--    Si no hay resultados devuelve 0 filas (el Back responde [] con 200).
-- =========================================================
create or replace function public.listar_paquetes(
  p_lugar        text    default null,
  p_fecha_desde  date    default null,
  p_fecha_hasta  date    default null,
  p_ordenar_por  text    default 'costo',   -- 'costo' | 'capacidad'
  p_orden        text    default 'asc',     -- 'asc' | 'desc'
  p_limit        integer default 10,
  p_offset       integer default 0
)
returns table (
  id                 bigint,
  nombre             text,
  foto_url           text,
  costo              numeric,
  cupos_disponibles  integer,
  proxima_salida     timestamptz
)
language sql
stable
as $$
  select p.id, p.nombre, p.foto_url, p.costo, n.cupos_disponibles, n.fecha_inicio_viaje
  from public.paquetes p
  cross join lateral (
    select s.cupos_disponibles, s.fecha_inicio_viaje
    from public.salidas s
    where s.paquete_id = p.id
      and s.estado = 'Activa'
      and s.fecha_inicio_viaje > now()
      and (p_fecha_desde is null or s.fecha_inicio_viaje >= p_fecha_desde)
      and (p_fecha_hasta is null or s.fecha_inicio_viaje <  (p_fecha_hasta + 1))
    order by s.fecha_inicio_viaje
    limit 1
  ) n
  where coalesce(p_lugar, '') = ''
     or p.destino ilike '%' || p_lugar || '%'
     or p.nombre  ilike '%' || p_lugar || '%'
  order by
    case when p_ordenar_por = 'costo'     and p_orden = 'asc'  then p.costo end asc,
    case when p_ordenar_por = 'costo'     and p_orden = 'desc' then p.costo end desc,
    case when p_ordenar_por = 'capacidad' and p_orden = 'asc'  then n.cupos_disponibles end asc,
    case when p_ordenar_por = 'capacidad' and p_orden = 'desc' then n.cupos_disponibles end desc,
    p.id
  limit  least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

-- =========================================================
-- 4. FUNCIÓN DEL DETALLE  ->  GET /api/paquetes/:id
--    Devuelve el paquete + arreglo "salidas" (activas y futuras).
--    Devuelve NULL si el paquete no existe (el Back responde 404).
-- =========================================================
create or replace function public.obtener_paquete(p_id bigint)
returns jsonb
language sql
stable
as $$
  select (to_jsonb(p) - 'creado_en')
         || jsonb_build_object(
              'salidas',
              coalesce((
                select jsonb_agg(
                         jsonb_build_object(
                           'id', s.id,
                           'fecha_inicio_viaje', s.fecha_inicio_viaje,
                           'cupos_disponibles', s.cupos_disponibles,
                           'estado', s.estado)
                         order by s.fecha_inicio_viaje)
                from public.salidas s
                where s.paquete_id = p.id
                  and s.estado = 'Activa'
                  and s.fecha_inicio_viaje > now()
              ), '[]'::jsonb))
  from public.paquetes p
  where p.id = p_id;
$$;

-- =========================================================
-- 5. SEGURIDAD (RLS)
--    Lectura pública solo de lo que se muestra en la web.
--    Escribir (crear/editar) solo con la service_role key del Backend.
-- =========================================================
alter table public.paquetes enable row level security;
alter table public.salidas  enable row level security;

drop policy if exists "paquetes_lectura" on public.paquetes;
create policy "paquetes_lectura" on public.paquetes
  for select to anon, authenticated using (true);

drop policy if exists "salidas_lectura_activas" on public.salidas;
create policy "salidas_lectura_activas" on public.salidas
  for select to anon, authenticated using (estado = 'Activa');