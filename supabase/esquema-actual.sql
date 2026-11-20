-- ViajaPeru · Esquema REAL de la base (exportado desde Supabase, esquema public)
-- Fecha de exportación: 2026-11-20
--
-- Este archivo es la referencia de cómo está la base HOY.
-- Los archivos 01..05 son el historial de cómo se construyó y están desactualizados.
--
-- Se reconstruyó a partir de consultas al catálogo (no con pg_dump). Para una base nueva:
--   1) ejecutar este archivo completo en el SQL Editor de un proyecto vacío;
--   2) cargar los datos (series_comprobantes y configuracion.tipo_cambio_usd son necesarios).
-- No incluye: permisos (GRANT/REVOKE) de las funciones ni tareas programadas (pg_cron).

-- =========================================================
-- 1. TABLAS
--    Ordenadas para que cada FOREIGN KEY apunte a una tabla ya creada.
-- =========================================================

create table public.paquetes (
  id bigint generated always as identity,
  nombre text not null,
  destino text not null,
  foto_url text,
  costo numeric(10,2) not null,
  itinerario jsonb not null default '[]'::jsonb,
  aclaraciones text,
  creado_en timestamp with time zone not null default now(),
  constraint paquetes_costo_check CHECK ((costo >= (0)::numeric)),
  constraint paquetes_destino_check CHECK ((length(TRIM(BOTH FROM destino)) > 0)),
  constraint paquetes_itinerario_check CHECK ((jsonb_typeof(itinerario) = 'array'::text)),
  constraint paquetes_nombre_check CHECK ((length(TRIM(BOTH FROM nombre)) > 0)),
  constraint paquetes_pkey PRIMARY KEY (id)
);

create table public.salidas (
  id bigint generated always as identity,
  paquete_id bigint not null,
  fecha_inicio_viaje timestamp with time zone not null,
  cupos_totales integer not null,
  cupos_disponibles integer not null,
  estado text not null default 'Activa'::text,
  creado_en timestamp with time zone not null default now(),
  cancelada_en timestamp with time zone,
  motivo_cancelacion text,
  cancelada_por uuid,
  constraint salidas_check CHECK ((cupos_disponibles <= cupos_totales)),
  constraint salidas_cupos_disponibles_check CHECK ((cupos_disponibles >= 0)),
  constraint salidas_cupos_totales_check CHECK ((cupos_totales >= 0)),
  constraint salidas_estado_check CHECK ((estado = ANY (ARRAY['Activa'::text, 'Inactiva'::text, 'Cancelada'::text]))),
  constraint salidas_paquete_id_fkey FOREIGN KEY (paquete_id) REFERENCES paquetes(id) ON DELETE CASCADE,
  constraint salidas_pkey PRIMARY KEY (id)
);

create table public.perfiles (
  id uuid not null,
  nombre text not null,
  rol text not null,
  creado_en timestamp with time zone not null default now(),
  correo text,
  tipo_documento text,
  numero_documento text,
  apellido_paterno text,
  apellido_materno text,
  telefono text,
  fecha_nacimiento date,
  nombres text,
  constraint perfiles_cliente_datos_check CHECK (((rol <> 'Cliente'::text) OR ((tipo_documento IS NOT NULL) AND (numero_documento IS NOT NULL) AND (correo IS NOT NULL) AND (telefono IS NOT NULL)))),
  constraint perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint perfiles_nombre_check CHECK ((length(TRIM(BOTH FROM nombre)) > 0)),
  constraint perfiles_pkey PRIMARY KEY (id),
  constraint perfiles_rol_check CHECK ((rol = ANY (ARRAY['Cliente'::text, 'Guia'::text, 'Administrador'::text, 'Recepcionista'::text]))),
  constraint perfiles_tipo_documento_check CHECK (((tipo_documento IS NULL) OR (tipo_documento = ANY (ARRAY['DNI'::text, 'CE'::text, 'PASAPORTE'::text]))))
);

create table public.clientes (
  id bigint generated always as identity,
  dni text not null,
  apellidos text not null,
  nombres text not null,
  correo text not null,
  telefono text not null,
  creado_en timestamp with time zone not null default now(),
  tipo_documento text not null default 'DNI'::text,
  fecha_nacimiento date,
  constraint clientes_apellidos_check CHECK ((length(TRIM(BOTH FROM apellidos)) > 0)),
  constraint clientes_correo_check CHECK ((correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)),
  constraint clientes_documento_unico UNIQUE (tipo_documento, dni),
  constraint clientes_documento_valido CHECK ((((tipo_documento = 'DNI'::text) AND (dni ~ '^[0-9]{8}$'::text)) OR ((tipo_documento = 'CE'::text) AND (dni ~ '^[A-Za-z0-9]{9,12}$'::text)) OR ((tipo_documento = 'PASAPORTE'::text) AND (dni ~ '^[A-Za-z0-9]{6,12}$'::text)))),
  constraint clientes_nombres_check CHECK ((length(TRIM(BOTH FROM nombres)) > 0)),
  constraint clientes_pkey PRIMARY KEY (id),
  constraint clientes_telefono_check CHECK (((telefono ~ '^[0-9]{9}$'::text) OR (telefono ~ '^\+[0-9]{9,15}$'::text))),
  constraint clientes_tipo_documento_check CHECK ((tipo_documento = ANY (ARRAY['DNI'::text, 'CE'::text, 'PASAPORTE'::text])))
);

create table public.reservas (
  id bigint generated always as identity,
  cliente_id bigint not null,
  salida_id bigint not null,
  num_personas integer not null,
  estado text not null default 'Pendiente'::text,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  total numeric(10,2) not null,
  pagada_en timestamp with time zone,
  fecha_cancelacion timestamp with time zone,
  motivo_cancelacion text,
  tipo_cancelacion text,
  cancelada_por uuid,
  saldo_utilizado numeric(12,2) not null default 0,
  saldo_acreditado numeric(12,2) not null default 0,
  constraint reservas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  constraint reservas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id),
  constraint reservas_estado_check CHECK ((estado = ANY (ARRAY['Pendiente'::text, 'Pagada'::text, 'Cancelada'::text]))),
  constraint reservas_num_personas_check CHECK ((num_personas >= 1)),
  constraint reservas_pkey PRIMARY KEY (id),
  constraint reservas_saldo_acreditado_check CHECK ((saldo_acreditado >= (0)::numeric)),
  constraint reservas_saldo_utilizado_check CHECK ((saldo_utilizado >= (0)::numeric)),
  constraint reservas_salida_id_fkey FOREIGN KEY (salida_id) REFERENCES salidas(id),
  constraint reservas_tipo_cancelacion_check CHECK (((tipo_cancelacion IS NULL) OR (tipo_cancelacion = ANY (ARRAY['Cliente'::text, 'ViajaPeru'::text])))),
  constraint reservas_total_check CHECK ((total >= (0)::numeric))
);

create table public.acompanantes (
  id bigint generated always as identity,
  reserva_id bigint not null,
  dni text not null,
  apellidos text not null,
  nombres text not null,
  tipo_documento text not null default 'DNI'::text,
  fecha_nacimiento date,
  es_menor boolean not null default false,
  constraint acompanantes_apellidos_check CHECK ((length(TRIM(BOTH FROM apellidos)) > 0)),
  constraint acompanantes_documento_unico UNIQUE (reserva_id, tipo_documento, dni),
  constraint acompanantes_documento_valido CHECK ((((tipo_documento = 'DNI'::text) AND (dni ~ '^[0-9]{8}$'::text)) OR ((tipo_documento = 'CE'::text) AND (dni ~ '^[A-Za-z0-9]{9,12}$'::text)) OR ((tipo_documento = 'PASAPORTE'::text) AND (dni ~ '^[A-Za-z0-9]{6,12}$'::text)))),
  constraint acompanantes_nombres_check CHECK ((length(TRIM(BOTH FROM nombres)) > 0)),
  constraint acompanantes_pkey PRIMARY KEY (id),
  constraint acompanantes_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
  constraint acompanantes_tipo_documento_check CHECK ((tipo_documento = ANY (ARRAY['DNI'::text, 'CE'::text, 'PASAPORTE'::text])))
);

create table public.pagos (
  id bigint generated always as identity,
  reserva_id bigint not null,
  total numeric(10,2) not null,
  vuelto numeric(10,2) not null default 0,
  cobrado_por uuid,
  creado_en timestamp with time zone not null default now(),
  proveedor text,
  referencia_pasarela text,
  constraint pagos_cobrado_por_fkey FOREIGN KEY (cobrado_por) REFERENCES auth.users(id),
  constraint pagos_pkey PRIMARY KEY (id),
  constraint pagos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES reservas(id),
  constraint pagos_reserva_id_key UNIQUE (reserva_id),
  constraint pagos_total_check CHECK ((total >= (0)::numeric)),
  constraint pagos_vuelto_check CHECK ((vuelto >= (0)::numeric))
);

create table public.pago_detalles (
  id bigint generated always as identity,
  pago_id bigint not null,
  metodo text not null,
  medio text,
  monto numeric(10,2) not null,
  recibido numeric(10,2),
  referencia text,
  moneda text not null default 'PEN'::text,
  monto_moneda numeric(10,2),
  tipo_cambio numeric(10,4),
  constraint pago_detalles_check CHECK (((metodo = 'QR'::text) = (medio IS NOT NULL))),
  constraint pago_detalles_check1 CHECK (((metodo = 'Efectivo'::text) = (recibido IS NOT NULL))),
  constraint pago_detalles_check2 CHECK (((recibido IS NULL) OR (recibido >= monto))),
  constraint pago_detalles_medio_check CHECK ((medio = ANY (ARRAY['Yape'::text, 'Plin'::text]))),
  constraint pago_detalles_metodo_check CHECK ((metodo = ANY (ARRAY['Efectivo'::text, 'Tarjeta'::text, 'QR'::text, 'Saldo'::text]))),
  constraint pago_detalles_moneda_check CHECK ((moneda = ANY (ARRAY['PEN'::text, 'USD'::text]))),
  constraint pago_detalles_monto_check CHECK ((monto > (0)::numeric)),
  constraint pago_detalles_pago_id_fkey FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
  constraint pago_detalles_pkey PRIMARY KEY (id),
  constraint pago_detalles_saldo_moneda_check CHECK (((metodo <> 'Saldo'::text) OR (moneda = 'PEN'::text)))
);

create table public.series_comprobantes (
  serie text not null,
  tipo text not null,
  ultimo_numero integer not null default 0,
  constraint series_comprobantes_check CHECK ((((tipo = 'Boleta'::text) AND (serie ~~ 'B%'::text)) OR ((tipo = 'Factura'::text) AND (serie ~~ 'F%'::text)))),
  constraint series_comprobantes_pkey PRIMARY KEY (serie),
  constraint series_comprobantes_serie_check CHECK ((serie ~ '^[BF][A-Z0-9]{3}$'::text)),
  constraint series_comprobantes_tipo_check CHECK ((tipo = ANY (ARRAY['Boleta'::text, 'Factura'::text]))),
  constraint series_comprobantes_ultimo_numero_check CHECK ((ultimo_numero >= 0))
);

create table public.comprobantes (
  id bigint generated always as identity,
  reserva_id bigint not null,
  tipo text not null,
  serie text not null,
  numero integer not null,
  comprador_tipo_documento text,
  comprador_documento text,
  comprador_nombre text,
  comprador_direccion text,
  total numeric(10,2) not null,
  detalle jsonb not null,
  emitido_por uuid,
  emitido_en timestamp with time zone not null default now(),
  constraint comprobantes_check CHECK ((((tipo = 'Boleta'::text) AND (serie ~~ 'B%'::text)) OR ((tipo = 'Factura'::text) AND (serie ~~ 'F%'::text)))),
  constraint comprobantes_check1 CHECK ((((tipo = 'Boleta'::text) AND (comprador_tipo_documento IS NULL) AND (comprador_documento IS NULL) AND (comprador_nombre IS NULL) AND (comprador_direccion IS NULL) AND (total <= (700)::numeric)) OR ((tipo = 'Boleta'::text) AND (comprador_nombre IS NOT NULL) AND (comprador_documento IS NOT NULL) AND (((comprador_tipo_documento = 'DNI'::text) AND (comprador_documento ~ '^[0-9]{8}$'::text)) OR ((comprador_tipo_documento = ANY (ARRAY['CE'::text, 'Pasaporte'::text])) AND (comprador_documento ~ '^[A-Z0-9]{6,15}$'::text)))) OR ((tipo = 'Factura'::text) AND (comprador_tipo_documento = 'RUC'::text) AND (comprador_documento ~ '^[0-9]{11}$'::text) AND (comprador_nombre IS NOT NULL) AND (comprador_direccion IS NOT NULL)))),
  constraint comprobantes_emitido_por_fkey FOREIGN KEY (emitido_por) REFERENCES auth.users(id),
  constraint comprobantes_numero_check CHECK ((numero > 0)),
  constraint comprobantes_pkey PRIMARY KEY (id),
  constraint comprobantes_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES reservas(id),
  constraint comprobantes_reserva_id_key UNIQUE (reserva_id),
  constraint comprobantes_serie_fkey FOREIGN KEY (serie) REFERENCES series_comprobantes(serie),
  constraint comprobantes_serie_numero_key UNIQUE (serie, numero),
  constraint comprobantes_tipo_check CHECK ((tipo = ANY (ARRAY['Boleta'::text, 'Factura'::text]))),
  constraint comprobantes_total_check CHECK ((total >= (0)::numeric))
);

create table public.configuracion (
  clave text not null,
  valor text not null,
  actualizado_en timestamp with time zone not null default now(),
  constraint configuracion_pkey PRIMARY KEY (clave)
);

create table public.saldos_cliente (
  id bigint generated by default as identity,
  cliente_id bigint not null,
  saldo_disponible numeric(12,2) not null default 0,
  actualizado_en timestamp with time zone not null default now(),
  constraint saldos_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  constraint saldos_cliente_cliente_id_key UNIQUE (cliente_id),
  constraint saldos_cliente_pkey PRIMARY KEY (id),
  constraint saldos_cliente_saldo_check CHECK ((saldo_disponible >= (0)::numeric))
);

create table public.movimientos_saldo (
  id bigint generated by default as identity,
  cliente_id bigint not null,
  reserva_id bigint,
  salida_id bigint,
  tipo text not null,
  monto numeric(12,2) not null,
  saldo_anterior numeric(12,2) not null,
  saldo_posterior numeric(12,2) not null,
  clave_idempotencia text not null,
  descripcion text,
  detalle jsonb not null default '{}'::jsonb,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  constraint movimientos_saldo_anterior_check CHECK ((saldo_anterior >= (0)::numeric)),
  constraint movimientos_saldo_clave_idempotencia_key UNIQUE (clave_idempotencia),
  constraint movimientos_saldo_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  constraint movimientos_saldo_monto_check CHECK ((monto > (0)::numeric)),
  constraint movimientos_saldo_pkey PRIMARY KEY (id),
  constraint movimientos_saldo_posterior_check CHECK ((saldo_posterior >= (0)::numeric)),
  constraint movimientos_saldo_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES reservas(id),
  constraint movimientos_saldo_salida_id_fkey FOREIGN KEY (salida_id) REFERENCES salidas(id),
  constraint movimientos_saldo_tipo_check CHECK ((tipo = ANY (ARRAY['ACREDITACION_CANCELACION_CLIENTE'::text, 'ACREDITACION_CANCELACION_EMPRESA'::text, 'USO_EN_RESERVA'::text])))
);

-- =========================================================
-- 2. ÍNDICES
--    (los de PRIMARY KEY y UNIQUE ya los crean las tablas de arriba)
-- =========================================================

CREATE INDEX idx_paquetes_costo ON public.paquetes USING btree (costo);
CREATE INDEX idx_salidas_paquete ON public.salidas USING btree (paquete_id);
CREATE INDEX idx_salidas_estado_fecha ON public.salidas USING btree (estado, fecha_inicio_viaje);
CREATE UNIQUE INDEX ux_pagos_referencia_pasarela ON public.pagos USING btree (referencia_pasarela) WHERE (referencia_pasarela IS NOT NULL);
CREATE INDEX idx_acomp_reserva ON public.acompanantes USING btree (reserva_id);
CREATE UNIQUE INDEX perfiles_correo_uk ON public.perfiles USING btree (lower(correo)) WHERE (correo IS NOT NULL);
CREATE UNIQUE INDEX perfiles_documento_uk ON public.perfiles USING btree (tipo_documento, numero_documento) WHERE (numero_documento IS NOT NULL);
CREATE INDEX idx_reservas_salida ON public.reservas USING btree (salida_id);
CREATE INDEX idx_reservas_cliente ON public.reservas USING btree (cliente_id);
CREATE INDEX idx_pago_detalles_pago ON public.pago_detalles USING btree (pago_id);
-- Un mismo cargo de Culqi no puede registrarse dos veces
CREATE UNIQUE INDEX ux_pago_detalles_tarjeta_ref ON public.pago_detalles USING btree (referencia) WHERE ((metodo = 'Tarjeta'::text) AND (referencia IS NOT NULL));
CREATE INDEX idx_movimientos_saldo_cliente ON public.movimientos_saldo USING btree (cliente_id, creado_en DESC);
CREATE INDEX idx_movimientos_saldo_reserva ON public.movimientos_saldo USING btree (reserva_id);
CREATE INDEX idx_movimientos_saldo_salida ON public.movimientos_saldo USING btree (salida_id);

-- =========================================================
-- 3. SEGURIDAD (RLS)
--    Todas las tablas tienen RLS. Solo hay lectura pública del catálogo y del perfil propio;
--    el resto lo usa únicamente el Backend con la llave service_role.
-- =========================================================

alter table public.acompanantes        enable row level security;
alter table public.clientes            enable row level security;
alter table public.comprobantes        enable row level security;
alter table public.configuracion       enable row level security;
alter table public.movimientos_saldo   enable row level security;
alter table public.pago_detalles       enable row level security;
alter table public.pagos               enable row level security;
alter table public.paquetes            enable row level security;
alter table public.perfiles            enable row level security;
alter table public.reservas            enable row level security;
alter table public.saldos_cliente      enable row level security;
alter table public.salidas             enable row level security;
alter table public.series_comprobantes enable row level security;

create policy paquetes_lectura on public.paquetes
  for select to anon, authenticated using (true);

create policy salidas_lectura_activas on public.salidas
  for select to anon, authenticated using ((estado = 'Activa'::text));

create policy perfil_propio on public.perfiles
  for select to authenticated using ((id = auth.uid()));

-- =========================================================
-- 4. FUNCIONES
-- =========================================================

CREATE OR REPLACE FUNCTION public.listar_paquetes(p_lugar text DEFAULT NULL::text, p_fecha_desde date DEFAULT NULL::date, p_fecha_hasta date DEFAULT NULL::date, p_ordenar_por text DEFAULT 'costo'::text, p_orden text DEFAULT 'asc'::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, nombre text, foto_url text, costo numeric, cupos_disponibles integer, proxima_salida timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_paquete(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

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
$function$
;

-- OJO: 06-obtener-reserva.sql reemplaza esta versión (agrega correo, numero_documento y acompañantes).
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
      'nombres', c.nombres,
      'apellidos', c.apellidos
    ),

    'paquete', jsonb_build_object(
      'nombre', p.nombre,
      'foto_url', p.foto_url
    )
  )
  FROM public.reservas r
  JOIN public.clientes c ON c.id = r.cliente_id
  JOIN public.salidas s ON s.id = r.salida_id
  JOIN public.paquetes p ON p.id = s.paquete_id
  WHERE r.id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_reservas(p_estado text DEFAULT 'Pendiente'::text, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_pago(p_reserva_id bigint, p_pagos jsonb, p_cobrado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.emitir_comprobante(p_reserva_id bigint, p_tipo text, p_comprador jsonb DEFAULT NULL::jsonb, p_emitido_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_estado     text;
  v_total      numeric;
  v_personas   integer;
  v_serie      text;
  v_numero     integer;
  v_con_datos  boolean;
  v_tipo_doc   text;
  v_doc        text;
  v_nombre     text;
  v_dir        text;
  v_detalle    jsonb;
  v_id         bigint;
  v_emitido    timestamptz;
begin
  if p_tipo is null or p_tipo not in ('Boleta', 'Factura') then raise exception 'DATOS_INVALIDOS'; end if;

  -- Bloquea la reserva: dos emisiones simultáneas no pueden pasar a la vez
  select estado, total, num_personas into v_estado, v_total, v_personas
    from public.reservas where id = p_reserva_id for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if v_estado <> 'Pagada' then raise exception 'RESERVA_NO_PAGADA'; end if;
  if exists (select 1 from public.comprobantes where reserva_id = p_reserva_id) then
    raise exception 'COMPROBANTE_YA_EMITIDO';
  end if;

  -- Datos del comprador
  v_con_datos := p_comprador is not null and jsonb_typeof(p_comprador) = 'object'
                 and coalesce(trim(p_comprador->>'numero_documento'), '') <> '';
  if v_con_datos then
    v_tipo_doc := p_comprador->>'tipo_documento';
    v_doc      := upper(regexp_replace(p_comprador->>'numero_documento', '\s', '', 'g'));
    v_nombre   := nullif(trim(p_comprador->>'nombre'), '');
    v_dir      := nullif(trim(p_comprador->>'direccion'), '');
  end if;
  if p_tipo = 'Factura' and not v_con_datos then raise exception 'COMPRADOR_REQUERIDO'; end if;
  if p_tipo = 'Boleta' and not v_con_datos and v_total > 700 then raise exception 'COMPRADOR_REQUERIDO'; end if;
  if p_tipo = 'Boleta' then v_dir := null; end if;

  -- Correlativo: el UPDATE bloquea la fila de la serie hasta terminar
  select serie into v_serie from public.series_comprobantes where tipo = p_tipo order by serie limit 1;
  if not found then raise exception 'SERIE_NO_CONFIGURADA'; end if;
  update public.series_comprobantes set ultimo_numero = ultimo_numero + 1
   where serie = v_serie returning ultimo_numero into v_numero;

  -- Copia de lo que se imprime en el PDF
  select jsonb_build_object(
           'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
           'paquete', p.nombre,
           'fecha_inicio_viaje', s.fecha_inicio_viaje,
           'num_personas', r.num_personas,
           'costo_individual', round(r.total / r.num_personas, 2),
           'total', r.total,
           'titular', jsonb_build_object('tipo_documento', coalesce(to_jsonb(c)->>'tipo_documento', 'DNI'),
                                         'numero_documento', coalesce(to_jsonb(c)->>'numero_documento', to_jsonb(c)->>'dni'),
                                         'nombres', c.nombres, 'apellidos', c.apellidos),
           'acompanantes', coalesce((
              select jsonb_agg(jsonb_build_object('tipo_documento', coalesce(to_jsonb(a)->>'tipo_documento', 'DNI'),
                                                  'numero_documento', coalesce(to_jsonb(a)->>'numero_documento', to_jsonb(a)->>'dni'),
                                                  'nombres', a.nombres, 'apellidos', a.apellidos) order by a.id)
                from public.acompanantes a where a.reserva_id = r.id), '[]'::jsonb))
    into v_detalle
    from public.reservas r
    join public.clientes c on c.id = r.cliente_id
    join public.salidas  s on s.id = r.salida_id
    join public.paquetes p on p.id = s.paquete_id
   where r.id = p_reserva_id;

  insert into public.comprobantes (reserva_id, tipo, serie, numero, comprador_tipo_documento, comprador_documento,
                                   comprador_nombre, comprador_direccion, total, detalle, emitido_por)
  values (p_reserva_id, p_tipo, v_serie, v_numero, v_tipo_doc, v_doc, v_nombre, v_dir, v_total, v_detalle, p_emitido_por)
  returning id, emitido_en into v_id, v_emitido;

  return jsonb_build_object('id', v_id, 'reserva_id', p_reserva_id, 'tipo', p_tipo, 'serie', v_serie,
                            'numero', v_numero, 'total', v_total, 'emitido_en', v_emitido,
                            'comprador', case when v_doc is null then null else
                              jsonb_build_object('tipo_documento', v_tipo_doc, 'numero_documento', v_doc,
                                                 'nombre', v_nombre, 'direccion', v_dir) end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.obtener_comprobante(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'id', c.id, 'reserva_id', c.reserva_id, 'tipo', c.tipo, 'serie', c.serie, 'numero', c.numero,
    'total', c.total, 'emitido_en', c.emitido_en,
    'emitido_por_nombre', pf.nombre,
    'comprador', case when c.comprador_documento is null then null else
        jsonb_build_object('tipo_documento', c.comprador_tipo_documento, 'numero_documento', c.comprador_documento,
                           'nombre', c.comprador_nombre, 'direccion', c.comprador_direccion) end,
    'detalle', c.detalle)
  from public.comprobantes c
  left join public.perfiles pf on pf.id = c.emitido_por
  where c.id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.comprobante_de_reserva(p_reserva_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select public.obtener_comprobante(c.id) - 'detalle' - 'emitido_por_nombre'
    from public.comprobantes c where c.reserva_id = p_reserva_id;
$function$
;

CREATE OR REPLACE FUNCTION public.cancelar_reserva_cliente(p_reserva_id bigint, p_cliente_id bigint, p_cancelada_por uuid DEFAULT NULL::uuid, p_motivo text DEFAULT 'Cancelación solicitada por el cliente'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_reserva public.reservas%ROWTYPE;
    v_salida public.salidas%ROWTYPE;
    v_saldo public.saldos_cliente%ROWTYPE;

    v_total_pagado NUMERIC(12,2);
    v_saldo_anterior NUMERIC(12,2);
    v_saldo_posterior NUMERIC(12,2);
    v_acreditado NUMERIC(12,2) := 0;
BEGIN

    -- 1. Bloquear la reserva para evitar operaciones simultáneas.
    SELECT *
    INTO v_reserva
    FROM public.reservas
    WHERE id = p_reserva_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RESERVA_NO_ENCONTRADA';
    END IF;

    -- 2. Verificar que pertenece al cliente autenticado.
    IF v_reserva.cliente_id <> p_cliente_id THEN
        RAISE EXCEPTION 'RESERVA_NO_PERTENECE_CLIENTE';
    END IF;

    -- 3. No permitir cancelar nuevamente.
    IF v_reserva.estado = 'Cancelada' THEN
        RAISE EXCEPTION 'RESERVA_YA_CANCELADA';
    END IF;

    IF v_reserva.estado NOT IN ('Pendiente', 'Pagada') THEN
        RAISE EXCEPTION 'ESTADO_RESERVA_NO_VALIDO';
    END IF;

    -- 4. Bloquear la salida.
    SELECT *
    INTO v_salida
    FROM public.salidas
    WHERE id = v_reserva.salida_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALIDA_NO_ENCONTRADA';
    END IF;

    IF v_salida.estado = 'Cancelada' THEN
        RAISE EXCEPTION 'SALIDA_EN_PROCESO_DE_CANCELACION';
    END IF;

    -- 5. Comprobar las 48 horas para reservas pagadas.
    IF v_reserva.estado = 'Pagada' THEN

        IF v_salida.fecha_inicio_viaje <=
           NOW() + INTERVAL '48 hours' THEN

            RAISE EXCEPTION 'LIMITE_CANCELACION_48_HORAS';
        END IF;

        -- 6. No permitir cancelar desde el portal
        -- una reserva que utilizó saldo a favor.
        IF v_reserva.saldo_utilizado > 0 THEN
            RAISE EXCEPTION 'RESERVA_PAGADA_CON_SALDO';
        END IF;

        -- 7. Comprobar que existe el pago completo.
        SELECT total
        INTO v_total_pagado
        FROM public.pagos
        WHERE reserva_id = p_reserva_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAGO_NO_ENCONTRADO';
        END IF;

        IF ROUND(v_total_pagado, 2) <>
           ROUND(v_reserva.total, 2) THEN

            RAISE EXCEPTION 'IMPORTE_PAGADO_NO_COINCIDE';
        END IF;

        v_acreditado := v_reserva.total;

        -- 8. Crear saldo del cliente si todavía no existe.
        INSERT INTO public.saldos_cliente (
            cliente_id,
            saldo_disponible
        )
        VALUES (
            p_cliente_id,
            0
        )
        ON CONFLICT (cliente_id) DO NOTHING;

        -- 9. Bloquear el saldo.
        SELECT *
        INTO v_saldo
        FROM public.saldos_cliente
        WHERE cliente_id = p_cliente_id
        FOR UPDATE;

        v_saldo_anterior := v_saldo.saldo_disponible;
        v_saldo_posterior := v_saldo_anterior + v_acreditado;

    END IF;

    -- 10. Registrar la cancelación.
    UPDATE public.reservas
    SET
        estado = 'Cancelada',
        fecha_cancelacion = NOW(),
        motivo_cancelacion = COALESCE(
            NULLIF(TRIM(p_motivo), ''),
            'Cancelación solicitada por el cliente'
        ),
        tipo_cancelacion = 'Cliente',
        cancelada_por = p_cancelada_por,
        saldo_acreditado = v_acreditado
    WHERE id = p_reserva_id;

    -- 11. Liberar los cupos una sola vez.
    UPDATE public.salidas
    SET cupos_disponibles = LEAST(
        cupos_totales,
        cupos_disponibles + v_reserva.num_personas
    )
    WHERE id = v_reserva.salida_id;

    -- 12. Acreditar saldo y registrar el movimiento.
    IF v_acreditado > 0 THEN

        UPDATE public.saldos_cliente
        SET
            saldo_disponible = v_saldo_posterior,
            actualizado_en = NOW()
        WHERE cliente_id = p_cliente_id;

        INSERT INTO public.movimientos_saldo (
            cliente_id,
            reserva_id,
            tipo,
            monto,
            saldo_anterior,
            saldo_posterior,
            clave_idempotencia,
            descripcion,
            detalle,
            creado_por
        )
        VALUES (
            p_cliente_id,
            p_reserva_id,
            'ACREDITACION_CANCELACION_CLIENTE',
            v_acreditado,
            v_saldo_anterior,
            v_saldo_posterior,
            'CANCELACION_CLIENTE_RESERVA:' || p_reserva_id,
            'Saldo a favor por cancelación de reserva',
            jsonb_build_object(
                'reserva_id', p_reserva_id,
                'importe_reserva', v_reserva.total,
                'tipo_cancelacion', 'Cliente'
            ),
            p_cancelada_por
        );

    END IF;

    -- 13. Respuesta.
    RETURN jsonb_build_object(
        'ok', TRUE,
        'reserva_id', p_reserva_id,
        'estado', 'Cancelada',
        'saldo_acreditado', v_acreditado,
        'saldo_disponible',
            CASE
                WHEN v_acreditado > 0 THEN v_saldo_posterior
                ELSE NULL
            END,
        'mensaje', 'Reserva cancelada correctamente.'
    );

END;
$function$
;

-- Borra cuentas de clientes que no confirmaron su correo en 24 horas.
-- Se debe ejecutar periódicamente (por ejemplo con pg_cron); esa tarea no está en este archivo.
CREATE OR REPLACE FUNCTION public.eliminar_cuentas_sin_confirmar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_borradas integer;
begin
  with b as (
    delete from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < now() - interval '24 hours'
       and exists (select 1 from public.perfiles p where p.id = u.id and p.rol = 'Cliente')
    returning u.id
  )
  select count(*) into v_borradas from b;
  return v_borradas;
end;
$function$
;
