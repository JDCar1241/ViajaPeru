-- ViajaPeru · HU-006 Realizar pago virtual: pago con Yape verificado por el personal
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 09-catalogo.sql. Se puede repetir sin problema.
--
-- Con un Yape personal no hay API que avise del pago. Flujo:
--   1. El cliente ve el número/QR de Yape y el monto, yapea y envía el N° de operación.
--      Se crea una solicitud "En verificación" (la reserva sigue Pendiente y con sus cupos apartados).
--   2. Recepcionista/Administrador revisa su app de Yape y CONFIRMA o RECHAZA.
--      Confirmar registra el pago (metodo 'QR', medio 'Yape') con registrar_pago o
--      registrar_pago_con_saldo en la MISMA transacción; luego el Backend emite y envía la boleta.
--
-- Configuración (tabla configuracion, se puede cambiar sin tocar el código):
--   yape_numero   -> número que ve el cliente
--   yape_titular  -> (opcional) nombre que aparece en Yape al yapear
--   yape_qr_url   -> (opcional) enlace a la imagen del QR, cuando lo tengas

-- =========================================================
-- 1. SOLICITUDES DE PAGO CON YAPE
-- =========================================================

create table if not exists public.solicitudes_yape (
  id               bigint generated always as identity primary key,
  reserva_id       bigint not null references public.reservas(id),
  cliente_id       bigint not null references public.clientes(id),
  numero_operacion text   not null check (numero_operacion ~ '^[0-9]{4,20}$'),
  monto            numeric(10,2) not null check (monto > 0),          -- lo yapeado (soles)
  saldo_a_usar     numeric(10,2) not null default 0 check (saldo_a_usar >= 0),
  estado           text   not null default 'En verificación'
                   check (estado in ('En verificación', 'Confirmado', 'Rechazado')),
  motivo_rechazo   text,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  revisado_por     uuid references auth.users(id),
  revisado_en      timestamptz,
  pago_id          bigint references public.pagos(id)
);

-- Solo una solicitud en verificación por reserva
create unique index if not exists ux_yape_reserva_en_verificacion
  on public.solicitudes_yape (reserva_id) where estado = 'En verificación';

-- Un mismo N° de operación no se puede usar dos veces (salvo que se haya rechazado)
create unique index if not exists ux_yape_operacion
  on public.solicitudes_yape (numero_operacion) where estado <> 'Rechazado';

create index if not exists idx_yape_estado on public.solicitudes_yape (estado, creado_en);

alter table public.solicitudes_yape enable row level security;  -- sin políticas: solo service_role

-- =========================================================
-- 2. CONFIGURACIÓN DE YAPE
-- =========================================================

insert into public.configuracion (clave, valor)
values ('yape_numero', '902393788')
on conflict (clave) do nothing;

-- Para mostrar el QR cuando lo tengas (después de subir la imagen):
--   insert into public.configuracion (clave, valor) values ('yape_qr_url', 'https://...')
--   on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
-- Para mostrar el nombre del titular:
--   insert into public.configuracion (clave, valor) values ('yape_titular', 'Nombre Apellido')
--   on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

-- =========================================================
-- 3. CONFIRMAR UNA SOLICITUD
--    Errores: SOLICITUD_NO_ENCONTRADA | SOLICITUD_YA_REVISADA | más los de registrar_pago(_con_saldo)
-- =========================================================

create or replace function public.confirmar_pago_yape(p_solicitud_id bigint, p_revisado_por uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_s     public.solicitudes_yape%rowtype;
  v_pagos jsonb;
  v_pago  jsonb;
begin
  select * into v_s from public.solicitudes_yape where id = p_solicitud_id for update;
  if not found then raise exception 'SOLICITUD_NO_ENCONTRADA'; end if;
  if v_s.estado <> 'En verificación' then raise exception 'SOLICITUD_YA_REVISADA'; end if;

  v_pagos := jsonb_build_array(jsonb_build_object(
    'metodo', 'QR', 'medio', 'Yape', 'monto', v_s.monto, 'referencia', v_s.numero_operacion));

  if v_s.saldo_a_usar > 0 then
    v_pago := public.registrar_pago_con_saldo(v_s.reserva_id, v_s.cliente_id, v_s.saldo_a_usar, v_pagos, p_revisado_por);
  else
    v_pago := public.registrar_pago(v_s.reserva_id, v_pagos, p_revisado_por);
  end if;

  update public.pagos set proveedor = 'Yape', referencia_pasarela = v_s.numero_operacion
   where id = (v_pago->>'id')::bigint;

  update public.solicitudes_yape
     set estado = 'Confirmado', revisado_por = p_revisado_por, revisado_en = now(),
         pago_id = (v_pago->>'id')::bigint
   where id = p_solicitud_id;

  return v_pago || jsonb_build_object('solicitud_id', p_solicitud_id, 'reserva_id', v_s.reserva_id);
end;
$$;

-- =========================================================
-- 4. RECHAZAR UNA SOLICITUD (el cliente puede volver a intentarlo)
-- =========================================================

create or replace function public.rechazar_pago_yape(p_solicitud_id bigint, p_revisado_por uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_s public.solicitudes_yape%rowtype;
begin
  select * into v_s from public.solicitudes_yape where id = p_solicitud_id for update;
  if not found then raise exception 'SOLICITUD_NO_ENCONTRADA'; end if;
  if v_s.estado <> 'En verificación' then raise exception 'SOLICITUD_YA_REVISADA'; end if;

  update public.solicitudes_yape
     set estado = 'Rechazado', revisado_por = p_revisado_por, revisado_en = now(),
         motivo_rechazo = coalesce(nullif(trim(p_motivo), ''), 'No encontramos el pago en Yape.')
   where id = p_solicitud_id;

  return jsonb_build_object('solicitud_id', p_solicitud_id, 'reserva_id', v_s.reserva_id, 'estado', 'Rechazado');
end;
$$;

-- =========================================================
-- 5. LISTADO PARA EL PERSONAL
-- =========================================================

create or replace function public.listar_solicitudes_yape(p_estado text default 'En verificación', p_limit integer default 100)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by (x->>'creado_en')), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', y.id,
      'reserva_id', y.reserva_id,
      'codigo', 'VP-' || lpad(r.id::text, 6, '0'),
      'numero_operacion', y.numero_operacion,
      'monto', y.monto,
      'saldo_a_usar', y.saldo_a_usar,
      'estado', y.estado,
      'motivo_rechazo', y.motivo_rechazo,
      'creado_en', y.creado_en,
      'revisado_en', y.revisado_en,
      'revisado_por', pf.nombre,
      'reserva_estado', r.estado,
      'total', r.total,
      'cliente', jsonb_build_object('nombres', c.nombres, 'apellidos', c.apellidos,
                                    'tipo_documento', c.tipo_documento, 'documento', c.dni,
                                    'telefono', c.telefono),
      'paquete', p.nombre,
      'fecha_inicio_viaje', s.fecha_inicio_viaje
    ) as x
    from public.solicitudes_yape y
    join public.reservas r on r.id = y.reserva_id
    join public.clientes c on c.id = y.cliente_id
    join public.salidas  s on s.id = r.salida_id
    join public.paquetes p on p.id = s.paquete_id
    left join public.perfiles pf on pf.id = y.revisado_por
    where p_estado is null or y.estado = p_estado
    order by y.creado_en desc
    limit least(greatest(p_limit, 1), 200)
  ) t;
$$;

-- Solo el Backend (service_role) puede ejecutarlas
revoke all on function public.confirmar_pago_yape(bigint, uuid)          from public, anon, authenticated;
revoke all on function public.rechazar_pago_yape(bigint, uuid, text)     from public, anon, authenticated;
revoke all on function public.listar_solicitudes_yape(text, integer)     from public, anon, authenticated;
grant execute on function public.confirmar_pago_yape(bigint, uuid)       to service_role;
grant execute on function public.rechazar_pago_yape(bigint, uuid, text)  to service_role;
grant execute on function public.listar_solicitudes_yape(text, integer)  to service_role;
