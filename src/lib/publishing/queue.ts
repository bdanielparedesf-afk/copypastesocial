/**
 * FASE 10 — Cola de publicación (publish_queue).
 *
 * - enqueuePost({ user_id, social_account_id, media_id, caption, scheduled_at })
 *   → inserta en `publish_queue` (PENDING o SCHEDULED).
 * - processPost(queueId) → flujo completo: media READY → signed URL processed
 *   → createContainer → polling 5s hasta FINISHED → publishContainer → PUBLISHED.
 * - getQueue / cancelScheduled / retryFailed / getDueItems → soporte UI + cron.
 *
 * Estados: PENDING | SCHEDULED | PUBLISHING | PUBLISHED | FAILED.
 * Retry: FAILED → PENDING vía retryFailed (attempts suman hasta 3 en processPost).
 */
import { createServerClient } from '@/lib/supabase';
import { processJob } from './publication.service';
import { errorFactory } from '@/utils/errors';
import { checkCanPublish } from '@/lib/accounts';
import {
  getAccessToken,
  getSignedProcessedUrl,
  publishToInstagram,
  type PublishRequest,
} from './publisher';

export type QueueStatus = 'PENDING' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export interface EnqueuePostOptions {
  userId: string;
  socialAccountId: string;
  mediaId: string;
  caption?: string;
  scheduledAt?: string | null;
}

export interface QueueItem {
  id: string;
  user_id: string;
  social_account_id: string;
  media_id: string;
  caption: string;
  video_url: string | null;
  status: QueueStatus;
  scheduled_at: string | null;
  attempts: number;
  ig_media_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Intentos máximos de publicación (spec: retry 3 si container ERROR). */
export const MAX_PUBLISH_ATTEMPTS = 3;
/** Polling del estado del contenedor cada 5 segundos (ver publishToInstagram). */
export const CONTAINER_POLL_INTERVAL_MS = 5_000;
/** Timeout global del polling: 120s (24 ticks). */
export const CONTAINER_POLL_MAX_TICKS = 24;

/**
 * Encola un post (PENDING si no hay scheduled_at, SCHEDULED si lo hay).
 * FASE 11: verifica checkCanPublish (límite diario 25 + token válido +
 * no expira <=5 días); si falla → AppError 429 LIMIT_EXCEEDED.
 */
export async function enqueuePost(options: EnqueuePostOptions): Promise<QueueItem> {
  const admin = createServerClient();

  // FASE 11 — límite diario + token válido + expiración
  const canPublish = await checkCanPublish(options.socialAccountId);
  if (!canPublish) {
    throw errorFactory({
      provider: null,
      status: 429,
      message: 'FASE 11 LIMIT_EXCEEDED: límite diario de 25 publicaciones alcanzado o token a expirar (reconecta la cuenta)',
      code: 'RATE_LIMITED',
    });
  }

  const { data, error } = await admin
    .from('publish_queue')
    .insert({
      user_id: options.userId,
      social_account_id: options.socialAccountId,
      media_id: options.mediaId,
      caption: (options.caption ?? '').trim().slice(0, 2200),
      status: options.scheduledAt ? 'SCHEDULED' : 'PENDING',
      scheduled_at: options.scheduledAt ?? null,
      attempts: 0,
      ig_media_id: null,
      error: null,
    })
    .select()
    .single();

  if (error || !data) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `enqueuePost: ${error?.message ?? 'sin datos'}`,
      body: error,
    });
  }

  return data as QueueItem;
}

/**
 * Lista la cola del usuario (opcional filtro por estado).
 */
export async function getQueue(
  userId: string,
  filter: { status?: QueueStatus; limit?: number } = {}
): Promise<QueueItem[]> {
  const admin = createServerClient();
  let query = admin
    .from('publish_queue')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filter.status) query = query.eq('status', filter.status);
  if (filter.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `getQueue: ${error.message}`,
      body: error,
    });
  }
  return (data ?? []) as QueueItem[];
}

/**
 * Items vencidos listos para publicar:
 *   PENDING (publish ya) o SCHEDULED con scheduled_at <= now().
 */
export async function getDueItems(
  options: { limit?: number } = {}
): Promise<QueueItem[]> {
  const admin = createServerClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('publish_queue')
    .select('*')
    .in('status', ['PENDING', 'SCHEDULED'])
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(options.limit ?? 10);

  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `getDueItems: ${error.message}`,
      body: error,
    });
  }
  return (data ?? []) as QueueItem[];
}

/**
 * Cancela un item programado (SCHEDULED/PENDING) → FAILED con
 * error='canceled_by_user' (idempotente).
 */
export async function cancelScheduled(queueId: string, userId: string): Promise<boolean> {
  const admin = createServerClient();

  const { data, error } = await admin
    .from('publish_queue')
    .update({ status: 'FAILED', error: 'canceled_by_user', updated_at: new Date().toISOString() })
    .eq('id', queueId)
    .eq('user_id', userId)
    .in('status', ['PENDING', 'SCHEDULED'])
    .select('id')
    .single();

  if (error) return false;
  return Boolean(data?.id);
}

/**
 * Marca items FAILED como PENDING para reintentar (resetea attempts).
 */
export async function retryFailed(
  userId: string,
  queueIds?: string[]
): Promise<number> {
  const admin = createServerClient();
  let query = admin
    .from('publish_queue')
    .update({
      status: 'PENDING',
      error: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'FAILED');

  if (queueIds && queueIds.length > 0) query = query.in('id', queueIds);

  const { data, error } = await query.select('id');
  if (error) {
    throw errorFactory({
      provider: null,
      status: 500,
      message: `retryFailed: ${error.message}`,
      body: error,
    });
  }
  return data?.length ?? 0;
}
/**
 * Procesa un item completo: valida media READY → signed URL processed →
 * createContainer → polling 5s hasta FINISHED → publishContainer → PUBLISHED.
 * - Sin token real → MOCK (marca PUBLISHED con ig_media_id mock_*).
 * - Error → FAILED con error (attempts suma; retry 3 vía retryFailed).
 */
export async function processPost(queueId: string): Promise<QueueItem> {
  const admin = createServerClient();

  await admin
    .from('publish_queue')
    .update({ status: 'PUBLISHING', updated_at: new Date().toISOString() })
    .eq('id', queueId);

  const { data: item, error: itemError } = await admin
    .from('publish_queue')
    .select('*')
    .eq('id', queueId)
    .single();

  if (itemError || !item) {
    throw errorFactory({
      provider: null,
      status: 404,
      message: `processPost: item no encontrado (${queueId})`,
      body: itemError,
    });
  }

  try {
    // 1) media_item debe estar READY (procesado en Fase 8)
    const { data: media, error: mediaError } = await admin
      .from('media_items')
      .select('*')
      .eq('id', item.media_id)
      .single();

    if (mediaError || !media) {
      throw errorFactory({
        provider: null,
        status: 404,
        message: `processPost: media_item no encontrado (${item.media_id})`,
        body: mediaError,
      });
    }

    if ((media.status ?? 'PENDING') !== 'READY') {
      throw errorFactory({
        provider: null,
        status: 400,
        message: `media ${item.media_id} no está READY (status=${media.status ?? 'PENDING'})`,
      });
    }

    // 2) URL firmada SIEMPRE del bucket processed
    const videoUrl = await getSignedProcessedUrl(media);

    // 3) Token real de provider_tokens; si no hay → MOCK
    const tokenInfo = await getAccessToken(item.social_account_id);

    // 4) Publicar (real o mock según haya token)
    const request: PublishRequest = {
      videoUrl,
      caption: item.caption ?? '',
      accessToken: tokenInfo?.accessToken ?? `mock_${Date.now()}`,
      userId: tokenInfo?.igUserId ?? item.social_account_id,
    };

    const result = await publishToInstagram(request);

    const { data: updated, error: updateError } = await admin
      .from('publish_queue')
      .update({
        status: 'PUBLISHED',
        ig_media_id: result.mediaId,
        attempts: item.attempts + 1,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId)
      .select()
      .single();

    if (updateError || !updated) {
      throw errorFactory({
        provider: 'instagram',
        status: 500,
        message: `processPost: no se pudo marcar PUBLISHED (${updateError?.message ?? 'sin datos'})`,
        body: updateError,
      });
    }

    return updated as QueueItem;
  } catch (err) {
    // Marcar FAILED tras el error (no rompe el flujo)
    await admin
      .from('publish_queue')
      .update({
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
        attempts: item.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueId);

    throw err;
  }
}

/**
 * FASE 18 — Procesa todos los publication_jobs en PENDING.
 *
 * Estados segun migration base (minúsculas):
 *   pending -> running -> completed | failed
 *
 * processJob() (publication.service.ts) ya marca PROCESSING antes de
 * ejecutar y SUCCESS/FAILED al finalizar, por lo que este trigger solo
 * necesita disparar la cola.
 *
 * Devuelve la cantidad de jobs encontrados en PENDING (0 si no hay).
 */
export async function processQueue(): Promise<number> {
  const admin = createServerClient();
  const now = new Date().toISOString();

  // FASE 19: Auto-retry — cambiar jobs RETRYING con next_attempt <= now() a PENDING
  const { error: retryUpdateError } = await admin
    .from('publication_jobs')
    .update({ status: 'pending' })
    .eq('status', 'retrying')
    .not('next_attempt', 'is', null)
    .lte('next_attempt', now);

  if (retryUpdateError) throw retryUpdateError;

  // FASE 18: Buscar jobs PENDING (incluye los recién promovidos de RETRYING)
  // FASE 20: Rate limit — máx 100 jobs por ejecución cron
  const { data: pendingData, error: pendingError } = await admin
    .from('publication_jobs')
    .select('id')
    .eq('status', 'pending')
    .limit(100);

  if (pendingError) throw pendingError;

  const allJobs = pendingData ?? [];

  let processed = 0;
  for (const job of allJobs) {
    try {
      await processJob(job.id);
      processed += 1;
    } catch {
      // Independencia plataformas: si un job falla, los demás continúan.
      // processJob ya marca el job como FAILED internamente.
    }
  }

  return processed;
}
