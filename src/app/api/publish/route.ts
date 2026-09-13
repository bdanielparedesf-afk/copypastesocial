/**
 * FASE 10 — POST /api/publish
 *
 * Publica un media_item (REELS de IG) que ya está READY (Fase 8).
 *
 * Body:
 *   { social_account_id: uuid, media_id: uuid, caption?: string, scheduled_at?: string }
 *
 * Flujo:
 *   1. Valida que media_id existe, es 'video' y status==='READY'.
 *   2. Encola en publish_queue (PENDING o SCHEDULED).
 *   3. Si no hay scheduled_at → procesa en línea (processPost):
 *        createContainer → polling 5s hasta FINISHED → publishContainer →
 *        update queue PUBLISHED.
 *
 * Sin token real → fallback MOCK que marca PUBLISHED con ig_media_id mock_*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { enqueuePost, processPost } from '@/lib/publishing';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  social_account_id: z.string().uuid('social_account_id debe ser un UUID'),
  media_id: z.string().uuid('media_id debe ser un UUID'),
  caption: z.string().max(2200, 'caption máx. 2200 chars').trim().optional().default(''),
  scheduled_at: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const admin = createServerClient();

  // 1) Auth + body
  const { data: { user } } = await admin.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Body inválido' },
      { status: 400 }
    );
  }

  const { social_account_id: socialAccountId, media_id: mediaId, caption, scheduled_at: scheduledAt } = parsed.data;

  try {
    // 2) Media item READY + ownership (sources.user_id = user)
    const { data: media, error: mediaError } = await admin
      .from('media_items')
      .select('id, type, status, processed_path, processed_url, sources!inner(user_id)')
      .eq('id', mediaId)
      .single();

    if (mediaError || !media) {
      return NextResponse.json(
        { success: false, error: 'media_item no encontrado' },
        { status: 404 }
      );
    }

    const sources = media.sources as unknown;
    const sourceOwner = Array.isArray(sources)
      ? (sources[0] as { user_id?: string } | undefined)?.user_id
      : (sources as { user_id?: string } | undefined)?.user_id;

    if (sourceOwner !== userId) {
      return NextResponse.json(
        { success: false, error: 'media_item no encontrado o sin permisos' },
        { status: 404 }
      );
    }

    if ((media.status ?? 'PENDING') !== 'READY') {
      return NextResponse.json(
        { success: false, error: `media ${mediaId} no está READY (status=${media.status ?? 'PENDING'})` },
        { status: 400 }
      );
    }

    // 3) Encolar (PENDING o SCHEDULED)
    const queueItem = await enqueuePost({
      userId,
      socialAccountId,
      mediaId,
      caption,
      scheduledAt,
    });

    // 4) Sin schedule → procesar en línea (polling 5s hasta FINISHED)
    if (!scheduledAt) {
      await processPost(queueItem.id);
    }

    const { data: processed } = await admin
      .from('publish_queue')
      .select('id, status, ig_media_id, error')
      .eq('id', queueItem.id)
      .single();

    return NextResponse.json({
      success: processed?.status === 'PUBLISHED',
      queue: processed,
      message:
        processed?.status === 'PUBLISHED'
          ? `Publicado (${processed.ig_media_id ?? 'mock'})`
          : processed?.error ?? 'Encolado',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error al publicar' },
      { status: 500 }
    );
  }
}