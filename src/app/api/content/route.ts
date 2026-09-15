/**
 * FASE 7 — GET /api/content
 * Lista los media_items del usuario (libreria de contenido) con los datos
 * de dedup de la Fase 6 (external_id, source_url, content_hash, published_at).
 *
 * FASE 20: Auth 401 si no hay usuario.
 */
import { NextResponse } from 'next/server';
import { getDbClient, resolveUserId } from '@/lib/supabase/api';
import type { ProviderId } from '@/types';

export const dynamic = 'force-dynamic';

interface RawMediaItem {
  id: string;
  source_id: string;
  url: string;
  source_url: string | null;
  external_id: string | null;
  content_hash: string | null;
  thumbnail_url: string | null;
  type: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  ai_generated_caption?: string | null;
  ai_generated_title?: string | null;
  ai_generated_hashtags?: string[] | null;
  created_at: string;
  sources: {
    id: string;
    original_url: string;
    provider: string;
    identifier: string;
    content_type: string;
    status: string;
    created_at: string;
  } | null;
}

export async function GET() {
  try {
    const db = getDbClient();
    const userId = await resolveUserId();
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const baseColumns = [
      'id',
      'source_id',
      'url',
      'source_url',
      'external_id',
      'content_hash',
      'thumbnail_url',
      'type',
      'duration',
      'width',
      'height',
      'published_at',
      'metadata',
      'created_at',
    ].join(', ');
    const aiColumns = 'ai_generated_caption, ai_generated_title, ai_generated_hashtags';
    const embed =
      'sources!inner ( id, original_url, provider, identifier, content_type, status, created_at )';

    // La BD remota puede no tener las columnas ai_generated_* (FASE 17 sin
    // migrar): primer intento completo; si la BD no conoce las columnas,
    // reintenta sin ellas para que la libreria siga funcionando.
    let queryResult = await db
      .from('media_items')
      .select(`${baseColumns}, ${aiColumns}, ${embed}`)
      .eq('sources.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (queryResult.error && /ai_generated/i.test(queryResult.error.message ?? '')) {
      const fallback = await db
        .from('media_items')
        .select(`${baseColumns}, ${embed}`)
        .eq('sources.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);
      queryResult = fallback as typeof queryResult;
    }

    const { data, error } = queryResult;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rawItems = (data ?? []) as unknown as RawMediaItem[];

    const items = rawItems.map((item) => ({
      id: item.id,
      sourceId: item.source_id,
      url: item.url,
      sourceUrl: item.source_url,
      externalId: item.external_id,
      contentHash: item.content_hash,
      thumbnailUrl: item.thumbnail_url,
      type: item.type as 'video' | 'image' | 'carousel',
      duration: item.duration,
      width: item.width,
      height: item.height,
      publishedAt: item.published_at,
      metadata: item.metadata ?? {},
      aiGeneratedCaption: item.ai_generated_caption ?? null,
      aiGeneratedTitle: item.ai_generated_title ?? null,
      aiGeneratedHashtags: item.ai_generated_hashtags ?? null,
      createdAt: item.created_at,
      source: item.sources
        ? {
            id: item.sources.id,
            originalUrl: item.sources.original_url,
            provider: item.sources.provider as ProviderId,
            identifier: item.sources.identifier,
            contentType: item.sources.content_type,
            status: item.sources.status,
            createdAt: item.sources.created_at,
          }
        : null,
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
