import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/providers/provider.factory';
import { assertCanPublish } from './rate-limit.service';
import { isDuplicate } from './idempotency';
import { releaseMediaStorage } from '@/lib/storage/cleanup';
import { AppError } from '@/utils/errors';

type CreatePubParams = {
  user_id: string;
  media_ids: string[];
  account_ids: string[];
  use_ai_captions?: Record<string, string> | null;
};

interface UploadParams {
  access_token?: string | null;
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
}: CreatePubParams): Promise<{ publication_id: string; jobs: number; calc: string }> {
  const supabase = await createClient();

  const { data: pub, error } = await supabase
    .from('publications')
    .insert({ user_id, status: 'processing' })
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

      const { error: jobError } = await supabase.from('publication_jobs').insert({
        publication_id: pub.id,
        media_id,
        social_account_id: account_id,
        provider: account.provider,
        source_provider: mediaRow?.source_provider ?? 'imported',
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        payload: {
          ...((use_ai_captions?.[media_id] ? { useAi: true } : {})),
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
  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from('publication_jobs')
    .select('*, media_items(*), social_accounts(*)')
    .eq('id', job_id)
    .single();

  if (jobError || !job) throw new Error('JOB_NOT_FOUND');

  const media = Array.isArray(job.media_items) ? job.media_items[0] : job.media_items;
  const account = Array.isArray(job.social_accounts)
    ? job.social_accounts[0]
    : job.social_accounts;

  if (!media || !account) throw new Error('JOB_NOT_FOUND');

  try {
    await supabase.from('publication_jobs').update({ status: 'processing' }).eq('id', job_id);

    if (process.env.MOCK_MODE === 'true') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const externalId = `mock_${job.provider}_${job_id}`;
      await supabase
        .from('publication_jobs')
        .update({
          status: 'success',
          external_id: externalId,
          attempts: (job.attempts ?? 0) + 1,
          error_message: null,
        })
        .eq('id', job_id);
      try {
        const mid = (job.media_id as string | null) ?? null;
        if (mid) await releaseMediaStorage(supabase, String(mid));
      } catch {
        // best-effort
      }
      return 'success';
    }

    const provider = getProvider(job.provider) as PublicationProvider;

     await supabase.from('publication_jobs').update({ status: 'uploading' }).eq('id', job_id);

      const jobPayload = (job.payload as Record<string, unknown>) ?? {};
      const useAi = jobPayload.useAi === true;

      // FASE 18: Para archivos locales, usar endpoint de descarga en lugar de data URL
      let mediaUrl = media.source_url;
      if ((job.source_provider === 'local' || media.source_provider === 'local') && media.id) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');
        mediaUrl = `${baseUrl}/api/media/${media.id}/download`;
      }

      const uploadRes = await provider.upload({
        access_token: account.access_token_encrypted,
        media_url: mediaUrl,
        title: media.title,
        caption: useAi && media.ai_generated_caption ? media.ai_generated_caption : null,
      });

    await supabase
      .from('publication_jobs')
      .update({ status: 'publishing', external_id: uploadRes.external_id })
      .eq('id', job_id);

    const statusRes = await provider.getStatus(uploadRes.external_id);
    const finalStatus = statusRes.status === 'SUCCESS' ? 'success' : 'failed';

    await supabase
      .from('publication_jobs')
      .update({
        status: finalStatus,
        attempts: (job.attempts ?? 0) + 1,
      })
      .eq('id', job_id);

    // FASE 23 — pass-through: libera el fisico SOLO cuando ningun otro
    // job del media queda pendiente (conteo interno en releaseMediaStorage).
    if (finalStatus === 'success' && media.id) {
      try {
        await releaseMediaStorage(supabase, String(media.id));
      } catch {
        // best-effort: no rompe el publish si el borrado falla.
      }
    }

    return finalStatus;
  } catch (e) {
    const attempts = (job.attempts ?? 0) + 1;
    const maxAttempts = job.max_attempts ?? 3;
    const errorMessage = e instanceof Error ? e.message : String(e);

    // FASE 18: Detección de cuota YouTube agotada
    const isYoutubeQuota =
      e instanceof AppError &&
      e.provider === 'youtube' &&
      e.code === 'API_RESTRICTED' &&
      e.statusCode === 403;

    let nextAttempt: string | null = null;
    let finalErrorMessage = errorMessage;

    if (isYoutubeQuota) {
      // Calcular mañana a las 00:05 en America/Santiago
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 5, 0, 0);

      // Ajustar a zona horaria America/Santiago (UTC-4 o UTC-3 según DST)
      const santiagoOffset = -3; // UTC-3 (horario de verano) o -4 (invierno)
      const santiagoTime = new Date(tomorrow.getTime() + santiagoOffset * 60 * 60 * 1000);
      nextAttempt = santiagoTime.toISOString();

      finalErrorMessage = 'Cuota YouTube llena (6/6) - continúa mañana';
    }

    await supabase
      .from('publication_jobs')
      .update({
        status: attempts >= maxAttempts && !isYoutubeQuota ? 'failed' : 'retrying',
        error_message: finalErrorMessage,
        attempts,
        ...(nextAttempt && { next_attempt: nextAttempt }),
      })
      .eq('id', job_id);

    throw e;
  }
}
