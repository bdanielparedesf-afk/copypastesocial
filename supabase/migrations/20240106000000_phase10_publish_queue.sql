------------------------------------------------------------------
-- FASE 10 — Cola de publicación de Instagram (publish_queue)
--
-- Cola de posts a publicar con la Graph API de IG. Estados:
--   PENDING   → listo para publicar (sin schedule)
--   SCHEDULED → programado: solo se publica cuando scheduled_at <= now()
--   PUBLISHING → en proceso (container creado / polling / publish)
--   PUBLISHED  → publicado con éxito (ig_media_id = id real de Meta)
--   FAILED     → falló tras los reintentos (error guardado)
--
-- RLS: user_id = auth.uid(). Idempotente: se puede re-ejecutar sin efecto.
------------------------------------------------------------------

create table public.publish_queue (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          not null references auth.users on delete cascade,
  social_account_id  uuid          not null references public.social_accounts on delete cascade,
  media_id           uuid          not null references public.media_items on delete cascade,
  caption            text          not null default '',
  video_url          text,                     -- signed URL del bucket processed (al momento de publicar)
  status             text          not null default 'PENDING'
                     check (status in ('PENDING','SCHEDULED','PUBLISHING','PUBLISHED','FAILED')),
  scheduled_at       timestamptz,
  attempts           integer       not null default 0,
  ig_media_id        text,                     -- id real devuelto por /media_publish (o mock_*)
  error              text,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

create index if not exists idx_publish_queue_user_status
  on public.publish_queue (user_id, status);

create index if not exists idx_publish_queue_due
  on public.publish_queue (status, scheduled_at);

alter table public.publish_queue enable row level security;

create policy "Allow full access on publish_queue for own user"
  on public.publish_queue for all using (auth.uid() = user_id);

-- Trigger updated_at (misma función que el resto de tablas)
create trigger trg_publish_queue_updated_at
  before update on public.publish_queue
  for each row execute function public.set_updated_at();