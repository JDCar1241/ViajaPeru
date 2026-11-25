-- ViajaPeru · Libro de Reclamaciones virtual (requisito de INDECOPI y de Culqi para producción)
-- Ejecutar completo en Supabase > SQL Editor. Se puede repetir sin problema.
--
-- Cada hoja recibe un número correlativo (el id) y se muestra como 000001-2026.
-- La fecha límite de respuesta (15 días hábiles) la calcula el Backend al registrar la hoja.
-- Solo el Backend (service_role) lee y escribe esta tabla.

create table if not exists public.reclamos (
  id                  bigint generated always as identity primary key,
  creado_en           timestamptz not null default now(),

  tipo                text not null check (tipo in ('Reclamo', 'Queja')),

  -- Consumidor
  consumidor_nombre   text not null check (char_length(consumidor_nombre) between 3 and 150),
  tipo_documento      text not null check (tipo_documento in ('DNI', 'CE', 'PASAPORTE')),
  numero_documento    text not null check (char_length(numero_documento) between 6 and 12),
  domicilio           text not null check (char_length(domicilio) between 5 and 250),
  telefono            text not null check (char_length(telefono) between 6 and 16),
  correo              text not null check (char_length(correo) between 5 and 150),
  es_menor            boolean not null default false,
  apoderado           text check (apoderado is null or char_length(apoderado) between 3 and 150),

  -- Bien contratado
  bien_tipo           text not null default 'Servicio' check (bien_tipo in ('Producto', 'Servicio')),
  bien_descripcion    text not null check (char_length(bien_descripcion) between 3 and 300),
  monto               numeric(10, 2) check (monto is null or monto >= 0),
  codigo_reserva      text check (codigo_reserva is null or codigo_reserva ~ '^VP-[0-9]{6}$'),

  -- Detalle
  detalle             text not null check (char_length(detalle) between 10 and 3000),
  pedido              text not null check (char_length(pedido) between 5 and 2000),

  -- Respuesta del proveedor
  fecha_limite        date not null,
  estado              text not null default 'Pendiente' check (estado in ('Pendiente', 'Respondido')),
  respuesta           text check (respuesta is null or char_length(respuesta) between 10 and 4000),
  respondido_en       timestamptz,
  respondido_por      uuid references auth.users(id),

  constraint reclamos_menor_con_apoderado check (not es_menor or apoderado is not null),
  constraint reclamos_respuesta_completa check (
    (estado = 'Pendiente'  and respuesta is null and respondido_en is null) or
    (estado = 'Respondido' and respuesta is not null and respondido_en is not null)
  )
);

create index if not exists idx_reclamos_estado_fecha on public.reclamos (estado, creado_en desc);

alter table public.reclamos enable row level security;
revoke all on public.reclamos from anon, authenticated;
