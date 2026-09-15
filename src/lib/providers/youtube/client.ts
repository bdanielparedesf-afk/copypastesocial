import { errorFactory } from '@/utils/errors';
import { refreshToken as refreshGoogleToken } from './auth';
import { createServerClient } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

/** Mapea un error HTTP de Google a AppError (cuota 403 → API_RESTRICTED). */
function throwGoogleError(status: number, body: unknown): never {
  const b = body as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null;
  const reason = b?.error?.errors?.[0]?.reason ?? '';
  const message = b?.error?.message ?? `YouTube API respondió HTTP ${status}`;

  if (status === 403 && /quota/i.test(reason)) {
    throw errorFactory({
      provider: 'youtube',
      status: 403,
      code: 'API_RESTRICTED',
      message: 'Cuota diaria de YouTube agotada (se reintentará mañana)',
      body: b,
    });
  }
  if (status === 401) {
    throw errorFactory({ provider: 'youtube', status: 401, code: 'AUTH_REQUIRED', message, body: b });
  }
  throw errorFactory({ provider: 'youtube', status, message, body: b });
}

/** Init del upload resumable (paso 1). Devuelve la Response cruda. */
async function initResumable(token: string, p: YouTubeUploadParams): Promise<Response> {
  const metadata = {
    snippet: {
      title: (p.title || 'Video').slice(0, 100),
      description: (p.caption || p.title || '').slice(0, 5000),
      categoryId: '22',
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    },
  };

  return fetch(`${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(metadata),
  });
}

export interface YouTubeAccount {
  provider_account_id: string;
  username: string;
  avatar_url: string | null;
}

export async function getAccount(access_token: string) {
  const res = await fetch(`${API_BASE}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error('NO_CHANNEL');
  return { provider_account_id: ch.id, username: ch.snippet.title, avatar_url: ch.snippet.thumbnails.default.url };
}

export interface YouTubeUploadParams {
  access_token: string | null;
  refresh_token?: string | null;
  account_id?: string | null;
  media_url: string | null;
  title?: string | null;
  caption?: string | null;
}

/**
 * Sube el video REAL a YouTube con upload resumable:
 *   1) init → Location (session URL)
 *   2) GET media_url (data URL / endpoint de descarga)
 *   3) PUT bytes a la session URL → 200 con { id }
 * Si el access_token expiró y hay refresh_token, refresca, persiste y reintenta.
 */
export async function upload(p: YouTubeUploadParams) {
  if (process.env.MOCK_MODE === 'true') return { external_id: `mock_yt_${Date.now()}` };
  if (!p.access_token) {
    throw errorFactory({
      provider: 'youtube',
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'La cuenta no tiene access_token (reconecta la cuenta de YouTube)',
    });
  }
  if (!p.media_url) {
    throw errorFactory({
      provider: 'youtube',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'El media_item no tiene URL descargable',
    });
  }

  let token = p.access_token;
  let res = await initResumable(token, p);

  // Token expirado → refresh + persistir + reintentar una vez
  if (res.status === 401 && p.refresh_token && p.account_id) {
    try {
      const refreshed = await refreshGoogleToken(p.refresh_token);
      token = refreshed.access_token;
      const admin = createServerClient();
      await admin
        .from('social_accounts')
        .update({
          // Los tokens se guardan SIEMPRE cifrados (AES-256-GCM)
          access_token: tokenService.encrypt(token),
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('id', p.account_id);
      res = await initResumable(token, p);
    } catch {
      // Se maneja con el error original del primer intento
    }
  }

  if (!res.ok) {
    throwGoogleError(res.status, await res.json().catch(() => ({})));
  }

  const sessionUrl = res.headers.get('location');
  if (!sessionUrl) {
    throw errorFactory({
      provider: 'youtube',
      status: 500,
      code: 'INVALID_RESPONSE',
      message: 'YouTube no devolvió la URL de sesión del upload resumable',
    });
  }

  // Descargar los bytes del video (data URL local o endpoint público)
  const mediaRes = await fetch(p.media_url);
  if (!mediaRes.ok) {
    throw errorFactory({
      provider: 'youtube',
      status: 502,
      code: 'UNAVAILABLE',
      message: `No se pudo descargar el video (HTTP ${mediaRes.status}) para subirlo a YouTube`,
    });
  }
  const bytes = new Uint8Array(await mediaRes.arrayBuffer());

  const put = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(bytes.length),
      'Content-Type': 'video/mp4',
    },
    body: bytes,
  });

  const putBody = await put.json().catch(() => ({}));
  if (!put.ok) {
    throwGoogleError(put.status, putBody);
  }

  const videoId = (putBody as { id?: string }).id;
  if (!videoId) {
    throw errorFactory({
      provider: 'youtube',
      status: 500,
      code: 'INVALID_RESPONSE',
      message: 'YouTube no devolvió el ID del video subido',
    });
  }

  return { external_id: String(videoId) };
}

export const publish = upload;

export async function getStatus(id: string) { return { status: 'SUCCESS', external_id: id }; }

export async function validateToken() { return true; }

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
}
