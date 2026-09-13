/*
 * FASE 17 — Campos de IA en media_items
 *
 * Columnas nuevas:
 *   ai_generated_caption   → caption optimizado por IA (usado en publication flow)
 *   ai_generated_title      → título sugerido por IA
 *   ai_generated_hashtags   → tags sugeridos por IA (array de texto)
 *
 * RLS: ya está habilitado sobre media_items (FASE 1). Las políticas existentes
 * verifican ownership vía sources.user_id, por lo que el acceso a estas
 * columnas está cubierto sin cambios adicionales.
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS. Re-ejecutable sin efecto.
 */
alter table public.media_items
  add column if not exists ai_generated_caption  text,
  add column if not exists ai_generated_title    text,
  add column if not exists ai_generated_hashtags text[];

create index if not exists idx_media_items_ai_caption
  on public.media_items (id)
  where ai_generated_caption is not null;
