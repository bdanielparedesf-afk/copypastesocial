/**
 * FASE 6 — Source Provider de Instagram.
 *
 * REGLA DE SEGURIDAD #46: usa SOLO la Graph API oficial de Meta.
 * - Posts/reels públicos → Instagram oEmbed API (`graph.facebook.com/{v}/oembed`).
 * - Perfiles → requieren token de usuario conectado (Fase 9-12); sin token se
 *   reporta AUTH_REQUIRED. Perfil privado → PRIVATE. Nunca se hace scraping.
 */
import type { MediaItem, SourceAccessibility, SourceProvider } from './interface';
import { authRequiredMessage, HUMAN_ACCESSIBILITY_MESSAGES } from './interface';
import { detectSource, normalizeSourceUrl } from '@/services/source-detector';
import { config } from '@/config';
import { isMockEnabled, mockAccessibility, mockMediaItems } from './mock';

interface OEmbedResponse {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  error?: { message?: string; type?: string; code?: number };
}

export class InstagramSourceProvider implements SourceProvider {
  readonly name = 'instagram' as const;

  /** Token de usuario (se inyectará desde social_accounts en Fase 9-12). */
  private userAccessToken: string | null = null;

  setUserAccessToken(token: string | null): void {
    this.userAccessToken = token;
  }

  private getAccessToken(): string | null {
    if (this.userAccessToken) return this.userAccessToken;
    const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (envToken) return envToken;
    const { appId, appSecret } = config.providers.instagram;
    if (appId && appSecret) return `${appId}|${appSecret}`;
    return null;
  }

  canHandle(url: string): boolean {
    return detectSource(url).provider === 'instagram';
  }

  async checkAccessibility(url: string): Promise<SourceAccessibility> {
    if (isMockEnabled()) {
      // Heurística determinista sobre la URL completa (permite simular
      // PRIVATE/AUTH_REQUIRED/API_RESTRICTED en tests con MOCK_MODE=true).
      return mockAccessibility(url.toLowerCase());
    }

    const token = this.getAccessToken();
    if (!token) return 'AUTH_REQUIRED';

    try {
      const normalized = normalizeSourceUrl(url);
      const oembedUrl = `${config.providers.instagram.graphApiUrl}/${config.providers.instagram.graphApiVersion}/oembed?url=${encodeURIComponent(normalized)}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(oembedUrl, { method: 'GET' });

      if (res.ok) return 'ACCESSIBLE';

      const body = await res.text().catch(() => '');
      const lowered = body.toLowerCase();

      // Contenido privado → PRIVATE (nunca se intenta evadir el acceso).
      if (lowered.includes('private')) return 'PRIVATE';
      // Token inválido/expirado → se requiere conectar cuenta.
      if (res.status === 401 || body.includes('code 190') || lowered.includes('access token')) {
        return 'AUTH_REQUIRED';
      }
      if (res.status === 404) return 'UNAVAILABLE';
      if (res.status === 429 || res.status >= 500) return 'API_RESTRICTED';
      return 'ERROR';
    } catch {
      return 'ERROR';
    }
  }

  async fetchMetadata(url: string): Promise<MediaItem[]> {
    const detected = detectSource(url);

    if (isMockEnabled()) {
      if (mockAccessibility(url.toLowerCase()) !== 'ACCESSIBLE') return [];
      const type = detected.contentType === 'profile' ? 'video' : detected.contentType === 'reel' ? 'video' : 'image';
      return mockMediaItems('instagram', detected.identifier, detected.contentType, type);
    }

    const token = this.getAccessToken();
    if (!token) return [];

    try {
      const normalized = normalizeSourceUrl(url);
      const oembedUrl = `${config.providers.instagram.graphApiUrl}/${config.providers.instagram.graphApiVersion}/oembed?url=${encodeURIComponent(normalized)}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(oembedUrl, { method: 'GET' });
      if (!res.ok) return [];

      const data = (await res.json().catch(() => ({}))) as OEmbedResponse;
      if (!data || (!data.title && !data.thumbnail_url)) return [];

      return [
        {
          externalId: detected.identifier || null,
          url: normalized,
          title: data.title ?? null,
          thumbnailUrl: data.thumbnail_url ?? null,
          type: detected.contentType === 'reel' ? 'video' : 'image',
          duration: null,
          width: null,
          height: null,
          publishedAt: null,
          metadata: {
            provider: 'instagram',
            authorName: data.author_name ?? null,
            authorUrl: data.author_url ?? null,
          },
        },
      ];
    } catch {
      return [];
    }
  }

  /** Mensaje humano para AUTH_REQUIRED de este provider. */
  authMessage(): string {
    return authRequiredMessage(this.name);
  }

  /** Mensaje humano por defecto para un estado. */
  defaultMessage(accessibility: SourceAccessibility): string {
    return HUMAN_ACCESSIBILITY_MESSAGES[accessibility];
  }
}
