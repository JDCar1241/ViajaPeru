-- ViajaPeru · HU-011 Control de asistencia de pasajeros en el punto de encuentro
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 07-pagar-con-saldo.sql. Se puede repetir sin problema.
--
-- 1. Cada salida puede tener un Guía asignado (salidas.guia_id).
-- 2. Cada pasajero (titular y acompañantes) tiene su check-in: fecha/hora y quién lo marcó.
--    Presente = asistencia_en no es NULL. Desmarcar vuelve a NULL (para corregir errores).
-- 3. Funciones que usa el Backend (solo service_role):
--      salidas_de_guia(guia, desde, hasta)   -> salidas asignadas con su contador
--      pasajeros_de_salida(salida)           -> lista de pasajeros de reservas PAGADAS
--      marcar_asistencia(...)                -> check-in / deshacer check-in
--
-- Para asignar un guía a una salida (mientras no exista una pantalla para hacerlo):
--   update public.salidas
--      set guia_id = (select id from public.perfiles where rol = 'Guia' and lower(correo) = lower('guia@correo.com'))
--    where id = 12;

-- =========================================================
-- 1. COLUMNAS NUEVAS
-- =========================================================

alter table public.salidas
  add column if not exists guia_id uuid references public.perfiles(id);

create index if not exists idx_salidas_guia_fecha
  on public.salidas (guia_id, fecha_inicio_viaje);

-- Check-in del titular de la reserva
alter table public.reservas
  add column if not exists asistencia_en  timestamptz,
  add column if not exists asistencia_por uuid references auth.users(id);

-- Check-in de cada acompañante
alter table public.acompanantes
  add column if not exists asistencia_en  timestamptz,
  add column if not exists asistencia_por uuid references auth.users(id);

-- =========================================================
-- 2. SALIDAS DEL GUÍA
--    p_guia NULL = todas las salidas (para el Administrador).
--    Las fechas se comparan en hora de Lima.
-- =========================================================

create or replace function public.salidas_de_guia(
  p_guia  uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'fecha_inicio_viaje'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', s.id,
      'fecha_inicio_viaje', s.fecha_inicio_viaje,
      'estado', s.estado,
      'paquete', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'destino', p.destino),
      'guia', case when g.id is null then null
                   else jsonb_build_object('id', g.id, 'nombre', g.nombre) end,
      -- Contador: pasajeros de reservas pagadas (titular + acompañantes)
      'esperados', coalesce((
        select sum(r.num_personas) from public.reservas r
         where r.salida_id = s.id and r.estado = 'Pagada'), 0),
      'abordados', coalesce((
        select count(*) from public.reservas r
         where r.salida_id = s.id and r.estado = 'Pagada' and r.asistencia_en is not null), 0)
        + coalesce((
        select count(*) from public.acompanantes a
          join public.reservas r on r.id = a.reserva_id
         where r.salida_id = s.id and r.estado = 'Pagada' and a.asistencia_en is not null), 0)
    ) as x
    from public.salidas s
    join public.paquetes p on p.id = s.paquete_id
    left join public.perfiles g on g.id = s.guia_id
    where (p_guia is null or s.guia_id = p_guia)
      and s.estado <> 'Cancelada'
      and (s.fecha_inicio_viaje at time zone 'America/Lima')::date between p_desde and p_hasta
  ) t;
$$;

-- =========================================================
-- 3. PASAJEROS DE UNA SALIDA (solo reservas pagadas)
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
      'telefono', null,
      'es_menor', a.es_menor,
      'asistencia_en', a.asistencia_en
    )
    from public.acompanantes a
    join public.reservas r on r.id = a.reserva_id
    join public.clientes c on c.id = r.cliente_id
    where r.salida_id = p_salida_id and r.estado = 'Pagada'
  ) t;
$$;

-- =========================================================
-- 4. MARCAR / DESMARCAR ASISTENCIA
--    p_acompanante_id NULL = el titular de la reserva.
--    Errores: RESERVA_NO_ENCONTRADA | RESERVA_NO_PAGADA | ACOMPANANTE_NO_ENCONTRADO
-- =========================================================

create or replace function public.marcar_asistencia(
  p_salida_id       bigint,
  p_reserva_id      bigint,
  p_acompanante_id  bigint,
  p_presente        boolean,
  p_marcado_por     uuid
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_estado text;
  v_en     timestamptz := case when p_presente then now() else null end;
  v_por    uuid        := case when p_presente then p_marcado_por else null end;
begin
  select estado into v_estado
    from public.reservas
   where id = p_reserva_id and salida_id = p_salida_id
   for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if v_estado <> 'Pagada' then raise exception 'RESERVA_NO_PAGADA'; end if;

  if p_acompanante_id is null then
    update public.reservas
       set asistencia_en = v_en, asistencia_por = v_por
     where id = p_reserva_id;
  else
    update public.acompanantes
       set asistencia_en = v_en, asistencia_por = v_por
     where id = p_acompanante_id and reserva_id = p_reserva_id;
    if not found then raise exception 'ACOMPANANTE_NO_ENCONTRADO'; end if;
  end if;

  return jsonb_build_object(
    'reserva_id', p_reserva_id,
    'acompanante_id', p_acompanante_id,
    'presente', p_presente,
    'asistencia_en', v_en
  );
end;
$$;

-- =========================================================
-- 5. SEGURIDAD: solo el Backend (service_role)
-- =========================================================

revoke execute on function public.salidas_de_guia(uuid, date, date)                     from public, anon, authenticated;
revoke execute on function public.pasajeros_de_salida(bigint)                           from public, anon, authenticated;
revoke execute on function public.marcar_asistencia(bigint, bigint, bigint, boolean, uuid) from public, anon, authenticated;
grant  execute on function public.salidas_de_guia(uuid, date, date)                     to service_role;
grant  execute on function public.pasajeros_de_salida(bigint)                           to service_role;
grant  execute on function public.marcar_asistencia(bigint, bigint, bigint, boolean, uuid) to service_role;
