-- ViajaPeru · Nacionalidad del titular y de los acompañantes
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 13-telefono-acompanantes.sql. Se puede repetir sin problema.
-- Ejecutarlo ANTES de desplegar el Backend: el perfil del cliente ya pide la columna "nacionalidad".
--
-- Código de 3 letras como lo trae la MRZ del pasaporte (ICAO 9303): "PER", "USA", "D" (Alemania)…
--   DNI       -> 'PER'
--   PASAPORTE -> el de la MRZ
--   CE        -> NULL (el carné no la indica)

alter table public.perfiles     add column if not exists nacionalidad text;
alter table public.clientes     add column if not exists nacionalidad text;
alter table public.acompanantes add column if not exists nacionalidad text;

alter table public.perfiles     drop constraint if exists perfiles_nacionalidad_check;
alter table public.clientes     drop constraint if exists clientes_nacionalidad_check;
alter table public.acompanantes drop constraint if exists acompanantes_nacionalidad_check;

alter table public.perfiles     add constraint perfiles_nacionalidad_check     check (nacionalidad is null or nacionalidad ~ '^[A-Z]{1,3}$');
alter table public.clientes     add constraint clientes_nacionalidad_check     check (nacionalidad is null or nacionalidad ~ '^[A-Z]{1,3}$');
alter table public.acompanantes add constraint acompanantes_nacionalidad_check check (nacionalidad is null or nacionalidad ~ '^[A-Z]{1,3}$');

-- Datos existentes: quien tiene DNI es peruano
update public.perfiles     set nacionalidad = 'PER' where tipo_documento = 'DNI' and nacionalidad is null;
update public.clientes     set nacionalidad = 'PER' where tipo_documento = 'DNI' and nacionalidad is null;
update public.acompanantes set nacionalidad = 'PER' where tipo_documento = 'DNI' and nacionalidad is null;
