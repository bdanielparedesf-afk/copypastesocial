/*
 * FASE: Arquitectura Base
 *
 * Esquema de datos central: fuentes, ítems multimedia, cuentas sociales,
 * publicaciones y jobs de publicación.
 *
 * También se crean (audits / jobs) las tablas referenciadas por
 * src/lib/supabase/types.ts que pertenecen a la FASE 1.
 *
 * Seguridad:
 *  - Row Level Security (RLS) activado en TODAS las tablas.
 *  - Cada tabla propiedad verifica `user_id = auth.uid()`.
 *  - media_items y publication_jobs se validan a través del recurso padre.
 *  - Los access_token / refresh_token se guardan SIEMPRE encriptados
 *    en AES-256-GCM (ver src/services/TokenService.ts + src/services/crypto.ts).
 */

-- UUIDs: gen_random_uuid() está disponible por defecto en Supabase (PG 15+)
create extension if not exists "uuid-ossp";

------------------------------------------------------------------
-- audits  (FASE 1)
------------------------------------------------------------------
create table public.audits (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null,
  source_url   text          not null,
  provider     text          not null,
  status       text          not null,
  title        text,
  message      text,
  metadata     jsonb         not null default '{}'::jsonb,
  created_at   timestamptz   not null default now()
);

------------------------------------------------------------------
-- jobs  (FASE 1)
------------------------------------------------------------------
create table public.jobs (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null,
  audit_id     uuid,
  status       text          not null,
  progress     integer       not null default 0,
  result       jsonb,
  error        text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

------------------------------------------------------------------
-- sources
------------------------------------------------------------------
create table public.sources (
  id            uuid          primary key default gen_random_uuid(),
  user_id       uuid          not null references auth.users on delete cascade,
  original_url  text          not null,
  provider      text          not null check (provider in ('instagram','youtube','facebook','tiktok')),
  identifier    text          not null,
  content_type  text          not null,
  status        text          not null,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

------------------------------------------------------------------
-- media_items
------------------------------------------------------------------
create table public.media_items (
  id            uuid          primary key default gen_random_uuid(),
  source_id     uuid          not null references public.sources on delete cascade,
  url           text          not null,
  thumbnail_url text,
  type          text          not null check (type in ('video','image','carousel')),
  duration      double precision,
  width         integer,
  height        integer,
  metadata      jsonb         not null default '{}'::jsonb,
  created_at    timestamptz   not null default now()
);

------------------------------------------------------------------
-- social_accounts  (¡tokens encriptados!)
------------------------------------------------------------------
create table public.social_accounts (
  id            uuid          primary key default gen_random_uuid(),
  user_id       uuid          not null references auth.users on delete cascade,
  provider      text          not null check (provider in ('instagram','youtube','facebook','tiktok')),
  username      text          not null,
  access_token  text          not null,                -- encriptado AES-256-GCM
  refresh_token text,                                  -- encriptado AES-256-GCM
  expires_at    timestamptz,
  scopes        jsonb         not null default '[]'::jsonb,
  is_valid      boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

------------------------------------------------------------------
-- publications
------------------------------------------------------------------
create table public.publications (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references auth.users on delete cascade,
  source_id        uuid          not null references public.sources on delete cascade,
  social_account_id uuid         not null references public.social_accounts on delete cascade,
  caption          text          not null default '',
  status           text          not null check (status in ('pending','processing','published','failed')),
  scheduled_at     timestamptz,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

------------------------------------------------------------------
-- publication_jobs
------------------------------------------------------------------
create table public.publication_jobs (
  id              uuid          primary key default gen_random_uuid(),
  publication_id  uuid          not null references public.publications on delete cascade,
  type            text          not null check (type in ('download','transcode','publish')),
  status          text          not null check (status in ('pending','running','completed','failed')),
  attempts        integer       not null default 0,
  error           text,
  payload         jsonb         not null default '{}'::jsonb,
  created_at      timestamptz   not null default now()
);

------------------------------------------------------------------
-- Índices
------------------------------------------------------------------
create index if not exists idx_sources_user_id         on public.sources (user_id);
create index if not exists idx_media_items_source_id    on public.media_items (source_id);
create index if not exists idx_social_accounts_user_id  on public.social_accounts (user_id);
create index if not exists idx_publications_user_id     on public.publications (user_id);
create index if not exists idx_publication_jobs_pub_id  on public.publication_jobs (publication_id);

------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------
alter table public.audits            enable row level security;
alter table public.jobs              enable row level security;
alter table public.sources           enable row level security;
alter table public.media_items        enable row level security;
alter table public.social_accounts    enable row level security;
alter table public.publications       enable row level security;
alter table public.publication_jobs   enable row level security;

------------------------------------------------------------------
-- Políticas: userId = auth.uid()
------------------------------------------------------------------
create policy "Allow full access on audits for own user"
  on public.audits for all using (auth.uid() = user_id);

create policy "Allow full access on jobs for own user"
  on public.jobs for all using (auth.uid() = user_id);

create policy "Allow full access on sources for own user"
  on public.sources for all using (auth.uid() = user_id);

create policy "Allow access on media_items for owned sources"
  on public.media_items for all
  using (exists (
    select 1 from public.sources s
    where s.id = media_items.source_id and s.user_id = auth.uid()
  ));

create policy "Allow full access on social_accounts for own user"
  on public.social_accounts for all using (auth.uid() = user_id);

create policy "Allow full access on publications for own user"
  on public.publications for all using (auth.uid() = user_id);

create policy "Allow access on publication_jobs for owned publications"
  on public.publication_jobs for all
  using (exists (
    select 1 from public.publications p
    where p.id = publication_jobs.publication_id and p.user_id = auth.uid()
  ));

------------------------------------------------------------------
-- Trigger: updated_at automático en tablas con updated_at
------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language 'plpgsql';

create trigger trg_sources_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger trg_social_accounts_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

create trigger trg_publications_updated_at
  before update on public.publications
  for each row execute function public.set_updated_at();

