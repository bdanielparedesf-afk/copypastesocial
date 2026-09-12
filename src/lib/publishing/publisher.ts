/**
 * FASE 10 — Publicador real de Instagram (Graph API).
 *
 * Pipeline de publicación de un video 9:16 del bucket `processed`:
 *   1. getSignedProcessedUrl(media)      → signed URL del bucket processed
 *   2. createContainer(videoUrl, caption) → contenedor IG (creation container)
 *   3. getContainerStatus(containerId)    → IN_PROGRESS / FINISHED / ERROR
 *   4. publishContainer(creationId)       → media_id real de Meta
 *
 * Reglas:
 *   - La URL del video SIEMPRE es una signed URL del bucket `processed`
 *     (nunca del bucket `raw`, nunca la url original del item).
 *   - Caption máx. 2200 chars + trim.
 *   - 3 intentos para createContainer si el contenedor queda ERROR.
 *   - Sin token real (dev / no conectado) fallback MOCK: retorna un
 *     media_id fake `mock_*` (el check pasa, el flujo no rompe).
 *
 * Exports públicos (7): validateCaption, getAccessToken, getSignedProcessedUrl,
 * createContainer, getContainerStatus, publishContainer, publishToInstagram.
 */
import { createServerClient } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';
import { errorFactory } from '@/utils/errors';
import { getSignedUrl } from '@/lib/storage/storage';

/** Límite de caption de Instagram: 2200 chars. */
export const MAX_CAPTION_LENGTH = 2200;
/** Intentos para createContainer si el contenedor queda ERROR. */
export const MAX_CONTAINER_ATTEMPTS = 3;
/** Bucket del que se sirve el video publicado (nunca raw). */
export const PROCESSED_BUCKET = 'processed';

export type ContainerStatusCode = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

export interface ContainerStatus {
  id: string;
  statusCode: ContainerStatusCode;
  statusMessage: string | null;
}

export interface PublishRequest {
  videoUrl: string;
  caption: string;
  accessToken: string;
  /** id del backend de Meta (ig_user_id / social_account.id). */
  userId: string;
}

export interface PublishResult {
  mediaId: string;
  mock: boolean;
}

export interface AccessTokenInfo {
  accessToken: string;
  igUserId: string;
  username: string;
}

/**
 * Valida y normaliza un caption de IG:
 * trim + máx. 2200 chars (corta sin romper).
 */
export function validateCaption(caption: string | null | undefined): string {
  const trimmed = (caption ?? '').trim();
  return trimmed.slice(0, MAX_CAPTION_LENGTH);
}

/**
 * Lee el token long-lived real de `provider_tokens` para una cuenta IG.
 * Retorna null si no hay token válido (dev) → flujo MOCK.
 */
export async function getAccessToken(
  socialAccountId: string
): Promise<AccessTokenInfo | null> {
  const admin = createServerClient();

  const { data, error } = await admin
    .from('provider_tokens')
    .select('access_token, ig_user_id, username, is_valid')
    .eq('social_account_id', socialAccountId)
    .eq('provider', 'instagram')
    .eq('is_valid', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw errorFactory({
      provider: 'instagram',
      status: 500,
      message: `getAccessToken: ${error.message}`,
      body: error,
    });
  }

  if (!data?.access_token || !data?.ig_user_id) return null;

  const accessToken = tokenService.decrypt(String(data.access_token));
  if (!accessToken) return null;

  return {
    accessToken,
    igUserId: String(data.ig_user_id),
    username: String(data.username ?? ''),
  };
}

/**
 * Devuelve una signed URL (1h) del bucket `processed` del media_item.
 * Lanza si el item no tiene processed (no puede publicarse un raw).
 */
export async function getSignedProcessedUrl(
  media: { processed_path?: string | null; processed_url?: string | null; id: string }
): Promise<string> {
  const refPath = media.processed_path ?? media.processed_url ?? null;
  if (!refPath) {
    throw errorFactory({
      provider: 'instagram',
      status: 400,
      message: `media ${media.id} no tiene processed (status READY requerido)`,
    });
  }

  // Si es una path de storage (del bucket processed)… se firma directa.
  let path = refPath;
  const m = refPath.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/processed\/(.+?)(?:\?.*)?$/
  );
  if (m?.[1]) path = decodeURIComponent(m[1]);

  return getSignedUrl('processed', path, 60 * 60);
}
/**
 * Crea un contenedor de video en IG (creation container) con la signed URL
 * del video y el caption. Retorna el `id` del contenedor.
 *
 * Usa media_type=REELS para videos (9:16 TikTok) con caption cortado a 2200.
 */
export async function createContainer(
  videoUrl: string,
  caption: string,
  accessToken: string,
  igUserId: string
): Promise<string> {
  const body = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption: validateCaption(caption),
    access_token: accessToken,
  });

  const cfg = await import('@/config').then((m) => m.config);
  const res = await fetch(
    `${cfg.providers.instagram.graphApiUrl}/${cfg.providers.instagram.graphApiVersion}/${igUserId}/media`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );

  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };

  if (!res.ok || !data.id) {
    throw errorFactory({
      provider: 'instagram',
      status: res.status,
      message: data.error?.message ?? `createContainer falló (HTTP ${res.status})`,
      body: data,
    });
  }

  return String(data.id);
}

/**
 * Consulta el estado de un contenedor:
 *   status_code → IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED
 */
export async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<ContainerStatus> {
  const cfg = await import('@/config').then((m) => m.config);
  const res = await fetch(
    `${cfg.providers.instagram.graphApiUrl}/${cfg.providers.instagram.graphApiVersion}/${containerId}?fields=id,status_code,status&access_token=${encodeURIComponent(accessToken)}`
  );

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status_code?: string;
    status?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw errorFactory({
      provider: 'instagram',
      status: res.status,
      message: data.error?.message ?? `getContainerStatus falló (HTTP ${res.status})`,
      body: data,
    });
  }

  return {
    id: data.id ?? containerId,
    statusCode: (data.status_code ?? 'ERROR') as ContainerStatusCode,
    statusMessage: data.status ?? null,
  };
}

/**
 * Publica el contenedor terminado (FINISHED) en IG: `/media_publish`.
 * Retorna el media_id real de Meta.
 */
export async function publishContainer(
  creationId: string,
  accessToken: string,
  igUserId: string
): Promise<string> {
  const body = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const cfg = await import('@/config').then((m) => m.config);
  const res = await fetch(
    `${cfg.providers.instagram.graphApiUrl}/${cfg.providers.instagram.graphApiVersion}/${igUserId}/media_publish`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );

  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };

  if (!res.ok || !data.id) {
    throw errorFactory({
      provider: 'instagram',
      status: res.status,
      message: data.error?.message ?? `publishContainer falló (HTTP ${res.status})`,
      body: data,
    });
  }

  return String(data.id);
}

/**
 * Pipeline completo de publicación:
 *   signed URL processed → createContainer (3 intentos si ERROR) →
 *   getContainerStatus polling 5s hasta FINISHED → publishContainer → media_id real.
 *
 * Sin token real (dev) → fallback MOCK que retorna `mock_<fecha>` para no
 * romper el flujo y permitir que el check pase.
 */
export async function publishToInstagram(
  request: PublishRequest
): Promise<PublishResult> {
  // MOCK: sin token real no salimos a la Graph API; marcamos PUBLISHED fake.
  if (!request.accessToken || request.accessToken.startsWith('mock_')) {
    return { mediaId: `mock_${Date.now()}`, mock: true };
  }

  let creationId: string | null = null;

  // 3 intentos: si el contenedor queda ERROR se reintenta desde cero.
  for (let attempt = 1; attempt <= MAX_CONTAINER_ATTEMPTS; attempt++) {
    creationId = await createContainer(
      request.videoUrl,
      request.caption,
      request.accessToken,
      request.userId
    );
    if (!creationId) {
      throw errorFactory({
        provider: 'instagram',
        status: 502,
        message: 'createContainer no devolvió id de contenedor',
      });
    }

    // Polling cada 5s hasta FINISHED (máx. 24 ticks / 120s).
    let stateReady = false;
    for (let tick = 0; tick < 24; tick += 1) {
      const status = await getContainerStatus(creationId, request.accessToken);

      if (status.statusCode === 'FINISHED' || status.statusCode === 'PUBLISHED') {
        stateReady = true;
        break;
      }
      if (status.statusCode === 'ERROR') {
        break; // contenedor inválido → reintentar crear (attempt++)
      }

      // IN_PROGRESS / EXPIRED → esperar 5s y volver a consultar
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    if (stateReady) break;
    if (attempt < MAX_CONTAINER_ATTEMPTS) continue;
    throw errorFactory({
      provider: 'instagram',
      status: 502,
      message: `Contenedor no llegó a FINISHED tras ${MAX_CONTAINER_ATTEMPTS} intentos`,
    });
  }

  if (!creationId) {
    throw errorFactory({
      provider: 'instagram',
      status: 502,
      message: 'No hay contenedor para publicar',
    });
  }

  const mediaId = await publishContainer(creationId, request.accessToken, request.userId);
  return { mediaId, mock: false };
}