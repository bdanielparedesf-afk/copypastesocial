'use client';

/**
 * FASE 12 - SourceProvider para YouTube.
 * Implementa detección, importación y publicación a YouTube vía API oficial.
 */

import { SourceProvider, SourceAccessibility, MediaItem } from '@/providers/interface';
import { config } from '@/config';
import type { YTAccount, YTVideo } from '@/providers/youtube/types';
import { encryptToken, decryptToken, refreshYouTubeToken } from '@/providers/youtube/oauth';
import type { SocialAccount } from '@/types';

export interface YouTubeSourceParams {
  source_id?: string;
  account_id?: string;
}

export interface ImportResult {
  count: number;
  items: MediaItem[];
}

export interface PublishResult {
  status: 'UPLOADING' | 'SUCCESS' | 'ERROR';
  externalId?: string;
  message?: string;
}

export class YouTubeSourceProvider implements SourceProvider {
  readonly name = 'youtube' as const;

  detect(url: string): { provider: 'youtube'; url: string } | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        return { provider: 'youtube', url: u.toString() };
      }
      return null;
    } catch {
      return null;
    }
  }

  canHandle(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
    } catch {
      return false;
    }
  }

  async checkAccessibility(url: string): Promise<SourceAccessibility> {
    return this.checkAccess(url);
  }

  async checkAccess(url: string): Promise<SourceAccessibility> {
    if (!this.canHandle(url)) return 'UNSUPPORTED';
    const videoId = this.extractVideoId(url);
    if (videoId) {
      if (!config.providers.youtube.apiKey) return 'API_RESTRICTED';
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&key=${config.providers.youtube.apiKey}&part=status`
        );
        const data = (await res.json()) as { items?: Array<{ status: { privacyStatus?: string } }> };
        if (!data.items?.length) return 'UNAVAILABLE';
        const privacy = data.items[0].status.privacyStatus;
        if (privacy === 'private') return 'PRIVATE';
        return 'ACCESSIBLE';
      } catch {
        return 'ERROR';
      }
    }
    return 'AUTH_REQUIRED';
  }

  async fetchMetadata(url: string): Promise<MediaItem[]> {
    const videoId = this.extractVideoId(url);
    if (!videoId || !config.providers.youtube.apiKey) return [];
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&key=${config.providers.youtube.apiKey}&part=snippet,contentDetails,status`
      );
      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          snippet: { title: string; description: string; publishedAt: string; thumbnails?: { default?: { url: string }; medium?: { url: string }; high?: { url: string } } };
          contentDetails: { duration: string };
          status: { privacyStatus: string };
        }>;
      };
      if (!data.items?.length) return [];
      const v = data.items[0];
      return [{
        externalId: v.id,
        url,
        title: v.snippet.title,
        thumbnailUrl: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        type: 'video' as const,
        duration: this.parseDuration(v.contentDetails.duration),
        width: null, height: null,
        publishedAt: v.snippet.publishedAt ?? null,
        metadata: { videoId: v.id, privacyStatus: v.status.privacyStatus },
      }];
    } catch {
      return [];
    }
  }

  /** importMedia: lista videos del canal autenticado. */
  async importMedia(_source: string, userId: string): Promise<ImportResult> {
    const account = await this.getUserYouTubeAccount(userId);
    if (!account) {
      throw new Error('No tienes una cuenta de YouTube conectada y válida');
    }
    const accessToken = decryptToken((account as unknown as { access_token_encrypted?: string }).access_token_encrypted ?? '');
    const { listMyVideos } = await import('@/providers/youtube/client');
    const videos = await listMyVideos(accessToken);
    const items: MediaItem[] = videos.map((v: YTVideo) => ({
      externalId: v.id,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
      thumbnailUrl: v.thumbnail ?? null,
      type: 'video' as const,
      duration: v.durationSeconds,
      width: null, height: null,
      publishedAt: v.publishedAt ?? null,
      metadata: { videoId: v.id, description: v.description },
    }));
    return { count: items.length, items };
  }

  /** publish: sube video. Short si duration <=60s. */
  async publish(mediaItem: MediaItem, socialAccount: SocialAccount): Promise<PublishResult> {
    const accessToken = decryptToken((socialAccount as unknown as { access_token_encrypted?: string }).access_token_encrypted ?? '');
    const refreshToken = (socialAccount as unknown as { refresh_token_encrypted?: string }).refresh_token_encrypted
      ? decryptToken((socialAccount as unknown as { refresh_token_encrypted?: string }).refresh_token_encrypted ?? '')
      : null;
    if (this.isTokenExpiringSoon(socialAccount) && refreshToken) {
      const refreshed = await refreshYouTubeToken(refreshToken, accessToken);
      try {
        const { updateProviderAccountTokens } = await import('@/lib/accounts/manager');
        await updateProviderAccountTokens(socialAccount.id, {
          access_token_encrypted: encryptToken(refreshed.access_token),
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
      } catch {}
    }
    const { uploadVideo } = await import('@/providers/youtube/client');
    const duration = mediaItem.duration ?? 0;
    const metadata = {
      title: duration <= 60 ? `${mediaItem.title ?? 'Video'} #Shorts` : (mediaItem.title ?? 'Video'),
      description: (mediaItem.metadata?.description as string) ?? null,
      tags: [],
      privacyStatus: 'public' as const,
      isShort: duration <= 60,
    };
    const result = await uploadVideo(accessToken, mediaItem as unknown as File, metadata);
    return { status: 'UPLOADING', externalId: result.external_id, message: result.status };
  }

  /** getStatus: verifica estado del upload. */
  async getStatus(externalId: string, accessToken: string): Promise<'PROCESSING' | 'SUCCESS' | 'ERROR'> {
    if (externalId.startsWith('mock_')) return 'SUCCESS';
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(externalId)}&access_token=${accessToken}`
      );
      const data = (await res.json()) as { items?: Array<{ status: { uploadStatus?: string } }> };
      if (!data.items?.length) return 'ERROR';
      const uploadStatus = data.items[0].status.uploadStatus;
      if (uploadStatus === 'processed') return 'SUCCESS';
      if (uploadStatus === 'processing' || uploadStatus === 'pending') return 'PROCESSING';
      return 'ERROR';
    } catch {
      return 'ERROR';
    }
  }

  getAccount(accessToken: string): Promise<YTAccount | null> {
    return this._getAccount(accessToken);
  }

  /** Extrae videoId de URL. */
  private extractVideoId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) return u.pathname.split('/')[1] || null;
      if (u.hostname.includes('youtube.com')) {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
        if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Parse ISO 8601 duration to seconds. */
  private parseDuration(iso: string): number | null {
    if (!iso) return null;
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    const h = parseInt(match[1] || '0', 10);
    const m = parseInt(match[2] || '0', 10);
    const s = parseInt(match[3] || '0', 10);
    return h * 3600 + m * 60 + s;
  }

  private async _getAccount(accessToken: string): Promise<YTAccount | null> {
    const { getAccount } = await import('@/providers/youtube/client');
    return getAccount(accessToken);
  }

  private async getUserYouTubeAccount(userId: string): Promise<SocialAccount | null> {
    try {
      const { getSocialAccountById } = await import('@/lib/accounts/manager');
      const account = await getSocialAccountById(userId, 'youtube');
      if (account && account.is_valid && account.token_is_valid) {
      return account as unknown as SocialAccount;
      }
      return null;
    } catch {
      return null;
    }
  }

  private isTokenExpiringSoon(account: SocialAccount): boolean {
    const expiresAt = (account as unknown as { expires_at?: string }).expires_at ?? account.expiresAt;
    if (!expiresAt) return true;
    const exp = new Date(expiresAt);
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    return exp <= fiveDaysFromNow;
  }
}

export const youtubeProvider = new YouTubeSourceProvider();
