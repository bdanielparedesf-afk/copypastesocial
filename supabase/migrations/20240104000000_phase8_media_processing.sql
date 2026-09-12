------------------------------------------------------------------
-- FASE 8 — Procesamiento de media (raw -> processed)
--
-- Columnas nuevas en media_items para el pipeline de FFmpeg:
--   raw_url        → URL pública del original en bucket 'raw'
--   raw_path       → Ruta del original en bucket 'raw' (user_id/mediaItemId/original.ext)
--   processed_url  → URL pública del resultado en bucket 'processed'
--   processed_path → Ruta del resultado en bucket 'processed' (user_id/mediaItemId/processed.mp4)
--   status         → PENDING | PROCESSING | READY | FAILED
--   processed_at   → timestamp del procesamiento
--
-- El original NUNCA se borra: siempre queda preservado en bucket 'raw'
-- como original_asset. Idempotente (se puede re-ejecutar sin efecto).
------------------------------------------------------------------

alter table public.media_items
  add column if not exists raw_url        text,
  add column if not exists raw_path       text,
  add column if not exists processed_url  text,
  add column if not exists processed_path text,
  add column if not exists status         text not null default 'PENDING',
  add column if not exists processed_at   timestamptz;

-- CHECK del status (solo si el constraint no existe aún).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_items_status_check'
      and conrelid = 'public.media_items'::regclass
  ) then
    alter table public.media_items
      add constraint media_items_status_check
      check (status in ('PENDING','PROCESSING','READY','FAILED'));
  end if;
end $$;

create index if not exists idx_media_items_status
  on public.media_items (status);
