/*
 * FASE 21 — Subida directa navegador → Storage + esquema que faltaba
 * ==================================================================
 *
 * CONTEXTO (por qué existe esta migración)
 *  1) Vercel rechaza con 413 (FUNCTION_PAYLOAD_TOO_LARGE) cualquier body de
 *     más de 4.5MB enviado a una Function. El video ya NO viaja por la API
 *     route: se sube DIRECTO al bucket 'raw' con URLs firmadas y la función
 *     solo recibe JSON (ver /api/media/upload-url y /api/media/finalize-upload).
 *  2) Ese flujo escribe columnas que el esquema real de la base NO tenía:
 *       - sources.provider               → falta el valor 'local'
 *       - media_items.raw_path           → falta (el pipeline FFmpeg lo usa)
 *       - media_items.processed_path     → falta
 *       - media_items.source_provider    → falta
 *       - publications.social_account_id → era NOT NULL (un upload local aún
 *                                          no tiene cuenta destino elegida)
 *       - publication_jobs.*             → faltan media_id/social_account_id/
 *                                          provider/source_provider/
 *                                          max_attempts/next_attempt/
 *                                          external_id/error_message y el
 *                                          CHECK de status no permitía los
 *                                          valores que usa el código
 *                                          (retrying/success/uploading/...)
 *
 * Idempotente: puede re-ejecutarse sin efecto (IF NOT EXISTS / DROP CONSTRAINT
 * IF EXISTS). Orden recomendado: aplicar primero las migraciones de las fases
 * 8, 9, 10, 11, 15, 17 y 18 y después esta.
 */

------------------------------------------------------------------
-- 1) sources.provider acepta 'local' (uploads desde la PC)
------------------------------------------------------------------
alter table public.sources
  drop constraint if exists sources_provider_check;

alter table public.sources
  add constraint sources_provider_check
    check (provider in ('instagram','youtube','facebook','tiktok','local'));

------------------------------------------------------------------
-- 2) media_items: rutas del pipeline raw -> processed + origen
------------------------------------------------------------------
alter table public.media_items
  add column if not exists raw_url        text,
  add column if not exists raw_path       text,
  add column if not exists processed_url  text,
  add column if not exists processed_path text,
  add column if not exists processed_at   timestamptz,
  add column if not exists status         text not null default 'PENDING',
  add column if not exists source_provider text not null default 'imported';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'media_items_status_check'
      and conrelid = 'public.media_items'::regclass
  ) then
    alter table public.media_items
      add constraint media_items_status_check
      check (status in ('PENDING','PROCESSING','READY','FAILED'));
  end if;
end $$;

create index if not exists idx_media_items_status on public.media_items (status);

------------------------------------------------------------------
-- 3) publications: social_account_id opcional (upload local)
------------------------------------------------------------------
alter table public.publications
  alter column social_account_id drop not null;

------------------------------------------------------------------
-- 4) publication_jobs: columnas por destino del upload local
------------------------------------------------------------------
alter table public.publication_jobs
  add column if not exists media_id          uuid references public.media_items on delete cascade,
  add column if not exists social_account_id uuid references public.social_accounts on delete set null,
  add column if not exists provider          text,
  add column if not exists source_provider   text,
  add column if not exists max_attempts      integer not null default 3,
  add column if not exists next_attempt      timestamptz,
  add column if not exists external_id       text,
  add column if not exists error_message     text;

-- status: el código escribe pending/processing/uploading/publishing/retrying/
-- success/completed/running/failed → el CHECK base solo permitía 4 valores.
alter table public.publication_jobs
  drop constraint if exists publication_jobs_status_check;

alter table public.publication_jobs
  add constraint publication_jobs_status_check
    check (status in (
      'pending','processing','uploading','publishing',
      'retrying','success','completed','running','failed'
    ));

create index if not exists idx_publication_jobs_media_id
  on public.publication_jobs (media_id);
create index if not exists idx_publication_jobs_status
  on public.publication_jobs (status);
create index if not exists idx_publication_jobs_next_attempt
  on public.publication_jobs (next_attempt)
  where status = 'retrying';

------------------------------------------------------------------
-- 5) Verificación rápida (no falla si todo está bien)
------------------------------------------------------------------
do $$
declare
  missing text[] := '{}';
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_items'
      and column_name = 'raw_path'
  ) then
    missing := missing || 'media_items.raw_path';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publication_jobs'
      and column_name = 'media_id'
  ) then
    missing := missing || 'publication_jobs.media_id';
  end if;

  if array_length(missing, 1) is not null then
    raise exception 'FASE 21: faltan columnas: %', array_to_string(missing, ', ');
  end if;

  raise notice 'FASE 21: esquema de subida directa listo ✔';
end $$;
