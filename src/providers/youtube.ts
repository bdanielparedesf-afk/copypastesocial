/**
 * FASE 6 — Source Provider de YouTube.
 *
 * REGLA DE SEGURIDAD #46: usa SOLO YouTube Data API v3 (API oficial de Google)
 * con GOOGLE_API_KEY del .env. Sin scraping, sin descargas no autorizadas.
 * - Video público → ACCESSIBLE.
 * - Video privado → AUTH_REQUIRED ("Necesitas conectar tu cuenta de YouTube").
 * - Cuota/credencial faltante → API_RESTRICTED.
 */
import type { MediaItem, SourceAccessibility, SourceProvider } from './interface';
import { authRequiredMessage, HUMAN_ACCESSIBILITY_MESSAGES } from './interface';
import { detectSource, normalizeSourceUrl } from '@/services/source-detector';
import { isMockEnabled, mockAccessibility, mockMediaItems } from './mock';

interface YouTubeApiError {
  error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> };
}

interface YouTubeVideoResource {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string; width?: number; height?: number } | undefined>;
  };
  status?: { privacyStatus?: string; uploadStatus?: string };
  contentDetails?: { duration?: string; definition?: string };
}

interface YouTubeChannelResource {
  id?: string;
  snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string } | undefined> };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface YouTubePlaylistItem {
  snippet?: {
    title?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string; width?: number; height?: number } | undefined>;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
}

/** Convierte duración ISO-8601 (PT1H2M3S) a segundos. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, d, h, m, s] = match;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

function pickThumbnail(
  thumbs: Record<string, { url?: string; width?: number; height?: number } | undefined> | undefined
): { url: string | null; width: number | null; height: number | null } {
  const best = thumbs?.maxres ?? thumbs?.standard ?? thumbs?.high ?? thumbs?.medium ?? thumbs?.default;
  return { url: best?.url ?? null, width: best?.width ?? null, height: best?.height ?? null };
}

export class YoutubeSourceProvider implements SourceProvider {
  readonly name = 'youtube' as const;

  canHandle(url: string): boolean {
    return detectSource(url).provider === 'youtube';
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const search = new URLSearchParams(params);
    return `https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`;
  }

  async checkAccessibility(url: string): Promise<SourceAccessibility> {
    if (isMockEnabled()) {
      // Heurística determinista sobre la URL completa (MOCK_MODE=true).
      return mockAccessibility(url.toLowerCase());
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      // Sin API key del .env no hay API oficial disponible → restricción de API.
      return 'API_RESTRICTED';
    }

    const detected = detectSource(url);

    try {
      if (detected.contentType === 'video' || detected.contentType === 'short') {
        const res = await fetch(
          this.buildUrl('videos', { id: detected.identifier, key: apiKey, part: 'status,snippet,contentDetails' })
        );
        if (!res.ok) return this.mapHttpError(res.status, await res.json().catch(() => ({})) as YouTubeApiError);

        const data = (await res.json().catch(() => ({}))) as { items?: YouTubeVideoResource[] };
        const video = data.items?.[0];
        if (!video) return 'UNAVAILABLE';
        if (video.status?.privacyStatus === 'private') {
          // Acceso posible solo con la cuenta del propietario conectada.
          return 'AUTH_REQUIRED';
        }
        return 'ACCESSIBLE';
      }

      // Perfil: canal de YouTube
      const params: Record<string, string> = { key: apiKey, part: 'id,contentDetails' };
      if (/^UC[\w-]{10,}$/.test(detected.identifier)) {
        params.id = detected.identifier;
      } else {
        params.forHandle = `@${detected.identifier}`;
      }
      const res = await fetch(this.buildUrl('channels', params));
      if (!res.ok) return this.mapHttpError(res.status, await res.json().catch(() => ({})) as YouTubeApiError);

      const data = (await res.json().catch(() => ({}))) as { items?: YouTubeChannelResource[] };
      if (!data.items?.length) return 'UNAVAILABLE';
      return 'ACCESSIBLE';
    } catch {
      return 'ERROR';
    }
  }

  private mapHttpError(status: number, body: YouTubeApiError): SourceAccessibility {
    const reason = body.error?.errors?.[0]?.reason ?? '';
    if (status === 403 && (reason === 'quotaExceeded' || reason === 'rateLimitExceeded')) return 'API_RESTRICTED';
    if (status === 403 || status === 401) return 'API_RESTRICTED';
    if (status === 404) return 'UNAVAILABLE';
    return 'ERROR';
  }

  authMessage(): string {
    return authRequiredMessage(this.name);
  }

  defaultMessage(accessibility: SourceAccessibility): string {
    return HUMAN_ACCESSIBILITY_MESSAGES[accessibility];
  }

  async fetchMetadata(url: string): Promise<MediaItem[]> {
    const detected = detectSource(url);
    const normalized = normalizeSourceUrl(url);

    if (isMockEnabled()) {
      if (mockAccessibility(url.toLowerCase()) !== 'ACCESSIBLE') return [];
      if (detected.contentType === 'profile') {
        return mockMediaItems('youtube', detected.identifier, 'profile', 'video');
      }
      return mockMediaItems('youtube', detected.identifier, detected.contentType, 'video');
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    try {
      if (detected.contentType === 'video' || detected.contentType === 'short') {
        const res = await fetch(
          this.buildUrl('videos', { id: detected.identifier, key: apiKey, part: 'snippet,status,contentDetails' })
        );
        if (!res.ok) return [];
        const data = (await res.json().catch(() => ({}))) as { items?: YouTubeVideoResource[] };
        const video = data.items?.[0];
        if (!video || video.status?.privacyStatus === 'private') return [];

        const thumb = pickThumbnail(video.snippet?.thumbnails);
        return [
          {
            externalId: video.id ?? detected.identifier,
            url: `https://www.youtube.com/watch?v=${detected.identifier}`,
            title: video.snippet?.title ?? null,
            thumbnailUrl: thumb.url,
            type: 'video',
            duration: parseIsoDuration(video.contentDetails?.duration),
            width: thumb.width,
            height: thumb.height,
            publishedAt: video.snippet?.publishedAt ?? null,
            metadata: { provider: 'youtube', channelTitle: video.snippet?.channelTitle ?? null, sourceUrl: normalized },
          },
        ];
      }

      // Perfil → playlist de uploads del canal → últimos videos públicos.
      const channelParams: Record<string, string> = { key: apiKey, part: 'contentDetails,snippet' };
      if (/^UC[\w-]{10,}$/.test(detected.identifier)) {
        channelParams.id = detected.identifier;
      } else {
        channelParams.forHandle = `@${detected.identifier}`;
      }
      const channelRes = await fetch(this.buildUrl('channels', channelParams));
      if (!channelRes.ok) return [];
      const channelData = (await channelRes.json().catch(() => ({}))) as { items?: YouTubeChannelResource[] };
      const uploads = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];

      const playlistRes = await fetch(
        this.buildUrl('playlistItems', { playlistId: uploads, key: apiKey, part: 'snippet,contentDetails', maxResults: '50' })
      );
      if (!playlistRes.ok) return [];
      const playlistData = (await playlistRes.json().catch(() => ({}))) as { items?: YouTubePlaylistItem[] };

      return (playlistData.items ?? [])
        .map((item): MediaItem | null => {
          const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
          if (!videoId) return null;
          const thumb = pickThumbnail(item.snippet?.thumbnails);
          return {
            externalId: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: item.snippet?.title ?? null,
            thumbnailUrl: thumb.url,
            type: 'video',
            duration: null,
            width: thumb.width,
            height: thumb.height,
            publishedAt: item.snippet?.publishedAt ?? null,
            metadata: { provider: 'youtube', sourceUrl: normalized },
          };
        })
        .filter((item): item is MediaItem => item !== null);
    } catch {
      return [];
    }
  }
}

