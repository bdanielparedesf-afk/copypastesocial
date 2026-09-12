import { BaseProvider } from '..';
import { AuditResult, AuditStatus } from '@/types';
import { config } from '@/config';
import { errorFactory } from '@/utils/errors';
import { toJsonObject } from '@/utils';

interface YouTubeVideoItem {
  id: string;
  status: {
    privacyStatus: string;
    uploadStatus: string;
    failureReason?: string;
    rejectionReason?: string;
  };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
      maxres?: { url: string };
    };
  };
  contentDetails: {
    duration: string;
    dimension: string;
    definition: string;
  };
}

interface YouTubeApiResponse {
  items?: YouTubeVideoItem[];
  error?: {
    code: number;
    message: string;
    errors: Array<{ reason: string }>;
  };
}

export class YoutubeProvider extends BaseProvider {
  readonly id = 'youtube' as const;
  readonly label = 'YouTube';

  canHandle(hostname: string): boolean {
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  }

  async audit(url: string): Promise<AuditResult> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      return this.errorResult(url, AuditStatus.UNAVAILABLE, 'No se pudo extraer el ID del video', {});
    }

    const apiKey = config.providers.youtube.apiKey;
    if (!apiKey) {
      return this.errorResult(
        url,
        AuditStatus.API_RESTRICTED,
        'GOOGLE_API_KEY no está configurado',
        { videoId }
      );
    }

    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}&part=status,snippet,contentDetails`
      );

      const data = (await res.json().catch(() => ({}))) as YouTubeApiResponse;

      if (!res.ok) {
        throw errorFactory({
          provider: 'youtube',
          status: res.status,
          body: data,
        });
      }

      const items = data.items ?? [];
      if (items.length === 0) {
        return this.errorResult(url, AuditStatus.UNAVAILABLE, 'Video no encontrado', { videoId });
      }

      const video = items[0];

      if (video.status.privacyStatus === 'private') {
        return {
          id: crypto.randomUUID(),
          sourceUrl: url,
          provider: 'youtube',
          status: AuditStatus.PRIVATE,
          title: 'Video privado',
          message: 'El video de YouTube es privado.',
          metadata: {
            videoId,
            privacyStatus: video.status.privacyStatus,
          },
          createdAt: new Date().toISOString(),
        };
      }

      if (
        video.status.uploadStatus !== 'processed' ||
        video.status.failureReason ||
        video.status.rejectionReason
      ) {
              return {
        id: crypto.randomUUID(),
        sourceUrl: url,
        provider: 'youtube',
        status: AuditStatus.UNAVAILABLE,
        title: 'Video no disponible',
        message: 'El video de YouTube no está disponible o fue rechazado.',
        metadata: {
          videoId,
          uploadStatus: video.status.uploadStatus ?? null,
          failureReason: video.status.failureReason ?? null,
          rejectionReason: video.status.rejectionReason ?? null,
        },
        createdAt: new Date().toISOString(),
      };
      }

      const snippet = video.snippet ?? {};
      const contentDetails = video.contentDetails ?? {};
      const thumbnail =
        snippet.thumbnails?.maxres?.url ??
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        snippet.thumbnails?.default?.url ??
        null;

      return {
        id: crypto.randomUUID(),
        sourceUrl: url,
        provider: 'youtube',
        status: AuditStatus.ACCESSIBLE,
        title: snippet.title || 'Video de YouTube',
        message: 'El video es público y disponible.',
        metadata: {
          videoId,
          title: snippet.title,
          thumbnail,
          duration: contentDetails.duration,
          channelTitle: snippet.channelTitle,
          publishedAt: snippet.publishedAt,
        },
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
        throw error;
      }
      throw errorFactory({
        provider: 'youtube',
        status: 500,
        message: error instanceof Error ? error.message : 'Error desconocido',
        cause: error,
      });
    }
  }

  private extractVideoId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.split('/')[1];
        return id || null;
      }
      if (u.hostname.includes('youtube.com')) {
        if (u.pathname === '/watch') {
          return u.searchParams.get('v');
        }
        if (u.pathname.startsWith('/shorts/')) {
          const parts = u.pathname.split('/');
          return parts[2] || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

    private errorResult(
    url: string,
    status: AuditStatus,
    message: string,
    metadata: Record<string, unknown>
  ): AuditResult {
    return {
      id: crypto.randomUUID(),
      sourceUrl: url,
      provider: 'youtube',
      status,
      title: message,
      message,
      metadata: toJsonObject(metadata),
      createdAt: new Date().toISOString(),
    };
  }

  async fetchContent(url: string): Promise<unknown> {
    return { url, provider: 'youtube' };
  }
}