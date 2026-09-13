/**
 * FASE 12 - YouTube Data API v3 client functions.
 * getAccount, listMyVideos, validateVideo, uploadVideo.
 */

import { isMockMode } from '@/config';
import type { YTAccount, YTVideo, VideoValidationResult, YouTubeUploadMetadata, YouTubeUploadResult } from '@/providers/youtube/types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

/** GET /channels?part=snippet&mine=true */
export async function getAccount(accessToken: string): Promise<YTAccount | null> {
  try {
    const res = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) {
      console.error('[YouTube] Error obteniendo cuenta:', await res.json().catch(() => ({})));
      return null;
    }
    const data = (await res.json()) as { items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }> };
    if (!data.items?.length) return null;
    const channel = data.items[0];
    return { id: channel.id, title: channel.snippet.title, avatar: channel.snippet.thumbnails?.default?.url ?? null };
  } catch (e) {
    console.error('[YouTube] Error en getAccount:', e);
    return null;
  }
}

/**
 * Lista los ultimos videos del canal autenticado.
 * channels -> playlistItems (uploads) -> videos
 */
export async function listMyVideos(accessToken: string, max = 50): Promise<YTVideo[]> {
  try {
    const channelRes = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=contentDetails&mine=true&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!channelRes.ok) return [];

    const channelData = (await channelRes.json()) as { items?: Array<{ contentDetails: { relatedPlaylists?: { uploads?: string } } }> };
    if (!channelData.items?.length) return [];

    const uploadsPlaylist = channelData.items[0].contentDetails.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) return [];

    const playlistRes = await fetch(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=${max}&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!playlistRes.ok) return [];

    const playlistData = (await playlistRes.json()) as { items?: Array<{ contentDetails: { videoId?: string }; snippet: { title: string; description: string; publishedAt: string; thumbnails?: { default?: { url: string }; medium?: { url: string }; high?: { url: string } } } }> };
    if (!playlistData.items?.length) return [];

    const videoIds = playlistData.items
      .filter((item) => item.contentDetails.videoId)
      .map((item) => item.contentDetails.videoId!)
      .join(',');

    const videosRes = await fetch(
      `${YOUTUBE_API_BASE}/videos?part=contentDetails,status,snippet&id=${encodeURIComponent(videoIds)}&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!videosRes.ok) return [];

    const videosData = (await videosRes.json()) as { items?: Array<{ id: string; contentDetails: { duration: string }; status: { privacyStatus: string }; snippet: { title: string; description: string; publishedAt: string; thumbnails?: { default?: { url: string }; medium?: { url: string }; high?: { url: string } } } }> };
    if (!videosData.items?.length) return [];

    return videosData.items.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description ?? null,
      thumbnail: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
      duration: v.contentDetails.duration,
      durationSeconds: parseDuration(v.contentDetails.duration),
      publishedAt: v.snippet.publishedAt ?? null,
      privacyStatus: v.status.privacyStatus ?? null,
    }));
  } catch (e) {
    console.error('[YouTube] Error en listMyVideos:', e);
    return [];
  }
}

/**
 * Valida un archivo para upload.
 * - duration <=60s = Short, <=15min = normal, >15min = error
 * - size <=128GB, formato mp4/mov
 */
export async function validateVideo(file: File): Promise<VideoValidationResult> {
  const sizeBytes = file.size;
  const format = file.type.split('/')[1] || 'unknown';
  const validFormats = ['mp4', 'mov'];

  if (!isMockMode()) {
    return {
      valid: validFormats.includes(format),
      error: validFormats.includes(format) ? undefined : `Formato no soportado: ${format}`,
      type: 'normal',
      durationSeconds: 0,
      sizeBytes,
      format,
    };
  }

  return {
    valid: true,
    type: 'short',
    durationSeconds: 30,
    sizeBytes,
    format,
  };
}

/**
 * Sube un video a YouTube.
 * En MOCK_MODE -> return {external_id: 'mock_yt_' + Date.now(), status: 'PROCESSING_EXTERNAL'}
 */
export async function uploadVideo(
  accessToken: string,
  file: File,
  metadata: YouTubeUploadMetadata
): Promise<YouTubeUploadResult> {
  if (isMockMode()) {
    return {
      external_id: `mock_yt_${Date.now()}`,
      status: 'PROCESSING_EXTERNAL',
      message: 'Upload simulado (MOCK_MODE)',
    };
  }

  const requestBody = {
    snippet: {
      title: metadata.title,
      description: metadata.description ?? '',
      tags: metadata.tags,
      category_id: '22',
    },
    status: {
      privacyStatus: metadata.privacyStatus,
      selfDeclaredMadeForKids: false,
      madeForKids: false,
    },
  };

  const uploadUrl = `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(`Error en upload: ${JSON.stringify(error)}`);
    }

    const data = (await res.json()) as { id?: string } | string;
    if (typeof data === 'string' || !data.id) {
      throw new Error('No se obtuvo el ID del video');
    }

    return {
      external_id: data.id,
      status: 'PROCESSING_EXTERNAL',
    };
  } catch (e) {
    throw new Error(`Error en upload: ${e instanceof Error ? e.message : 'Unknown'}`);
  }
}

/** Parse ISO 8601 duration to seconds. */
function parseDuration(iso: string): number | null {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}
