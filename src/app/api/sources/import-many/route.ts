/**
 * API Route: POST /api/sources/import-many
 *
 * Importa en lote varios videos seleccionados de un perfil a la librería
 * del usuario (media_items).
 *
 * - URLs con `directUrl` (MP4 directo de TikTok / reels de Instagram):
 *   se importan de forma directa (la plataforma no ofrece API oficial).
 * - Resto: se procesan con `importFromSource`
 *   (detect → check → fetch → dedup a/b/c → persistir).
 *
 * Body: { items: [{ url: string, directUrl?: string|null }] }
 *       (compatible con el formato anterior { urls: string[] })
 * Response: {
 *   success: true,
 *   imported: ImportResult[],   // con al menos 1 item persistido
 *   skipped: ImportResult[],    // ya estaban importados
 *   failed:  { url, error }[]   // no se pudieron importar
 * }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  importFromSource,
  createSupabaseStore,
  type ImportResult,
} from '@/services/import-service';
import type { MediaItem, SourceProviderName } from '@/providers/interface';
import { resolveUserId } from '@/lib/supabase/api';
import {
  detectPlatform,
  extractInstagramId,
  extractTikTokId,
} from '@/lib/platform-detector';
import { normalizeSourceUrl } from '@/services/source-detector';
const BodyItemSchema = z.object({
  url: z.string().min(1, 'URL vacía'),
  directUrl: z.string().nullable().optional(),
});

const BodySchema = z.object({
  urls: z.array(z.string().min(1, 'URL vacía')).optional(),
  items: z
    .array(BodyItemSchema)
    .min(1, 'Selecciona al menos un video')
    .max(50, 'Máximo 50 videos por importación')
    .optional(),
});

/** Máximo de URLs procesadas en paralelo. */
const PARALLEL_BATCH = 8;

/** Hash determinista de identidad para imports directos (TikTok). */
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
/**
 * Importa un item con URL directa de archivo (TikTok / IG reels).
 * Reusa la misma store de persistencia y dedup de import-service.
 */
async function importDirect(
  userId: string,
  url: string,
  directUrl: string,
  metadata: { thumbnail?: string | null; title?: string | null }
): Promise<ImportResult> {
  const store = createSupabaseStore();
  const normalized = normalizeSourceUrl(url) ?? url;
  const provider: SourceProviderName =
    detectPlatform(url).platform === 'instagram' ? 'instagram' : 'youtube';
  const identifier =
    extractInstagramId(url) ?? extractTikTokId(url) ?? url.split('/').pop() ?? normalized;

  // Dedup (a) por id externo, (b) por source_url del archivo.
  const externalId = identifier;
  const fileUrl = normalizeSourceUrl(directUrl) ?? directUrl;

  const byExternal = await store.findMediaByExternalIds(userId, [externalId]);
  const byUrl = await store.findMediaByUrls(userId, [fileUrl, normalized]);

  const existingAsRow = [...(byExternal ?? []), ...(byUrl ?? [])];
  const firstExisting = existingAsRow[0];
  if (firstExisting) {
    return {
      success: true,
      provider,
      url: normalized,
      accessibility: 'ACCESSIBLE',
      message: 'Ya estaba importado.',
      sourceId: firstExisting.source_id,
      persisted: true,
      alreadyImported: true,
      imported: 0,
      duplicatesSkipped: 1,
      duplicates: [{ reason: 'source_url', value: fileUrl }],
      mediaItems: [{ id: firstExisting.id, url: directUrl, type: 'video' }],
    };
  }

  // Get-or-create source.
  let source = await store.findSourceByUserAndUrl(userId, normalized);
  if (!source) {
    source = await store.createSource({
      userId,
      originalUrl: url,
      normalizedUrl: normalized,
      provider,
      identifier,
      contentType: 'video',
      status: 'ACCESSIBLE',
    });
  }
  if (!source) {
    return {
      success: false,
      provider,
      url: normalized,
      accessibility: 'ERROR',
      message: 'No se pudo guardar la fuente en la biblioteca.',
      sourceId: null,
      persisted: false,
      alreadyImported: false,
      imported: 0,
      duplicatesSkipped: 0,
      duplicates: [],
      mediaItems: [],
    };
  }
  const item: MediaItem = {
    externalId,
    url: directUrl,
    title: metadata.title ?? null,
    thumbnailUrl: metadata.thumbnail ?? null,
    type: 'video',
    duration: null,
    width: null,
    height: null,
    publishedAt: null,
    metadata: { provider, sourceUrl: url, directUrl, title: metadata.title },
  };

  const contentHash = await sha256Hex(['direct', provider, externalId ?? '', fileUrl, 'video'].join('|'));
  const inserted = await store.insertMediaItems(source.id, [
    { externalId, sourceUrl: fileUrl, contentHash, item },
  ]);

  return {
    success: true,
    provider,
    url: normalized,
    accessibility: 'ACCESSIBLE',
    message: inserted.length > 0 ? '1 video importado.' : 'No se pudo guardar el video.',
    sourceId: source.id,
    persisted: Boolean(source),
    alreadyImported: false,
    imported: inserted.length,
    duplicatesSkipped: 0,
    duplicates: [],
    mediaItems: inserted,
  };
}
async function runBatch(
  userId: string,
  batch: Array<{ url: string; directUrl?: string | null }>
): Promise<Array<{ url: string; result?: ImportResult; error?: string }>> {
  const settled = await Promise.allSettled(
    batch.map((entry) =>
      entry.directUrl
        ? importDirect(userId, entry.url, entry.directUrl, { thumbnail: null, title: null })
        : importFromSource(entry.url, userId)
    )
  );
  return batch.map((entry, index) => {
    const outcome = settled[index];
    if (outcome.status === 'fulfilled') {
      return { url: entry.url, result: outcome.value };
    }
    const reason = outcome.reason;
    return { url: entry.url, error: reason instanceof Error ? reason.message : String(reason) };
  });
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  // Soporta { items: [...] } y el formato legacy { urls: [...] }.
  const entries: Array<{ url: string; directUrl?: string | null }> =
    parsed.data.items ?? (parsed.data.urls ?? []).map((u) => ({ url: u, directUrl: undefined }));

  // Dedupe de URLs dentro del mismo lote.
  const seen = new Set<string>();
  const uniqueEntries = entries
    .map((e) => ({ url: e.url.trim(), directUrl: e.directUrl ?? undefined }))
    .filter((e) => {
      if (!e.url || seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

  try {
    const results: Array<{ url: string; result?: ImportResult; error?: string }> = [];

    for (let i = 0; i < uniqueEntries.length; i += PARALLEL_BATCH) {
      const batch = uniqueEntries.slice(i, i + PARALLEL_BATCH);
      results.push(...(await runBatch(userId, batch)));
    }

    const imported: Array<{ result: ImportResult }> = [];
    const skipped: Array<{ result: ImportResult }> = [];
    const failed: Array<{ url: string; error: string }> = [];

    for (const entry of results) {
      if (entry.error || !entry.result) {
        failed.push({ url: entry.url, error: entry.error ?? 'Error desconocido' });
        continue;
      }
      const result = entry.result;
      if (result.imported > 0) {
        imported.push({ result });
      } else if (
        result.alreadyImported ||
        (result.duplicatesSkipped ?? 0) > 0 ||
        result.mediaItems.length > 0
      ) {
        skipped.push({ result });
      } else {
        failed.push({ url: entry.url, error: result.message });
      }
    }

    return NextResponse.json({ success: true, imported, skipped, failed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al importar los videos' },
      { status: 500 }
    );
  }
}
