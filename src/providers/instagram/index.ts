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

export class InstagramProvider extends BaseProvider {
  readonly id = 'instagram' as const;
  readonly label = 'Instagram';

  canHandle(hostname: string): boolean {
    return hostname.includes('instagram.com');
  }

  async audit(url: string): Promise<AuditResult> {
    try {
      const cfg = config.providers.instagram;
      const oembedUrl = `${cfg.graphApiUrl}/${cfg.graphApiVersion}/oembed?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = { 'User-Agent': 'CopyPasteSocial/1.0' };

      const res = await fetch(oembedUrl, { headers });

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        const lowered = text.toLowerCase();
        if (lowered.includes('private') || lowered.includes('account is private') || lowered.includes('login required')) {
          throw errorFactory({
            provider: 'instagram',
            status: res.status,
            body: text,
          });
        }
        throw errorFactory({
          provider: 'instagram',
          status: res.status,
          message: 'Se requiere autenticación para acceder a este contenido',
          body: text,
        });
      }

      if (res.status === 404) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'instagram',
          status: res.status,
          body: text,
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw errorFactory({
          provider: 'instagram',
          status: res.status,
          body: text,
        });
      }

      const data = (await res.json().catch(() => ({}))) as OEmbedResponse;

      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        throw errorFactory({
          provider: 'instagram',
          status: 404,
          message: 'Contenido no encontrado',
        });
      }

      const thumbnail = data.thumbnail_url ?? null;

      return {
        id: crypto.randomUUID(),
        sourceUrl: url,
        provider: 'instagram',
        status: AuditStatus.ACCESSIBLE,
        title: data.title || 'Contenido de Instagram',
        message: 'El contenido es público y disponible.',
                metadata: toJsonObject({
          provider: 'instagram',
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
        provider: 'instagram',
        status: 500,
        message: error instanceof Error ? error.message : 'Error desconocido',
        cause: error,
      });
    }
  }

  async fetchContent(url: string): Promise<unknown> {
    return { url, provider: 'instagram' };
  }
}