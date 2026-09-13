------------------------------------------------------------------
-- FASE 15 — Realtime para Publication Progress Modal
--
-- Activa Supabase Realtime en publication_jobs (y publications)
-- para que el modal de progreso reciba actualizaciones en tiempo real
-- sin depender de polling.
------------------------------------------------------------------

-- Habilitar replica identity FULL para un payload completo en los cambios
alter table public.publication_jobs replica identity full;
alter table public.publications   replica identity full;

-- Publicar las tablas en la publicación de realtime (por defecto ya
-- están incluidas si la replica identity está configurada, pero se
-- asegura explícitamente).
alter publication supabase_realtime add table public.publication_jobs;
alter publication supabase_realtime add table public.publications;