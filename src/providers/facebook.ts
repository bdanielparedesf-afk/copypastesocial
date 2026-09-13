/**
 * FASE 6 — Source Provider de Facebook.
 *
 * REGLA DE SEGURIDAD #46: usa SOLO la Graph API oficial de Meta con
 * META_APP_ID / META_APP_SECRET (app access token). Solo se consultan
 * páginas/perfiles PÚBLICOS. Contenido privado → PRIVATE / AUTH_REQUIRED.
 * Sin scraping, sin bypass de login, sin sesiones de terceros.
 */
import type { MediaItem, SourceAccessibility, SourceProvider } from './interface';
import { authRequiredMessage, HUMAN_ACCESSIBILITY_MESSAGES } from './interface';
import { detectSource, normalizeSourceUrl } from '@/services/source-detector';
import { config } from '@/config';
import { isMockEnabled, mockAccessibility, mockMediaItems } from './mock';

interface GraphErrorBody {
  error?: { code?: number; type?: string; message?: string };
}

interface GraphPageResource {
  id?: string;
  name?: string;
  link?: string;
  picture?: { data?: { url?: string; width?: number; height?: number } };
}

interface GraphVideoResource {
  id?: string;
  description?: string;
  permalink_url?: string;
  created_time?: string;
  format?: Array<{ width?: number; height?: number; picture?: string }>;
  picture?: string;
}

export class FacebookSourceProvider implements SourceProvider {
  readonly name = 'facebook' as const;

  /** Token de página/usuario (se inyectará desde social_accounts en Fase 9-12). */
  private userAccessToken: string | null = null;

  setUserAccessToken(token: string | null): void {
    this.userAccessToken = token;
  }

  private getAppAccessToken(): string | null {
    if (this.userAccessToken) return this.userAccessToken;
    const { appId, appSecret } = config.providers.facebook;
    if (appId && appSecret) return `${appId}|${appSecret}`;
    return null;
  }

  canHandle(url: string): boolean {
    return detectSource(url).provider === 'facebook';
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const search = new URLSearchParams(params);
    return `${config.providers.facebook.graphApiUrl}/${config.providers.facebook.graphApiVersion}/${path}?${search.toString()}`;
  }

  /** Mapea errores de la Graph API a estados de accesibilidad. */
  private mapGraphError(status: number, body: GraphErrorBody): SourceAccessibility {
    const code = body.error?.code;
    const message = (body.error?.message ?? '').toLowerCase();
    // OAuthException: token inválido/expirado o permisos insuficientes.
    if (code === 190 || code === 102 || code === 104 || code === 10) return 'AUTH_REQUIRED';
    if (message.includes('private')) return 'PRIVATE';
    if (status === 404 || code === 100 || code === 804) return 'UNAVAILABLE';
    if (status === 429 || code === 4 || code === 17 || code === 32 || status >= 500) return 'API_RESTRICTED';
    return 'ERROR';
  }

  async checkAccessibility(url: string): Promise<SourceAccessibility> {
    if (isMockEnabled()) {
      // Heurística determinista sobre la URL completa (MOCK_MODE=true):
      // Facebook detecta el ID del video como identifier, por lo que la
      // simulación de PRIVATE/AUTH_REQUIRED se hace sobre la URL.
      return mockAccessibility(url.toLowerCase());
    }

    const token = this.getAppAccessToken();
    if (!token) return 'AUTH_REQUIRED';

    const detected = detectSource(url);

    try {
      if (detected.contentType === 'video') {
        const res = await fetch(
          this.buildUrl(detected.identifier, {
            fields: 'id,description,permalink_url,created_time,picture',
            access_token: token,
          })
        );
        if (res.ok) return 'ACCESSIBLE';
        return this.mapGraphError(res.status, await res.json().catch(() => ({})) as GraphErrorBody);
      }

      // Página/perfil público
      const res = await fetch(
        this.buildUrl(detected.identifier, {
          fields: 'id,name,link,picture.type(large)',
          access_token: token,
        })
      );
      if (res.ok) return 'ACCESSIBLE';
      return this.mapGraphError(res.status, await res.json().catch(() => ({})) as GraphErrorBody);
    } catch {
      return 'ERROR';
    }
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
        return mockMediaItems('facebook', detected.identifier, 'profile', 'video');
      }
      return mockMediaItems('facebook', detected.identifier, detected.contentType, 'video');
    }

    const token = this.getAppAccessToken();
    if (!token) return [];

    try {
      if (detected.contentType === 'video') {
        const res = await fetch(
          this.buildUrl(detected.identifier, {
            fields: 'id,description,permalink_url,created_time,picture,format',
            access_token: token,
          })
        );
        if (!res.ok) return [];
        const data = (await res.json().catch(() => ({}))) as GraphVideoResource;
        const format = data.format?.[data.format.length - 1];
        return [
          {
            externalId: data.id ?? detected.identifier,
            url: data.permalink_url ?? normalized,
            title: data.description ?? null,
            thumbnailUrl: data.picture ?? format?.picture ?? null,
            type: 'video',
            duration: null,
            width: format?.width ?? null,
            height: format?.height ?? null,
            publishedAt: data.created_time ?? null,
            metadata: { provider: 'facebook', sourceUrl: normalized },
          },
        ];
      }

      // Página pública → videos recientes (solo si son públicos).
      const pageRes = await fetch(
        this.buildUrl(detected.identifier, { fields: 'id,name,picture.type(large)', access_token: token })
      );
      if (!pageRes.ok) return [];
      const page = (await pageRes.json().catch(() => ({}))) as GraphPageResource;

      const videosRes = await fetch(
        this.buildUrl(`${page.id ?? detected.identifier}/videos`, {
          fields: 'id,description,permalink_url,created_time,picture',
          limit: '50',
          access_token: token,
        })
      );
      if (!videosRes.ok) return [];
      const videos = (await videosRes.json().catch(() => ({}))) as { data?: GraphVideoResource[] };

      return (videos.data ?? [])
        .map((video): MediaItem | null => {
          if (!video.id) return null;
          return {
            externalId: video.id,
            url: video.permalink_url ?? normalized,
            title: video.description ?? null,
            thumbnailUrl: video.picture ?? null,
            type: 'video',
            duration: null,
            width: null,
            height: null,
            publishedAt: video.created_time ?? null,
            metadata: { provider: 'facebook', sourceUrl: normalized, pageName: page.name ?? null },
          };
        })
        .filter((item): item is MediaItem => item !== null);
    } catch {
      return [];
    }
  }
}

