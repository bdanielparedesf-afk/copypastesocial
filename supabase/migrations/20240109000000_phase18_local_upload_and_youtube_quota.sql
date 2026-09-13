/*
 * FASE 18 — Local Upload + YouTube Quota Handling
 *
 * 1. Agrega source_provider a media_items (default 'imported', 'local' para uploads locales)
 * 2. Agrega source_provider y next_attempt a publication_jobs
 * 3. Altera constraint de sources.provider para incluir 'local'
 */

-- 1. Agregar source_provider a media_items
alter table public.media_items
  add column if not exists source_provider text not null default 'imported';

-- 2. Agregar columnas a publication_jobs
alter table public.publication_jobs
  add column if not exists source_provider text null;

alter table public.publication_jobs
  add column if not exists next_attempt timestamptz null;

-- 3. Alterar constraint de sources.provider para incluir 'local'
alter table public.sources
  drop constraint if exists sources_provider_check;

alter table public.sources
  add constraint sources_provider_check
    check (provider in ('instagram','youtube','facebook','tiktok','local'));

-- 4. Índice para next_attempt (lo usa el cron para buscar jobs en RETRYING)
create index if not exists idx_publication_jobs_next_attempt
  on public.publication_jobs (next_attempt)
  where status = 'RETRYING';
