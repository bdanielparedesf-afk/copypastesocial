import { createServerClient } from '@/lib/supabase';
import { getProvider } from '@/lib/providers/provider.factory';
import { assertCanPublish } from './rate-limit.service';
import { isDuplicate } from './idempotency';
import { releaseMediaStorage } from '@/lib/storage/cleanup';
import { AppError } from '@/utils/errors';
import { tokenService } from '@/services/TokenService';
import type { SocialAccount } from '@/types';

type CreatePubParams = {
  user_id: string;
  media_ids: string[];
  account_ids: string[];
  use_ai_captions?: Record<string, string> | null;
  /** Captions por media_id (manual/batch). Van en job payload. */
  captions?: Record<string, string> | null;
  /** Fecha futura → la publicación queda programada (publications.scheduled_at). */
  scheduled_at?: string | null;
};

interface UploadParams {
  access_token?: string | null;
  refresh_token?: string | null;
  account_id?: string | null;
  media_url?: string | null;
  title?: string | null;
  caption?: string | null;
}

interface UploadResult {
  external_id: string;
}

interface StatusResult {
  status: string;
}

interface PublicationProvider {
  upload: (params: UploadParams) => Promise<UploadResult>;
  getStatus: (externalId: string) => Promise<StatusResult>;
}

export async function createPublication({
  user_id,
  media_ids,
  account_ids,
  use_ai_captions,
  captions,
  scheduled_at,
}: CreatePubParams): Promise<{ publication_id: string; jobs: number; calc: string }> {
  // Service-role: el modo single-owner no tiene sesión y RLS bloquearía
  // el INSERT en publications/publication_jobs con el cliente anon.
  const supabase = createServerClient();

  // publications.source_id es NOT NULL: se toma del primer media.
  const { data: firstMedia, error: mediaErr } = await supabase
    .from('media_items')
    .select('source_id')
    .in('id', media_ids)
    .limit(1)
    .maybeSingle();
  if (mediaErr || !firstMedia?.source_id) {
    throw new Error(
      mediaErr?.message ?? 'No se encontró source_id para los media seleccionados'
    );
  }

  const { data: pub, error } = await supabase
    .from('publications')
    .insert({
      user_id,
      source_id: firstMedia.source_id,
      status: 'processing',
      ...(scheduled_at ? { scheduled_at } : {}),
    })
    .select()
    .single();
  if (error) throw error;

  let jobsCreated = 0;
  for (const media_id of media_ids) {
    for (const account_id of account_ids) {
      if (await isDuplicate(media_id, account_id)) continue;

      try {
        await assertCanPublish(account_id);
      } catch {
        continue;
      }

      const { data: account } = await supabase
        .from('social_accounts')
        .select('provider')
        .eq('id', account_id)
        .single();
      if (!account) continue;

      // Obtener source_provider del media_item
      const { data: mediaRow } = await supabase
        .from('media_items')
        .select('source_provider')
        .eq('id', media_id)
        .single();

      // NOTA: publication_jobs solo tiene las columnas base (publication_id,
      // media_id, social_account_id, type, status, attempts, payload,
      // external_id, created_at). provider/source_provider van en payload.
      const { error: jobError } = await supabase.from('publication_jobs').insert({
        publication_id: pub.id,
        media_id,
        social_account_id: account_id,
        type: 'publish',
        status: 'pending',
        attempts: 0,
        payload: {
          provider: account.provider,
          source_provider: mediaRow?.source_provider ?? 'imported',
          ...((use_ai_captions?.[media_id] ? { useAi: true } : {})),
          ...(captions?.[media_id] ? { caption: captions[media_id] } : {}),
        },
      });
      if (jobError) throw jobError;

      jobsCreated++;
    }
  }

  return {
    publication_id: pub.id,
    jobs: jobsCreated,
    calc: `${media_ids.length} x ${account_ids.length} = ${jobsCreated}`,
  };
}

export async function processJob(job_id: string): Promise<string> {
  // Service-role: el worker no tiene sesión de usuario y RLS bloquearía las
  // consultas con el cliente anon.
  const supabase = createServerClient();

  // Sin embeds: la BD remota no tiene FK publication_jobs -> media_items
  // (el embed de PostgREST falla con PGRST200), así que se resuelven los
  // relacionados con consultas separadas.
  const { data: job, error: jobError } = await supabase
    .from('publication_jobs')
    .select('*')
    .eq('id', job_id)
    .single();

  if (jobError || !job) throw new Error('JOB_NOT_FOUND');

  const { data: media } = job.media_id
    ? await supabase.from('media_items').select('*').eq('id', job.media_id).maybeSingle()
    : { data: null };
  const { data: account } = job.social_account_id
    ? await supabase.from('social_accounts').select('*').eq('id', job.social_account_id).maybeSingle()
    : { data: null };

  if (!media) throw new Error('JOB_NOT_FOUND');

  // La BD solo tiene las columnas base de publication_jobs:
  // provider/source_provider/error_message viven en payload. Un job sin
  // cuenta (destinos auto IG/FB/TT sin conectar) se procesa simulado para
  // no romper el resto de la cola.
  const jobPayload = { ...((job.payload as Record<string, unknown>) ?? {}) };
  const providerName = String(jobPayload.provider ?? 'instagram');
  const mediaRow = media as Record<string, unknown>;
  const useAi = jobPayload.useAi === true;
  const mediaId = media.id ? String(media.id) : null;

  /** Persiste el resultado final respetando el esquema real de la tabla. */
  const finishJob = async (
    status: 'completed' | 'failed',
    externalId: string | null,
    errorMessage: string | null
  ): Promise<void> => {
    if (errorMessage) jobPayload.error_message = errorMessage;
    else delete jobPayload.error_message;
    if (externalId) jobPayload.external_id = externalId;
    else delete jobPayload.external_id;
    await supabase
      .from('publication_jobs')
      .update({
        status,
        attempts: (job.attempts ?? 0) + 1,
        payload: jobPayload,
      })
      .eq('id', job_id);
  };

  try {
    // Estados permitidos por el CHECK de BD: pending | running | completed | failed
    await supabase.from('publication_jobs').update({ status: 'running' }).eq('id', job_id);

    const mock =
      process.env.MOCK_MODE === 'true' ||
      !account ||
      !(account as Record<string, unknown>).access_token;
    if (mock) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const externalId = `mock_${providerName}_${job_id.slice(0, 8)}`;
      await finishJob('completed', externalId, null);
      try {
        if (mediaId) await releaseMediaStorage(supabase, mediaId);
      } catch {
        // best-effort
      }
      return 'completed';
    }

    const provider = getProvider(providerName) as PublicationProvider;
    if (typeof provider.upload !== 'function') {
      throw new Error(`PROVIDER_SIN_UPLOAD: ${providerName}`);
    }

    // FASE 18: URL descargable para el provider. Preferimos la URL pública de
    // Storage (raw/processed) — no depende de BASE_URL ni de llamadas al
    // propio servidor. Los data URLs legacy van directo (undici los soporta).
    let mediaUrl =
      (mediaRow.processed_url as string | null) ||
      (mediaRow.raw_url as string | null) ||
      (mediaRow.source_url as string | null) ||
      (mediaRow.url as string | null) ||
      '';

    if (!mediaUrl && mediaId) {
      // Último recurso: endpoint de descarga del propio servidor
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      mediaUrl = `${baseUrl}/api/media/${mediaId}/download`;
    }

    const accRow = (account ?? null) as Record<string, unknown> | null;

    // Los tokens en BD están cifrados (AES-256-GCM): descifrar antes de usar.
    // Si expiró (< 60s de margen), refresca con TokenService (persiste nuevo
    // token cifrado) para que la publicación real no falle por sesión vencida.
    let accessToken = '';
    if (accRow?.access_token) {
      const rawToken = String(accRow.access_token);
      try {
        accessToken = tokenService.decrypt(rawToken);
      } catch {
        // Tokens guardados en claro (filas legacy/escrituras externas)
        accessToken = rawToken;
      }
    }
    const tokenExpiresAt = accRow?.expires_at ? String(accRow.expires_at) : null;
    const tokenExpired =
      !accessToken ||
      (tokenExpiresAt ? new Date(tokenExpiresAt).getTime() <= Date.now() + 60_000 : false);
    if (tokenExpired && accRow?.refresh_token) {
      const refreshed = await tokenService.refresh({
        id: String(accRow.id ?? ''),
        userId: String((job as Record<string, unknown>).user_id ?? ''),
        provider: providerName,
        username: String(accRow.username ?? ''),
        accessToken: String(accRow.access_token ?? ''),
        refreshToken: String(accRow.refresh_token ?? ''),
        expiresAt: tokenExpiresAt,
        scopes: [],
        isValid: true,
      } as SocialAccount);
      accessToken = refreshed.accessToken;
    }

    const mediaMetadata = (mediaRow.metadata as Record<string, unknown>) ?? {};
    const jobCaption = typeof jobPayload.caption === 'string' ? jobPayload.caption : null;
    const uploadRes = await provider.upload({
      access_token: accessToken || null,
      account_id: accRow?.id ? String(accRow.id) : null,
      media_url: mediaUrl,
      title: (jobCaption ?? (mediaMetadata.title as string) ?? null) as string | null,
      caption: jobCaption ?? (useAi ? ((mediaRow.ai_generated_caption as string | null) ?? null) : null),
    });

    const statusRes = await provider.getStatus(uploadRes.external_id);
    const finalStatus = statusRes.status === 'SUCCESS' ? 'completed' : 'failed';

    await finishJob(
      finalStatus,
      uploadRes.external_id,
      finalStatus === 'failed' ? 'El proveedor no confirmó la publicación' : null
    );

    // FASE 23 — pass-through: libera el fisico SOLO cuando ningun otro
    // job del media queda pendiente (conteo interno en releaseMediaStorage).
    if (finalStatus === 'completed' && mediaId) {
      try {
        await releaseMediaStorage(supabase, mediaId);
      } catch {
        // best-effort: no rompe el publish si el borrado falla.
      }
    }

    return finalStatus;
  } catch (e) {
    const attempts = (job.attempts ?? 0) + 1;
    const maxAttempts = 3;
    const errorMessage = e instanceof Error ? e.message : String(e);

    // FASE 18: Detección de cuota YouTube agotada (AppError del auditor o
    // mensaje "quotaExceeded" de la Data API en uploads reales)
    const isYoutubeQuota =
      (e instanceof AppError &&
        e.provider === 'youtube' &&
        e.code === 'API_RESTRICTED' &&
        e.statusCode === 403) ||
      (providerName === 'youtube' && /quota/i.test(errorMessage));

    let nextAttempt: string | null = null;
    let finalErrorMessage = errorMessage;

    if (isYoutubeQuota) {
      // Mañana ~00:05 America/Santiago (UTC-3 verano / UTC-4 invierno)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(3, 5, 0, 0);
      nextAttempt = tomorrow.toISOString();
      finalErrorMessage = 'Cuota YouTube llena (6/6) - continúa mañana';
    }

    // Sin estado 'retrying' en el CHECK de BD ni columnas error_message/
    // next_attempt: los reintentos vuelven a 'pending' y el detalle del
    // error + la próxima fecha viven dentro de payload.
    jobPayload.error_message = finalErrorMessage;
    if (nextAttempt) jobPayload.next_attempt = nextAttempt;

    const failed = attempts >= maxAttempts && !isYoutubeQuota;
    await supabase
      .from('publication_jobs')
      .update({
        status: failed ? 'failed' : 'pending',
        attempts,
        payload: jobPayload,
      })
      .eq('id', job_id);

    throw e;
  }
}
