import { BaseWorker } from './index';
import { ProviderId } from '@/types';
import { supabase } from '@/lib/supabase';
import { uploadToStorage } from '@/lib/supabase/storage';
import { errorFactory } from '@/utils/errors';

export interface DownloadPayload {
  sourceId: string;
  url: string;
  provider: ProviderId;
  metadata?: Record<string, unknown>;
}

export interface DownloadResult {
  success: boolean;
  sourceId: string;
  mediaItemId: string | null;
  storagePath: string | null;
  storageUrl: string | null;
  error?: string;
}

function extractVideoUrlFromPage(html: string): string | null {
  const patterns = [
    /"url":"(https:\/\/[^"]+\.mp4[^"]*)"/g,
    /(https:\/\/[^"\s]+\.mp4(?:\?[^"\s]*)?)/g,
    /og:video"\s*content="(https:\/\/[^"]+)"/,
    /og:video:url"\s*content="(https:\/\/[^"]+)"/,
    /"video_url"\s*:\s*"(https:\/\/[^"]+)"/,
    /(https:\/\/video[^"\s]+\.mp4)/g,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      let url = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      if (url.startsWith('http')) return url;
    }
  }
  return null;
}

async function getDownloadUrl(provider: ProviderId, url: string, metadata?: Record<string, unknown>): Promise<string | null> {
  if (provider === 'youtube') {
    const videoId = metadata?.videoId as string | undefined;
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    const urlObj = new URL(url);
    const v = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
    if (v) return `https://www.youtube.com/watch?v=${v}`;
    return null;
  }

  if (metadata?.directUrl && typeof metadata.directUrl === 'string') {
    return metadata.directUrl;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) return null;

  const html = await res.text();
  return extractVideoUrlFromPage(html);
}

export class DownloadWorker extends BaseWorker {
  readonly name = 'download';

  async run(payload: DownloadPayload): Promise<DownloadResult> {
    const { sourceId, url, provider } = payload;
    const metadata = payload.metadata ?? {};

    try {
      const downloadUrl = await getDownloadUrl(provider, url, metadata);

      if (!downloadUrl) {
        throw errorFactory({
          provider,
          status: 404,
          message: 'No se pudo obtener URL de descarga del video',
        });
      }

      const videoRes = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!videoRes.ok || !videoRes.body) {
        throw errorFactory({
          provider,
          status: videoRes.status,
          message: 'Error al descargar el video',
        });
      }

      const contentLength = parseInt(videoRes.headers.get('content-length') || '0', 10);
      const contentType = videoRes.headers.get('content-type') || 'video/mp4';

      const chunks: Buffer[] = [];
      const reader = videoRes.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(Buffer.from(value));
        }
      }

      const buffer = Buffer.concat(chunks);
      const filename = `${sourceId}/${Date.now()}.mp4`;

      const uploadResult = await uploadToStorage('media', filename, buffer, contentType);

      const { data: mediaItem, error: dbError } = await supabase
        .from('media_items')
        .insert({
          source_id: sourceId,
          url: uploadResult.url,
          thumbnail_url: null,
          type: 'video',
          duration: null,
          width: null,
          height: null,
          metadata: {
            originalUrl: url,
            downloadUrl,
            size: contentLength || buffer.length,
            contentType,
            storagePath: uploadResult.path,
          },
        })
        .select()
        .single();

      if (dbError) {
        throw errorFactory({
          provider: null,
          status: 500,
          message: `Error al crear MediaItem: ${dbError.message}`,
          body: dbError,
        });
      }

      return {
        success: true,
        sourceId,
        mediaItemId: mediaItem.id,
        storagePath: uploadResult.path,
        storageUrl: uploadResult.url,
      };
    } catch (error) {
      const appError = errorFactory({
        provider,
        status: 500,
        message: error instanceof Error ? error.message : 'Error en descarga',
        cause: error,
      });

      try {
        await supabase
          .from('media_items')
          .insert({
            source_id: sourceId,
            url: url,
            thumbnail_url: null,
            type: 'video',
            duration: null,
            width: null,
            height: null,
            metadata: {
              error: appError.code,
              errorMessage: appError.message,
              failed: true,
            },
          });
      } catch {
        // ignore insert error on failure path
      }

      return {
        success: false,
        sourceId,
        mediaItemId: null,
        storagePath: null,
        storageUrl: null,
        error: appError.message,
      };
    }
  }
}