-- ViajaPeru · Libro de Reclamaciones: nombres, apellidos y nacionalidad por separado
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 14-nacionalidad.sql. Se puede repetir sin problema.
-- Ejecutarlo ANTES de desplegar el Backend (el Backend ya guarda estas columnas).
--
-- Con pasaporte, el formulario permite pegar las 2 líneas de la zona MRZ y autocompletar estos datos.
-- consumidor_nombre se mantiene (nombres + apellidos) para las hojas antiguas y el listado del administrador.

alter table public.reclamos add column if not exists consumidor_nombres   text;
alter table public.reclamos add column if not exists consumidor_apellidos text;
alter table public.reclamos add column if not exists nacionalidad         text;

alter table public.reclamos drop constraint if exists reclamos_consumidor_nombres_check;
alter table public.reclamos drop constraint if exists reclamos_consumidor_apellidos_check;
alter table public.reclamos drop constraint if exists reclamos_nacionalidad_check;

alter table public.reclamos add constraint reclamos_consumidor_nombres_check
  check (consumidor_nombres is null or char_length(consumidor_nombres) between 1 and 75);
alter table public.reclamos add constraint reclamos_consumidor_apellidos_check
  check (consumidor_apellidos is null or char_length(consumidor_apellidos) between 1 and 75);
alter table public.reclamos add constraint reclamos_nacionalidad_check
  check (nacionalidad is null or nacionalidad ~ '^[A-Z]{1,3}$');
