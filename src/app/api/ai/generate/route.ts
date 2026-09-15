import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, resolveUserId } from '@/lib/supabase/api';
import { aiService } from '@/lib/ai/ai-service';
import type { AIPack } from '@/lib/ai/ai-service';
import type { ProviderId } from '@/types';

export const dynamic = 'force-dynamic';

interface GenerateRequest {
  mediaItemIds: string[];
  action: 'caption' | 'title' | 'hashtags' | 'rewrite' | 'pack';
  platform?: ProviderId;
  tone?: string;
  /** Contexto adicional (ej: nombre del archivo subido localmente). */
  context?: string;
  /**
   * Fotogramas del video (data URLs base64 capturados en el navegador).
   * Solo se usan en action='pack' para generación multimodal (visión).
   */
  frames?: string[];
}

interface GenerateResult {
  mediaId: string;
  generated: string;
  pack?: AIPack;
}

export async function POST(request: NextRequest) {
  try {
    const db = getDbClient();
    const userId = await resolveUserId();
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as GenerateRequest;
    const { mediaItemIds, action, platform, tone, context } = body;
    const frames = body.frames;

    if (!mediaItemIds || !Array.isArray(mediaItemIds) || mediaItemIds.length === 0) {
      return NextResponse.json(
        { error: 'mediaItemIds array is required' },
        { status: 400 }
      );
    }

    if (!['caption', 'title', 'hashtags', 'rewrite', 'pack'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: caption, title, hashtags, rewrite, or pack' },
        { status: 400 }
      );
    }

    // Frames: máx 4 data URLs/base64 de tamaño razonable (defensa temprana;
    // la normalización fina vive en parseFrames() del ai-service).
    if (frames !== undefined) {
      if (
        !Array.isArray(frames) ||
        frames.length > 4 ||
        frames.some((f) => typeof f !== 'string' || f.length > 8_000_000)
      ) {
        return NextResponse.json(
          { error: 'frames debe ser un array de máx 4 data URLs de imagen en base64' },
          { status: 400 }
        );
      }
    }

    const { data: mediaItems, error: mediaError } = await db
      .from('media_items')
      .select('id, metadata, sources!inner (user_id)')
      .in('id', mediaItemIds)
      .eq('sources.user_id', userId);

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }

    if (!mediaItems || mediaItems.length === 0) {
      return NextResponse.json(
        { error: 'No media items found or access denied' },
        { status: 404 }
      );
    }

    const foundIds = new Set(mediaItems.map((m) => m.id));
    const missingIds = mediaItemIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Media items not found or access denied: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    const clientContext = typeof context === 'string' ? context.trim() : '';

    const results: GenerateResult[] = [];

    for (const item of mediaItems) {
      const originalText = (item.metadata?.caption as string) ?? 
                           (item.metadata?.description as string) ?? 
                           (item.metadata?.title as string) ?? 
                           '';

      const textForAI = originalText || clientContext;

      // Pack completo (título + descripción + hashtags) en una sola llamada.
      // Los frames (fotogramas del video) habilitan la generación multimodal:
      // la IA ve el CONTENIDO real del video, no solo el nombre del archivo.
      if (action === 'pack') {
        const packContext =
          textForAI ||
          ((item.metadata?.original_filename as string) ?? '').trim() ||
          'video';
        const targetPlatform = platform ?? 'instagram';
        const pack = await aiService.generatePack(packContext, targetPlatform, frames);
        results.push({ mediaId: item.id, generated: '', pack });
        continue;
      }

      if (!textForAI && action !== 'hashtags') {
        results.push({ mediaId: item.id, generated: '' });
        continue;
      }

      let generated: string | string[] = '';

      switch (action) {
        case 'caption': {
          const targetPlatform = platform ?? 'instagram';
          generated = await aiService.generateCaption(originalText, targetPlatform);
          break;
        }
        case 'title': {
          const targetPlatform = platform ?? 'instagram';
          generated = await aiService.generateTitle(originalText, targetPlatform);
          break;
        }
        case 'hashtags': {
          const targetPlatform = platform ?? 'instagram';
          const hashtags = await aiService.generateHashtags(10, targetPlatform, textForAI);
          generated = hashtags;
          break;
        }
        case 'rewrite': {
          const targetTone = tone ?? 'engaging';
          generated = await aiService.rewrite(originalText, targetTone);
          break;
        }
      }

      results.push({
        mediaId: item.id,
        generated: Array.isArray(generated) ? generated.join(' ') : generated,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('AI generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}