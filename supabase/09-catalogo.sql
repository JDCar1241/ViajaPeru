-- ViajaPeru · HU-009 Gestionar catálogo de paquetes
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 08-asistencia-guias.sql. Se puede repetir sin problema.
--
-- Funciones que usa el Backend (solo service_role):
--   admin_listar_paquetes()          -> todos los paquetes con resumen de salidas y reservas
--   admin_obtener_paquete(id)        -> paquete con TODAS sus salidas (cualquier estado), ocupación y guía
--   admin_editar_salida(...)         -> cambia fecha, cupos, guía y estado sin romper los cupos ya reservados
--
-- Reglas:
--   * Los cupos totales nunca pueden quedar por debajo de los cupos ya reservados.
--   * La fecha de una salida con reservas activas no se puede cambiar (los clientes ya compraron esa fecha).
--   * El guía asignado debe tener rol Guia.
--   * Las fotos se guardan en el bucket público "paquetes" de Storage (ver sección 4).

-- =========================================================
-- 1. LISTADO PARA EL ADMINISTRADOR
-- =========================================================

create or replace function public.admin_listar_paquetes()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id,
      'nombre', p.nombre,
      'destino', p.destino,
      'foto_url', p.foto_url,
      'costo', p.costo,
      'salidas_futuras', (
        select count(*) from public.salidas s
         where s.paquete_id = p.id and s.estado = 'Activa' and s.fecha_inicio_viaje > now()),
      'proxima_salida', (
        select min(s.fecha_inicio_viaje) from public.salidas s
         where s.paquete_id = p.id and s.estado = 'Activa' and s.fecha_inicio_viaje > now()),
      'reservas', (
        select count(*) from public.reservas r join public.salidas s on s.id = r.salida_id
         where s.paquete_id = p.id)
    ) as x
    from public.paquetes p
  ) t;
$$;

-- =========================================================
-- 2. DETALLE PARA EL ADMINISTRADOR
-- =========================================================

create or replace function public.admin_obtener_paquete(p_id bigint)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select (to_jsonb(p) - 'creado_en')
         || jsonb_build_object(
              'salidas',
              coalesce((
                select jsonb_agg(
                         jsonb_build_object(
                           'id', s.id,
                           'fecha_inicio_viaje', s.fecha_inicio_viaje,
                           'cupos_totales', s.cupos_totales,
                           'cupos_disponibles', s.cupos_disponibles,
                           'estado', s.estado,
                           'reservas_activas', (
                             select count(*) from public.reservas r
                              where r.salida_id = s.id and r.estado in ('Pendiente', 'Pagada')),
                           'reservas', (
                             select count(*) from public.reservas r where r.salida_id = s.id),
                           'guia', case when g.id is null then null
                                        else jsonb_build_object('id', g.id, 'nombre', g.nombre) end)
                         order by s.fecha_inicio_viaje desc)
                from public.salidas s
                left join public.perfiles g on g.id = s.guia_id
                where s.paquete_id = p.id
              ), '[]'::jsonb))
  from public.paquetes p
  where p.id = p_id;
$$;

-- =========================================================
-- 3. EDITAR UNA SALIDA
--    Los parámetros NULL no se cambian. Para quitar el guía: p_quitar_guia = true.
--    Bloquea la fila para no chocar con una reserva que se esté creando en ese momento.
-- =========================================================

create or replace function public.admin_editar_salida(
  p_id            bigint,
  p_fecha         timestamptz default null,
  p_cupos_totales integer     default null,
  p_guia_id       uuid        default null,
  p_quitar_guia   boolean     default false,
  p_estado        text        default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_salida   public.salidas%rowtype;
  v_ocupados integer;
  v_activas  integer;
begin
  select * into v_salida from public.salidas where id = p_id for update;
  if not found then raise exception 'SALIDA_NO_ENCONTRADA'; end if;

  if v_salida.estado = 'Cancelada' then raise exception 'SALIDA_CANCELADA'; end if;

  v_ocupados := v_salida.cupos_totales - v_salida.cupos_disponibles;

  select count(*) into v_activas
    from public.reservas
   where salida_id = p_id and estado in ('Pendiente', 'Pagada');

  if p_fecha is not null and p_fecha <> v_salida.fecha_inicio_viaje then
    if p_fecha <= now() then raise exception 'FECHA_PASADA'; end if;
    if v_activas > 0 then raise exception 'FECHA_CON_RESERVAS'; end if;
  end if;

  if p_cupos_totales is not null then
    if p_cupos_totales < 1 then raise exception 'CUPOS_INVALIDOS'; end if;
    if p_cupos_totales < v_ocupados then raise exception 'CUPOS_MENOR_A_RESERVADOS'; end if;
  end if;

  if p_guia_id is not null
     and not exists (select 1 from public.perfiles where id = p_guia_id and rol = 'Guia') then
    raise exception 'GUIA_NO_VALIDO';
  end if;

  if p_estado is not null and p_estado not in ('Activa', 'Inactiva') then
    raise exception 'ESTADO_NO_VALIDO';
  end if;

  update public.salidas
     set fecha_inicio_viaje = coalesce(p_fecha, fecha_inicio_viaje),
         cupos_totales      = coalesce(p_cupos_totales, cupos_totales),
         cupos_disponibles  = coalesce(p_cupos_totales, cupos_totales) - v_ocupados,
         guia_id            = case when p_quitar_guia then null else coalesce(p_guia_id, guia_id) end,
         estado             = coalesce(p_estado, estado)
   where id = p_id
  returning * into v_salida;

  return jsonb_build_object(
    'id', v_salida.id,
    'fecha_inicio_viaje', v_salida.fecha_inicio_viaje,
    'cupos_totales', v_salida.cupos_totales,
    'cupos_disponibles', v_salida.cupos_disponibles,
    'estado', v_salida.estado,
    'guia_id', v_salida.guia_id
  );
end;
$$;

-- =========================================================
-- 4. FOTOS DE LOS PAQUETES (Supabase Storage)
--    Bucket público: cualquiera puede VER las fotos del catálogo.
--    Sin políticas de escritura: solo el Backend (service_role) sube y borra.
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paquetes', 'paquetes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo el Backend (service_role) puede ejecutarlas
revoke all on function public.admin_listar_paquetes()  from public, anon, authenticated;
revoke all on function public.admin_obtener_paquete(bigint) from public, anon, authenticated;
revoke all on function public.admin_editar_salida(bigint, timestamptz, integer, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_listar_paquetes()  to service_role;
grant execute on function public.admin_obtener_paquete(bigint) to service_role;
grant execute on function public.admin_editar_salida(bigint, timestamptz, integer, uuid, boolean, text) to service_role;
