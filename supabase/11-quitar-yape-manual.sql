-- ViajaPeru · Quitar el pago con Yape MANUAL (reemplazado por Yape automático con Culqi)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 10-yape-manual.sql. Se puede repetir sin problema.
--
-- Desde el commit "HU-006: Yape automático con Culqi" el cliente paga con Yape desde el formulario
-- de Culqi y el pago se confirma al instante (metodo 'QR', medio 'Yape' en pago_detalles).
-- La verificación manual (N° de operación revisado por el personal) ya no se usa.
-- Borra la tabla solicitudes_yape (solo tenía solicitudes de prueba) y sus funciones.

drop function if exists public.confirmar_pago_yape(bigint, uuid);
drop function if exists public.rechazar_pago_yape(bigint, uuid, text);
drop function if exists public.listar_solicitudes_yape(text, integer);

drop table if exists public.solicitudes_yape;

delete from public.configuracion where clave in ('yape_numero', 'yape_titular', 'yape_qr_url');
