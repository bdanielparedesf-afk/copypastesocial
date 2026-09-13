------------------------------------------------------------------
-- FASE 11 — Multi-cuenta + límites (api_usage)
--
-- Tabla api_usage: registra cada llamada a la Graph API por cuenta para
-- aplicar el rate limit de 200 llamadas/hora (hoja de cálculo simple en DB).
-- El límite diario de publicaciones (25/día) se calcula contando
-- publish_queue.status = 'PUBLISHED' con created_at de hoy.
--
-- RLS: user_id = auth.uid(). Idempotente: re-ejecutable sin efecto.
------------------------------------------------------------------

create table public.api_usage (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users on delete cascade,
  account_id  uuid          not null references public.social_accounts on delete cascade,
  provider    text          not null default 'instagram',
  endpoint    text          not null,
  created_at  timestamptz   not null default now()
);

create index if not exists idx_api_usage_account_time
  on public.api_usage (account_id, created_at);

alter table public.api_usage enable row level security;

create policy "Allow full access on api_usage for own user"
  on public.api_usage for all using (auth.uid() = user_id);

-- Limpieza periódica (opcional): mantener solo las últimas 24h.
create index if not exists idx_api_usage_created_at
  on public.api_usage (created_at);