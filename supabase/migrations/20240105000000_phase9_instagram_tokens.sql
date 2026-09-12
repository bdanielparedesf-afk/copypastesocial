------------------------------------------------------------------
-- FASE 9 — Instagram Graph API + OAuth real
--
-- Tabla provider_tokens: almacén central de tokens por provider para el
-- flujo real de la Graph API de Meta.
--
--   - access_token  → token long-lived (~60 días), SIEMPRE encriptado
--   - refresh_token → token re-intercambiable (fb_exchange_token),
--                     SIEMPRE encriptado
--   - expires_at    → expiración del token actual
--   - is_valid      → false al revocar/fallar validación
--   - last_refreshed_at → último refresh del job cron
--
-- RLS: user_id = auth.uid(). Idempotente: se puede re-ejecutar sin efecto.
------------------------------------------------------------------

create table public.provider_tokens (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users on delete cascade,
  provider          text          not null default 'instagram'
                    check (provider in ('instagram')),
  social_account_id uuid          references public.social_accounts on delete set null,
  access_token      text          not null,   -- encriptado AES-256-GCM
  refresh_token     text,                     -- encriptado AES-256-GCM (nullable)
  token_type        text          not null default 'long-lived',
  ig_user_id        text,
  username          text,
  scopes            jsonb         not null default '[]'::jsonb,
  expires_at        timestamptz   not null,
  is_valid          boolean       not null default true,
  needs_refresh     boolean       not null default false,
  last_refreshed_at timestamptz,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_provider_tokens_user_provider
  on public.provider_tokens (user_id, provider);

-- Unicidad para el upsert de saveInstagramToken (onConflict).
create unique index if not exists uq_provider_tokens_user_provider_username
  on public.provider_tokens (user_id, provider, username);

create index if not exists idx_provider_tokens_expiry
  on public.provider_tokens (expires_at);

alter table public.provider_tokens enable row level security;

create policy "Allow full access on provider_tokens for own user"
  on public.provider_tokens for all using (auth.uid() = user_id);

-- Trigger updated_at (misma función que el resto de tablas)
create trigger trg_provider_tokens_updated_at
  before update on public.provider_tokens
  for each row execute function public.set_updated_at();