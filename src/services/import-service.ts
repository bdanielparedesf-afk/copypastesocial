/**
 * FASE 6 — Servicio de importación desde fuentes sociales.
 *
 * Flujo: detectSource → provider → checkAccessibility → (ACCESSIBLE) →
 * fetchMetadata → dedup OBLIGATORIA → persistir en Supabase.
 *
 * Detección de duplicados (regla obligatoria):
 *   a) por external_id
 *   b) por source_url normalizada
 *   c) por content_hash (si ya existe)
 * Si es duplicado → NO se re-importa; se retorna el existente.
 *
 * REGLA DE SEGURIDAD #46: solo APIs oficiales vía los SourceProviders.
 */
import { detectSource, normalizeSourceUrl } from './source-detector';
import { getSourceProvider } from '@/providers/source-registry';
import type { MediaItem, SourceAccessibility, SourceCheckResult, SourceProviderName } from '@/providers/interface';
import { HUMAN_ACCESSIBILITY_MESSAGES, authRequiredMessage, mediaCountMessage } from '@/providers/interface';
import { toJsonObject } from '@/utils';

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface SourceRow {
  id: string;
  user_id: string;
  original_url: string;
  normalized_url: string | null;
  provider: string;
  identifier: string;
  content_type: string;
  status: string;
}

export interface MediaRow {
  id: string;
  external_id: string | null;
  source_url: string | null;
  content_hash: string | null;
  source_id: string;
}

export type DuplicateReason = 'external_id' | 'source_url' | 'content_hash';

export interface DuplicateHit {
  reason: DuplicateReason;
  value: string;
}

export interface ImportedMediaItem {
  id: string | null;
  url: string;
  type: string;
}

export interface ImportResult {
  success: boolean;
  provider: SourceProviderName | 'unsupported';
  url: string;
  accessibility: SourceAccessibility;
  message: string;
  sourceId: string | null;
  persisted: boolean;
  alreadyImported: boolean;
  imported: number;
  duplicatesSkipped: number;
  duplicates: DuplicateHit[];
  mediaItems: ImportedMediaItem[];
}

/** Abstracción de persistencia (inyectable para tests con store en memoria). */
export interface SourceStore {
  findSourceByUserAndUrl(userId: string, normalizedUrl: string): Promise<SourceRow | null>;
  createSource(input: {
    userId: string;
    originalUrl: string;
    normalizedUrl: string;
    provider: SourceProviderName;
    identifier: string;
    contentType: string;
    status: SourceAccessibility;
  }): Promise<SourceRow | null>;
  findMediaByExternalIds(userId: string, externalIds: string[]): Promise<MediaRow[]>;
  findMediaByUrls(userId: string, urls: string[]): Promise<MediaRow[]>;
  findMediaByHashes(userId: string, hashes: string[]): Promise<MediaRow[]>;
  insertMediaItems(
    sourceId: string,
    rows: Array<{
      externalId: string | null;
      sourceUrl: string;
      contentHash: string;
      item: MediaItem;
    }>
  ): Promise<ImportedMediaItem[]>;
}

/* ------------------------------------------------------------------ */
/* Hash de contenido (c)                                               */
/* ------------------------------------------------------------------ */

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash determinista de identidad del item: provider | externalId | url | type. */
export async function contentHashFor(provider: SourceProviderName, item: MediaItem): Promise<string> {
  const identity = [provider, item.externalId ?? '', normalizeSourceUrl(item.url), item.type].join('|');
  return sha256Hex(identity);
}

/* ------------------------------------------------------------------ */
/* Mensajes humanos                                                    */
/* ------------------------------------------------------------------ */

export function humanAccessibilityMessage(provider: SourceProviderName, accessibility: SourceAccessibility): string {
  if (accessibility === 'AUTH_REQUIRED') return authRequiredMessage(provider);
  return HUMAN_ACCESSIBILITY_MESSAGES[accessibility];
}

function apiRestrictedMessage(provider: SourceProviderName): string {
  if (provider === 'youtube' && !process.env.GOOGLE_API_KEY) {
    return 'La API de YouTube no está configurada (falta GOOGLE_API_KEY en el .env).';
  }
  if (
    (provider === 'instagram' || provider === 'facebook') &&
    !process.env.META_APP_ID &&
    !process.env.INSTAGRAM_ACCESS_TOKEN
  ) {
    return 'Las credenciales de la API de Meta no están configuradas (META_APP_ID / META_APP_SECRET).';
  }
  return HUMAN_ACCESSIBILITY_MESSAGES.API_RESTRICTED;
}

/* ------------------------------------------------------------------ */
/* Store con Supabase (persistencia real, resiliente)                  */
/* ------------------------------------------------------------------ */

async function getSupabase() {
  try {
    const mod = await import('@/lib/supabase/client');
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        return mod.createServerClient();
      } catch {
        // Sin service role → continuar con el cliente anon (RLS aplica).
      }
    }
    return mod.supabase;
  } catch {
    // Sin env de Supabase (tests / dev sin configurar) → no persistir.
    return null;
  }
}

export function createSupabaseStore(): SourceStore {
  async function findMedia(
    userId: string,
    column: 'external_id' | 'source_url' | 'content_hash',
    values: string[]
  ): Promise<MediaRow[]> {
    if (values.length === 0) return [];
    const db = await getSupabase();
    if (!db) return [];
    try {
      const { data, error } = await db
        .from('media_items')
        .select('id, external_id, source_url, content_hash, source_id, sources!inner(user_id)')
        .eq('sources.user_id', userId)
        .in(column, values)
        .limit(1000);
      if (error || !data) return [];
      return data.map((row) => ({
        id: row.id,
        external_id: row.external_id,
        source_url: row.source_url,
        content_hash: row.content_hash,
        source_id: row.source_id,
      }));
    } catch {
      return [];
    }
  }

  return {
    async findSourceByUserAndUrl(userId, normalizedUrl) {
      const db = await getSupabase();
      if (!db) return null;
      try {
        const { data } = await db
          .from('sources')
          .select('id, user_id, original_url, normalized_url, provider, identifier, content_type, status')
          .eq('user_id', userId)
          .eq('normalized_url', normalizedUrl)
          .limit(1);
        return (data?.[0] as SourceRow | undefined) ?? null;
      } catch {
        return null;
      }
    },

    async createSource(input) {
      const db = await getSupabase();
      if (!db) return null;
      try {
        const { data, error } = await db
          .from('sources')
          .insert({
            user_id: input.userId,
            original_url: input.originalUrl,
            normalized_url: input.normalizedUrl,
            provider: input.provider,
            identifier: input.identifier,
            content_type: input.contentType,
            status: input.status,
          })
          .select('id, user_id, original_url, normalized_url, provider, identifier, content_type, status')
          .single();
        if (error || !data) return null;
        return data as SourceRow;
      } catch {
        return null;
      }
    },

    findMediaByExternalIds: (userId, externalIds) => findMedia(userId, 'external_id', externalIds),
    findMediaByUrls: (userId, urls) => findMedia(userId, 'source_url', urls),
    findMediaByHashes: (userId, hashes) => findMedia(userId, 'content_hash', hashes),

    async insertMediaItems(sourceId, rows) {
      const db = await getSupabase();
      if (!db) return [];
      try {
        const { data, error } = await db
          .from('media_items')
          .insert(
            rows.map((row) => ({
              source_id: sourceId,
              url: row.item.url,
              source_url: row.sourceUrl,
              external_id: row.externalId,
              content_hash: row.contentHash,
              thumbnail_url: row.item.thumbnailUrl,
              type: row.item.type,
              duration: row.item.duration,
              width: row.item.width,
              height: row.item.height,
              published_at: row.item.publishedAt,
              metadata: toJsonObject({ ...row.item.metadata, title: row.item.title }),
            }))
          )
          .select('id, url, type');
        if (error || !data) return [];
        return data.map((row) => ({ id: row.id, url: row.url, type: row.type }));
      } catch {
        return [];
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* checkSource: usado por /api/sources/check y el Dashboard            */
/* ------------------------------------------------------------------ */

export const UNSUPPORTED_MESSAGE = 'Plataforma no soportada por ahora. Prueba con Instagram, YouTube o Facebook.';

export async function checkSource(url: string): Promise<SourceCheckResult> {
  const detection = detectSource(url);

  if (detection.provider === 'unsupported') {
    return {
      provider: 'unsupported',
      url: detection.url,
      contentType: detection.contentType,
      identifier: '',
      accessibility: 'UNSUPPORTED',
      message: UNSUPPORTED_MESSAGE,
      mediaCount: 0,
    };
  }

  const provider = getSourceProvider(detection.provider);
  if (!provider) {
    return {
      provider: detection.provider,
      url: detection.url,
      contentType: detection.contentType,
      identifier: detection.identifier,
      accessibility: 'UNSUPPORTED',
      message: UNSUPPORTED_MESSAGE,
      mediaCount: 0,
    };
  }

  let accessibility = await provider.checkAccessibility(detection.url);

  let mediaCount = 0;
  if (accessibility === 'ACCESSIBLE') {
    try {
      mediaCount = (await provider.fetchMetadata(detection.url)).length;
    } catch {
      mediaCount = 0;
    }
  }

  let message: string;
  switch (accessibility) {
    case 'ACCESSIBLE':
      message = mediaCountMessage(provider.name, mediaCount);
      break;
    case 'AUTH_REQUIRED':
      message = authRequiredMessage(provider.name);
      break;
    case 'API_RESTRICTED':
      message = apiRestrictedMessage(provider.name);
      break;
    default:
      message = HUMAN_ACCESSIBILITY_MESSAGES[accessibility];
      break;
  }

  // El conteo falla (p.ej. fetchMetadata sin token en Instagram) → degradar honesto.
  if (accessibility === 'ACCESSIBLE' && mediaCount === 0) {
    accessibility = 'API_RESTRICTED';
    message = apiRestrictedMessage(provider.name);
  }

  return {
    provider: provider.name,
    url: detection.url,
    contentType: detection.contentType,
    identifier: detection.identifier,
    accessibility,
    message,
    mediaCount,
  };
}

/* ------------------------------------------------------------------ */
/* importFromSource: detect → check → fetch → dedup → persistir        */
/* ------------------------------------------------------------------ */

export async function importFromSource(
  url: string,
  userId: string,
  store: SourceStore = createSupabaseStore()
): Promise<ImportResult> {
  const detection = detectSource(url);
  const emptyResult: ImportResult = {
    success: false,
    provider: detection.provider,
    url: detection.url,
    accessibility: 'ACCESSIBLE',
    message: '',
    sourceId: null,
    persisted: false,
    alreadyImported: false,
    imported: 0,
    duplicatesSkipped: 0,
    duplicates: [],
    mediaItems: [],
  };

  if (detection.provider === 'unsupported') {
    return { ...emptyResult, accessibility: 'UNSUPPORTED', message: UNSUPPORTED_MESSAGE };
  }

  const provider = getSourceProvider(detection.provider);
  if (!provider) {
    return { ...emptyResult, accessibility: 'UNSUPPORTED', message: UNSUPPORTED_MESSAGE };
  }

  const accessibility = await provider.checkAccessibility(detection.url);
  if (accessibility !== 'ACCESSIBLE') {
    const message =
      accessibility === 'AUTH_REQUIRED'
        ? authRequiredMessage(provider.name)
        : accessibility === 'API_RESTRICTED'
          ? apiRestrictedMessage(provider.name)
          : HUMAN_ACCESSIBILITY_MESSAGES[accessibility];
    return { ...emptyResult, accessibility, message };
  }

  const items = await provider.fetchMetadata(detection.url);

  /* ---------------- Dedup OBLIGATORIA a/b/c ---------------- */
  const [byExternal, byUrl, byHash] = await Promise.all([
    store.findMediaByExternalIds(
      userId,
      items.map((i) => i.externalId).filter((v): v is string => Boolean(v))
    ),
    store.findMediaByUrls(userId, items.map((i) => normalizeSourceUrl(i.url))),
    store.findMediaByHashes(
      userId,
      await Promise.all(items.map((item) => contentHashFor(provider.name, item)))
    ),
  ]);

  const externalSet = new Set(byExternal.map((r) => r.external_id));
  const urlSet = new Set(byUrl.map((r) => r.source_url));
  const hashSet = new Set(byHash.map((r) => r.content_hash));

  const duplicates: DuplicateHit[] = [];
  const seenExternal = new Set<string>();
  const seenUrl = new Set<string>();
  const seenHash = new Set<string>();

  const freshRows: Array<{ externalId: string | null; sourceUrl: string; contentHash: string; item: MediaItem }> = [];

  for (const item of items) {
    const itemUrl = normalizeSourceUrl(item.url);
    const hash = await contentHashFor(provider.name, item);

    // a) por external_id
    if (item.externalId && (externalSet.has(item.externalId) || seenExternal.has(item.externalId))) {
      duplicates.push({ reason: 'external_id', value: item.externalId });
      continue;
    }
    // b) por source_url normalizada
    if (urlSet.has(itemUrl) || seenUrl.has(itemUrl)) {
      duplicates.push({ reason: 'source_url', value: itemUrl });
      continue;
    }
    // c) por content_hash
    if (hashSet.has(hash) || seenHash.has(hash)) {
      duplicates.push({ reason: 'content_hash', value: hash });
      continue;
    }

    if (item.externalId) seenExternal.add(item.externalId);
    seenUrl.add(itemUrl);
    seenHash.add(hash);
    freshRows.push({ externalId: item.externalId, sourceUrl: itemUrl, contentHash: hash, item });
  }

  /* ---------------- Get-or-create de la source ---------------- */
  const existingSource = await store.findSourceByUserAndUrl(userId, detection.url);
  let source: SourceRow | null = existingSource;
  const alreadyImported = Boolean(existingSource);

  if (!source) {
    source = await store.createSource({
      userId,
      originalUrl: detection.originalUrl,
      normalizedUrl: detection.url,
      provider: provider.name,
      identifier: detection.identifier,
      contentType: detection.contentType,
      status: 'ACCESSIBLE',
    });
  }

  const inserted =
    freshRows.length > 0 && source ? await store.insertMediaItems(source.id, freshRows) : [];

  const imported = inserted.length;
  const everythingDuplicated = items.length > 0 && imported === 0 && freshRows.length === 0;

  let message: string;
  if (items.length === 0) {
    message = 'No se encontró contenido importable.';
  } else if (everythingDuplicated) {
    message = 'Todo el contenido ya estaba importado. No se duplicó nada.';
  } else if (imported === 0) {
    message = 'No se pudo guardar el contenido (persistencia no disponible).';
  } else {
    message = alreadyImported
      ? `${mediaCountMessage(provider.name, imported)} El resto ya estaba importado.`
      : mediaCountMessage(provider.name, imported);
  }

  return {
    success: true,
    provider: provider.name,
    url: detection.url,
    accessibility: 'ACCESSIBLE',
    message,
    sourceId: source?.id ?? null,
    persisted: Boolean(source),
    alreadyImported,
    imported,
    duplicatesSkipped: duplicates.length,
    duplicates,
    mediaItems: inserted,
  };
}


