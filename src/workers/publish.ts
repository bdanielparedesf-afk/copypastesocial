import { BaseWorker } from './index';
import { supabase } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';
import { config } from '@/config';
import { errorFactory } from '@/utils/errors';
import type { ProviderId, SocialAccount } from '@/types';

export interface PublishPayload {
  publicationId: string;
  socialAccountId: string;
  mediaItemId: string;
  caption?: string;
}

export interface PublishResult {
  success: boolean;
  publicationId: string;
  platformPostId: string | null;
  platformUrl: string | null;
  error?: string;
}

interface MediaItemRow {
  id: string;
  url: string;
  thumbnail_url: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
}

interface ProviderConfig {
  graphApiUrl: string;
  graphApiVersion: string;
}

type JsonResponse = Record<string, any>;

export class PublishWorker extends BaseWorker {
  readonly name = 'publish';

  async run(payload: PublishPayload): Promise<PublishResult> {
    const { publicationId, socialAccountId, mediaItemId, caption = '' } = payload;

    await this.setPublicationStatus(publicationId, 'processing');

    try {
      const account = await this.loadAccount(socialAccountId);
      const media = await this.loadMediaItem(mediaItemId);

      // El token guardado en BD está encriptado: TokenService espera el valor encriptado.
      const isValid = await tokenService.validate(account);

      let accessToken: string;
      if (!isValid && account.refreshToken) {
        const refreshed = await tokenService.refresh(account);
        accessToken = refreshed.accessToken;
      } else if (!isValid) {
        throw errorFactory({
          provider: account.provider,
          status: 401,
          message: 'Token inválido o expirado y no hay refresh token disponible',
        });
      } else {
        accessToken = tokenService.decrypt(account.accessToken);
      }

      // Modo mock: simula la publicación sin salir a las APIs reales.
      if (config.mock.enabled) {
        await this.markPublished(publicationId);
        return { success: true, publicationId, platformPostId: null, platformUrl: null };
      }

      let postId: string | null = null;
      let postUrl: string | null = null;
switch (account.provider) {
        case 'instagram': {
          const result = await this.publishToInstagram(accessToken, media, caption);
          postId = result.id;
          postUrl = result.url;
          break;
        }
        case 'facebook': {
          const result = await this.publishToFacebook(accessToken, media, caption);
          postId = result.id;
          postUrl = result.url;
          break;
        }
        case 'youtube': {
          const result = await this.publishToYouTube(accessToken);
          postId = result.id;
          postUrl = result.url;
          break;
        }
        case 'tiktok': {
          const result = await this.publishToTikTok(accessToken, media, caption);
          postId = result.id;
          postUrl = result.url;
          break;
        }
        default:
          throw errorFactory({
            provider: account.provider,
            status: 400,
            message: `Provider ${account.provider} no soportado para publicación`,
          });
      }

      await this.markPublished(publicationId);

      return { success: true, publicationId, platformPostId: postId, platformUrl: postUrl };
    } catch (error) {
      const appError = errorFactory({
        provider: null,
        status: 500,
        message: error instanceof Error ? error.message : 'Error al publicar',
        cause: error,
      });

      await this.setPublicationStatus(publicationId, 'failed');

      return {
        success: false,
        publicationId,
        platformPostId: null,
        platformUrl: null,
        error: appError.message,
      };
    }
  }
// ------------------------------------------------------------------
  // Instagram: crear media container y luego media_publish
  // ------------------------------------------------------------------
  private async publishToInstagram(
    accessToken: string,
    media: MediaItemRow,
    caption: string
  ): Promise<{ id: string | null; url: string | null }> {
    const cfg = config.providers.instagram;
    const igUserId = await this.resolveInstagramBusinessId(accessToken, cfg);
    const isVideo = media.type !== 'image';

    const containerRes = await fetch(
      `${cfg.graphApiUrl}/${cfg.graphApiVersion}/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: isVideo ? 'VIDEO' : 'IMAGE',
          [isVideo ? 'video_url' : 'image_url']: media.url,
          caption,
          access_token: accessToken,
        }),
      }
    );

    const containerData = await this.parseJson(containerRes);
    if (!containerRes.ok) {
      throw errorFactory({
        provider: 'instagram',
        status: containerRes.status,
        body: containerData,
      });
    }

    const creationId = String(containerData.id ?? '');

    const publishRes = await fetch(
      `${cfg.graphApiUrl}/${cfg.graphApiVersion}/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
      }
    );

    const publishData = await this.parseJson(publishRes);
    if (!publishRes.ok) {
      throw errorFactory({
        provider: 'instagram',
        status: publishRes.status,
        body: publishData,
      });
    }

    const permalink = publishData.permalink ?? publishData.shortcode ?? publishData.id;
    return {
      id: String(publishData.id ?? creationId),
      url: typeof permalink === 'string' ? permalink : null,
    };
  }

  private async resolveInstagramBusinessId(accessToken: string, cfg: ProviderConfig): Promise<string> {
    const res = await fetch(
      `${cfg.graphApiUrl}/${cfg.graphApiVersion}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`
    );

    if (res.ok) {
      const data = await this.parseJson(res);
      const accounts = Array.isArray(data.data) ? data.data : [];
      for (const entry of accounts) {
        const ig = entry?.instagram_business_account;
        if (ig?.id) return String(ig.id);
      }
    }

    throw errorFactory({
      provider: 'instagram',
      status: 400,
      message: 'No se encontró una cuenta de Instagram Business vinculada para publicar',
    });
  }
// ------------------------------------------------------------------
  // Facebook: POST /{page_id}/videos con file_url
  // ------------------------------------------------------------------
  private async publishToFacebook(
    accessToken: string,
    media: MediaItemRow,
    caption: string
  ): Promise<{ id: string | null; url: string | null }> {
    const cfg = config.providers.facebook;
    const pageId = await this.resolveFacebookPageId(accessToken, cfg);

    const res = await fetch(
      `${cfg.graphApiUrl}/${cfg.graphApiVersion}/${pageId ?? 'me'}/videos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: media.url,
          description: caption,
          access_token: accessToken,
        }),
      }
    );

    const data = await this.parseJson(res);
    if (!res.ok) {
      throw errorFactory({
        provider: 'facebook',
        status: res.status,
        body: data,
      });
    }

    const id = String(data.id ?? '');
    return { id: id || null, url: id ? `https://www.facebook.com/watch/?v=${id}` : null };
  }

  private async resolveFacebookPageId(accessToken: string, cfg: ProviderConfig): Promise<string | null> {
    const res = await fetch(
      `${cfg.graphApiUrl}/${cfg.graphApiVersion}/me/accounts?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!res.ok) return null;

    const data = await this.parseJson(res);
    const page = Array.isArray(data.data) ? data.data[0] : null;
    return page?.id ? String(page.id) : null;
  }

  // ------------------------------------------------------------------
  // YouTube: POST resumable upload init con OAuth2 token
  // ------------------------------------------------------------------
  private async publishToYouTube(
    accessToken: string
  ): Promise<{ id: string | null; url: string | null }> {
    const res = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Upload-Content-Length': '0',
          'X-Upload-Content-Type': 'video/mp4',
        },
      }
    );

    if (!res.ok) {
      const body = await this.parseJson(res);
      throw errorFactory({
        provider: 'youtube',
        status: res.status,
        body,
      });
    }

    const sessionUrl = res.headers.get('Location');
    const videoId = this.extractYoutubeVideoId(sessionUrl);
    return {
      id: videoId,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : sessionUrl,
    };
  }

  private extractYoutubeVideoId(sessionUrl: string | null): string | null {
    if (!sessionUrl) return null;
    const match = sessionUrl.match(/\/videos\/([^/?]+)/);
    return match?.[1] || null;
  }
// ------------------------------------------------------------------
  // TikTok: POST /v2/post/publish/video/init/ con PULL_FROM_URL
  // ------------------------------------------------------------------
  private async publishToTikTok(
    accessToken: string,
    media: MediaItemRow,
    caption: string
  ): Promise<{ id: string | null; url: string | null }> {
    const cfg = config.providers.tiktok;

    const res = await fetch(`${cfg.baseUrl}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Tt-Client-Key': cfg.clientKey ?? '',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 32) || 'Nuevo video',
          description: caption,
          privacy_level: 'SELF_ONLY',
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: media.url,
        },
      }),
    });

    const data = await this.parseJson(res);
    if (!res.ok) {
      throw errorFactory({
        provider: 'tiktok',
        status: res.status,
        body: data,
      });
    }

    const publishId = String(data.data?.publish_id ?? '');
    return {
      id: publishId || null,
      url: null,
    };
  }

  // ------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------
  private async loadAccount(accountId: string): Promise<SocialAccount> {
    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      throw errorFactory({
        provider: null,
        status: 404,
        message: error ? `Error al cargar cuenta social: ${error.message}` : 'Cuenta social no encontrada',
      });
    }

    return {
      id: String(data.id),
      userId: String(data.user_id),
      provider: data.provider as ProviderId,
      username: String(data.username),
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : null,
      expiresAt: data.expires_at ? String(data.expires_at) : null,
      scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
      isValid: Boolean(data.is_valid),
    };
  }

  private async loadMediaItem(mediaItemId: string): Promise<MediaItemRow> {
    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .eq('id', mediaItemId)
      .single();

    if (error || !data) {
      throw errorFactory({
        provider: null,
        status: 404,
        message: error ? `Error al cargar media item: ${error.message}` : 'Media item no encontrado',
      });
    }

    return {
      id: String(data.id),
      url: String(data.url),
      thumbnail_url: data.thumbnail_url ? String(data.thumbnail_url) : null,
      type: String(data.type),
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
    };
  }
// ------------------------------------------------------------------
  // Actualización de estado de la publicación
  // ------------------------------------------------------------------
  private async setPublicationStatus(
    publicationId: string,
    status: 'pending' | 'processing' | 'published' | 'failed'
  ): Promise<void> {
    const { error } = await supabase
      .from('publications')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', publicationId);

    if (error) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al actualizar estado de publicación: ${error.message}`,
        body: error,
      });
    }
  }

  private async markPublished(publicationId: string): Promise<void> {
    const { error } = await supabase
      .from('publications')
      .update({
        status: 'published',
        updated_at: new Date().toISOString(),
      })
      .eq('id', publicationId);

    if (error) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al marcar publicación como publicada: ${error.message}`,
        body: error,
      });
    }
  }

  private async parseJson(res: Response): Promise<JsonResponse> {
    const text = await res.text();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? (parsed as JsonResponse) : {};
    } catch {
      return {};
    }
  }
}