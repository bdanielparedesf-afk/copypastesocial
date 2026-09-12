import { BaseProvider } from '..';
import { AuditResult, AuditStatus } from '@/types';
import { config } from '@/config';
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

export class FacebookProvider extends BaseProvider {
  readonly id = 'facebook' as const;
  readonly label = 'Facebook';

  canHandle(hostname: string): boolean {
    return hostname.includes('facebook.com') || hostname.includes('fb.me');
  }

    async audit(url: string): Promise<AuditResult> {
    const resolvedUrl = await this.resolveRedirect(url);

    try {
      const cfg = config.providers.facebook;
      const oembedUrl = `${cfg.graphApiUrl}/${cfg.graphApiVersion}/oembed_post?url=${encodeURIComponent(resolvedUrl)}`;
      const headers: Record<string, string> = { 'User-Agent': 'CopyPasteSocial/1.0' };

      const res = await fetch(oembedUrl, { headers });

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'facebook',
          status: res.status,
          message: 'Se requiere autenticación para acceder a este contenido',
          body: text,
        });
      }

      if (res.status === 404) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'facebook',
          status: res.status,
          body: text,
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'facebook',
          status: res.status,
          body: text,
        });
      }

      const data = (await res.json().catch(() => ({}))) as OEmbedResponse;

      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        throw errorFactory({
          provider: 'facebook',
          status: 404,
          message: 'Contenido no encontrado',
        });
      }

      const thumbnail = data.thumbnail_url ?? null;

      return {
        id: crypto.randomUUID(),
        sourceUrl: url,
        provider: 'facebook',
        status: AuditStatus.ACCESSIBLE,
        title: data.title || 'Contenido de Facebook',
        message: 'El contenido es público y disponible.',
                metadata: toJsonObject({
          provider: 'facebook',
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
        provider: 'facebook',
        status: 500,
        message: error instanceof Error ? error.message : 'Error desconocido',
        cause: error,
      });
    }
  }

  private async resolveRedirect(url: string): Promise<string> {
    try {
      const u = new URL(url);
      const shareMatch = u.pathname.match(/^\/share\/v\/([^/?#]+)\/?$/);
      if (!shareMatch) return url;

      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'CopyPasteSocial/1.0' },
      });

      return res.url || url;
    } catch {
      return url;
    }
  }

  async fetchContent(url: string): Promise<unknown> {
    return { url, provider: 'facebook' };
  }
}