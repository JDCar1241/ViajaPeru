-- ViajaPeru · Precio de cada paquete en soles (PEN) o dólares (USD)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 16-apartar-cupos.sql. Se puede repetir sin problema.
-- Ejecutarlo ANTES de desplegar el Backend.
--
-- Cómo funciona:
--   * paquetes.moneda: moneda del precio por persona (paquetes.costo).
--   * Al crearse la reserva se fijan su moneda, el precio en esa moneda (total_moneda) y, si es USD,
--     el tipo de cambio del día (configuracion.tipo_cambio_usd). Ese tipo de cambio ya no cambia.
--   * reservas.total sigue en SOLES (equivalente al tipo de cambio fijado). Así los pagos, el saldo a
--     favor (siempre en soles), las cancelaciones y el tope de S/ 700 de la boleta funcionan igual.
--   * El cliente ve y paga el precio en la moneda del paquete; el comprobante sale en esa moneda.
-- Las reservas y comprobantes antiguos quedan en PEN.

-- =========================================================
-- 1. COLUMNAS
-- =========================================================

alter table public.paquetes add column if not exists moneda text not null default 'PEN';
alter table public.paquetes drop constraint if exists paquetes_moneda_check;
alter table public.paquetes add constraint paquetes_moneda_check check (moneda in ('PEN', 'USD'));

alter table public.reservas add column if not exists moneda       text not null default 'PEN';
alter table public.reservas add column if not exists total_moneda numeric(10,2);
alter table public.reservas add column if not exists tipo_cambio  numeric(10,4);
update public.reservas set total_moneda = total where total_moneda is null;
alter table public.reservas drop constraint if exists reservas_moneda_check;
alter table public.reservas add constraint reservas_moneda_check check (
  (moneda = 'PEN' and tipo_cambio is null) or (moneda = 'USD' and tipo_cambio > 0)
);

alter table public.comprobantes add column if not exists moneda       text not null default 'PEN';
alter table public.comprobantes add column if not exists total_moneda numeric(10,2);
alter table public.comprobantes add column if not exists tipo_cambio  numeric(10,4);
update public.comprobantes set total_moneda = total where total_moneda is null;
alter table public.comprobantes drop constraint if exists comprobantes_moneda_check;
alter table public.comprobantes add constraint comprobantes_moneda_check check (moneda in ('PEN', 'USD'));

-- =========================================================
-- 2. MONEDA DE LA RESERVA (trigger: vale para la reserva online y la presencial)
--    Al crearla: moneda y precio del paquete; con USD, el tipo de cambio del día.
--    Al cambiar la cantidad de personas (apartado): se mantiene el precio unitario y el tipo de cambio.
-- =========================================================

create or replace function public.reservas_fijar_moneda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_moneda text;
  v_costo  numeric;
  v_tc     numeric;
begin
  if tg_op = 'UPDATE' then
    -- Moneda, tipo de cambio y precio unitario quedan como se fijaron al crear la reserva
    new.moneda := old.moneda;
    new.tipo_cambio := old.tipo_cambio;
    new.total_moneda := round(old.total_moneda / old.num_personas * new.num_personas, 2);
  else
    select p.moneda, p.costo into v_moneda, v_costo
      from public.salidas s join public.paquetes p on p.id = s.paquete_id
     where s.id = new.salida_id;

    new.moneda := coalesce(v_moneda, 'PEN');
    if new.moneda = 'USD' then
      select nullif(trim(valor), '')::numeric into v_tc from public.configuracion where clave = 'tipo_cambio_usd';
      if v_tc is null or v_tc < 1 or v_tc > 20 then raise exception 'TIPO_CAMBIO_NO_CONFIGURADO'; end if;
      new.tipo_cambio := v_tc;
      new.total_moneda := round(v_costo * new.num_personas, 2);
    else
      new.tipo_cambio := null;
      new.total_moneda := new.total;
    end if;
  end if;

  -- Total en soles (contabilidad interna)
  new.total := case when new.moneda = 'USD'
                    then round(new.total_moneda * new.tipo_cambio, 2)
                    else new.total_moneda end;
  return new;
end;
$$;

drop trigger if exists reservas_fijar_moneda on public.reservas;
create trigger reservas_fijar_moneda
  before insert or update of num_personas on public.reservas
  for each row execute function public.reservas_fijar_moneda();

-- =========================================================
-- 3. MONEDA DEL COMPROBANTE (trigger): la de la reserva, también dentro de "detalle" (PDF)
-- =========================================================

create or replace function public.comprobantes_fijar_moneda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  r public.reservas%rowtype;
begin
  select * into r from public.reservas where id = new.reserva_id;
  new.moneda := coalesce(r.moneda, 'PEN');
  new.total_moneda := coalesce(r.total_moneda, new.total);
  new.tipo_cambio := r.tipo_cambio;
  new.detalle := coalesce(new.detalle, '{}'::jsonb) || jsonb_build_object(
    'moneda', new.moneda,
    'total_moneda', new.total_moneda,
    'tipo_cambio', new.tipo_cambio,
    'costo_individual_moneda', round(new.total_moneda / greatest(r.num_personas, 1), 2)
  );
  return new;
end;
$$;

drop trigger if exists comprobantes_fijar_moneda on public.comprobantes;
create trigger comprobantes_fijar_moneda
  before insert on public.comprobantes
  for each row execute function public.comprobantes_fijar_moneda();

-- =========================================================
-- 4. CATÁLOGO: la moneda viaja con el precio; ordenar por precio compara en soles
--    (obtener_paquete y admin_obtener_paquete ya devuelven todas las columnas del paquete)
-- =========================================================

drop function if exists public.listar_paquetes(text, date, date, text, text, integer, integer);
create function public.listar_paquetes(
  p_lugar text DEFAULT NULL::text, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date,
  p_ordenar_por text DEFAULT 'costo'::text, p_orden text DEFAULT 'asc'::text,
  p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, nombre text, foto_url text, costo numeric, moneda text, cupos_disponibles integer, proxima_salida timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  with tc as (
    select coalesce((select nullif(trim(valor), '')::numeric from public.configuracion where clave = 'tipo_cambio_usd'), 1) as usd
  )
  select p.id, p.nombre, p.foto_url, p.costo, p.moneda, n.cupos_disponibles, n.fecha_inicio_viaje
  from public.paquetes p
  cross join tc
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
    case when p_ordenar_por = 'costo'     and p_orden = 'asc'  then p.costo * case when p.moneda = 'USD' then tc.usd else 1 end end asc,
    case when p_ordenar_por = 'costo'     and p_orden = 'desc' then p.costo * case when p.moneda = 'USD' then tc.usd else 1 end end desc,
    case when p_ordenar_por = 'capacidad' and p_orden = 'asc'  then n.cupos_disponibles end asc,
    case when p_ordenar_por = 'capacidad' and p_orden = 'desc' then n.cupos_disponibles end desc,
    p.id
  limit  least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$function$;

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
      'moneda', p.moneda,
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
-- 5. obtener_reserva y obtener_comprobante: + moneda
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
    'moneda', r.moneda,
    'total_moneda', r.total_moneda,
    'tipo_cambio', r.tipo_cambio,
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

CREATE OR REPLACE FUNCTION public.obtener_comprobante(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'id', c.id, 'reserva_id', c.reserva_id, 'tipo', c.tipo, 'serie', c.serie, 'numero', c.numero,
    'total', c.total, 'moneda', c.moneda, 'total_moneda', coalesce(c.total_moneda, c.total), 'tipo_cambio', c.tipo_cambio,
    'emitido_en', c.emitido_en,
    'emitido_por_nombre', pf.nombre,
    'comprador', case when c.comprador_documento is null then null else
        jsonb_build_object('tipo_documento', c.comprador_tipo_documento, 'numero_documento', c.comprador_documento,
                           'nombre', c.comprador_nombre, 'direccion', c.comprador_direccion) end,
    'detalle', c.detalle)
  from public.comprobantes c
  left join public.perfiles pf on pf.id = c.emitido_por
  where c.id = p_id;
$function$;

-- =========================================================
-- 6. PERMISOS: solo el Backend (service_role)
-- =========================================================

revoke execute on function public.listar_paquetes(text, date, date, text, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.listar_paquetes(text, date, date, text, text, integer, integer) to service_role;
revoke execute on function public.obtener_reserva(bigint)     from public, anon, authenticated;
grant  execute on function public.obtener_reserva(bigint)     to service_role;
revoke execute on function public.obtener_comprobante(bigint) from public, anon, authenticated;
grant  execute on function public.obtener_comprobante(bigint) to service_role;
