/*
 * FASE 6 — Importación de fuentes + detección de duplicados.
 *
 * Columnas para la dedup OBLIGATORIA:
 *   a) media_items.external_id   → ID del contenido en la plataforma origen.
 *   b) media_items.source_url    → URL normalizada del item (sin UTM/hash).
 *   c) media_items.content_hash  → SHA-256 de identidad (provider|external_id|url|type).
 *
 * Además:
 *   - media_items.published_at   → fecha de publicación en la plataforma.
 *   - sources.normalized_url     → URL normalizada de la fuente (dedup a nivel
 *     de fuente por usuario). existing sources quedan con NULL y se puede
 *     backfillar manualmente si se desea.
 *
 * Se crean índices (no únicos: la unicidad la controla el import-service por
 * usuario, vía queries con RLS/service role) para las 3 claves de dedup.
 */

alter table public.media_items
  add column if not exists external_id  text,
  add column if not exists source_url   text,
  add column if not exists content_hash text,
  add column if not exists published_at timestamptz;

alter table public.sources
  add column if not exists normalized_url text;

create index if not exists idx_media_items_external_id
  on public.media_items (external_id);
create index if not exists idx_media_items_source_url
  on public.media_items (source_url);
create index if not exists idx_media_items_content_hash
  on public.media_items (content_hash);

create index if not exists idx_sources_user_normalized_url
  on public.sources (user_id, normalized_url);
