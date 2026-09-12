import { BaseProvider } from '..';
import { AuditResult, AuditStatus } from '@/types';
import { errorFactory } from '@/utils/errors';
import { toJsonObject } from '@/utils';

interface OEmbedResponse {
  type: string;
  version: string;
  provider_name: string;
  provider_url: string;
  author_name?: string;
  author_url?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  url?: string;
  html?: string;
  [key: string]: unknown;
}

export class TikTokProvider extends BaseProvider {
  readonly id = 'tiktok' as const;
  readonly label = 'TikTok';

  canHandle(hostname: string): boolean {
    return hostname.includes('tiktok.com');
  }

        async audit(url: string): Promise<AuditResult> {
    // TikTok oEmbed does not require client key for public content lookup
    try {
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
      const res = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'CopyPasteSocial/1.0' },
      });

      if (res.status === 404) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'tiktok',
          status: res.status,
          body: text,
        });
      }

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'tiktok',
          status: res.status,
          message: 'Se requiere autenticación para acceder a este contenido',
          body: text,
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'tiktok',
          status: res.status,
          body: text,
        });
      }

      const data = (await res.json().catch(() => ({}))) as OEmbedResponse;

      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        throw errorFactory({
          provider: 'tiktok',
          status: 404,
          message: 'Video no encontrado',
        });
      }

      const thumbnail = data.thumbnail_url ?? null;

      return {
        id: crypto.randomUUID(),
        sourceUrl: url,
        provider: 'tiktok',
        status: AuditStatus.ACCESSIBLE,
        title: data.title || 'Video de TikTok',
        message: 'El video es público y disponible.',
                metadata: toJsonObject({
          provider: 'tiktok',
          oembed: {
            title: data.title,
            description: data.description,
            authorName: data.author_name,
            authorUrl: data.author_url,
            providerName: data.provider_name,
            thumbnail,
            type: data.type,
          },
        }),
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
        throw error;
      }
      throw errorFactory({
        provider: 'tiktok',
        status: 500,
        message: error instanceof Error ? error.message : 'Error desconocido',
        cause: error,
      });
        }
  }

  async fetchContent(url: string): Promise<unknown> {
    return { url, provider: 'tiktok' };
  }
}