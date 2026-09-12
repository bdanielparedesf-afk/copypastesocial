import { supabase } from '@/lib/supabase';
import { errorFactory } from '@/utils/errors';
import type { DownloadWorker, DownloadPayload } from './download';
import type { TranscodeWorker, TranscodePayload } from './transcode';
import type { PublishWorker, PublishPayload } from './publish';

export abstract class BaseWorker {
  abstract readonly name: string;
  abstract run(payload: unknown): Promise<unknown>;
}

export interface WorkerMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

export interface WorkerResponse<T = unknown> {
  id: string;
  type: string;
  payload: T;
  error?: string;
}

interface WorkerCache {
  download: DownloadWorker | null;
  transcode: TranscodeWorker | null;
  publish: PublishWorker | null;
}

export class JobQueue {
  private jobs: Map<string, Promise<unknown>> = new Map();
  private cache: WorkerCache = { download: null, transcode: null, publish: null };
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private maxConcurrentDownloads = 2;
  private runningDownloads = 0;

  // ------------------------------------------------------------------
  // Los workers se cargan de forma diferida para evitar la dependencia
  // circular (workers/index <-> workers/*) que rompe la inicialización.
  // ------------------------------------------------------------------
  private async getDownloadWorker(): Promise<DownloadWorker> {
    if (!this.cache.download) {
      const mod = await import('./download');
      this.cache.download = new mod.DownloadWorker();
    }
    return this.cache.download;
  }

  private async getTranscodeWorker(): Promise<TranscodeWorker> {
    if (!this.cache.transcode) {
      const mod = await import('./transcode');
      this.cache.transcode = new mod.TranscodeWorker();
    }
    return this.cache.transcode;
  }

  private async getPublishWorker(): Promise<PublishWorker> {
    if (!this.cache.publish) {
      const mod = await import('./publish');
      this.cache.publish = new mod.PublishWorker();
    }
    return this.cache.publish;
  }

  async enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const existing = this.jobs.get(id);
    if (existing) return existing as Promise<T>;

    const promise = task().finally(() => this.jobs.delete(id));
    this.jobs.set(id, promise);
    return promise;
  }

  has(id: string): boolean {
    return this.jobs.has(id);
  }

  size(): number {
    return this.jobs.size;
  }

  startPolling(intervalMs = 5000): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.poll().catch(() => {});
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
async poll(): Promise<void> {
    if (this.runningDownloads >= this.maxConcurrentDownloads) return;

    const { data: pendingJobs, error } = await supabase
      .from('publication_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(this.maxConcurrentDownloads - this.runningDownloads);

    if (error || !pendingJobs || pendingJobs.length === 0) return;

    for (const job of pendingJobs) {
      if (this.runningDownloads >= this.maxConcurrentDownloads) break;

      this.runningDownloads++;
      this.dispatchJob(job).finally(() => {
        this.runningDownloads--;
      });
    }
  }

  private async dispatchJob(job: {
    id: string;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await supabase
      .from('publication_jobs')
      .update({ status: 'running' })
      .eq('id', job.id);

    try {
      if (job.type === 'download') {
        const payload = job.payload as unknown as DownloadPayload;
        const worker = await this.getDownloadWorker();
        const result = await worker.run(payload);

        await supabase
          .from('publication_jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            error: result.error ?? null,
            payload: { ...job.payload, result },
          })
          .eq('id', job.id);

        if (result.success && result.mediaItemId) {
          await this.enqueueTranscodeJob(result.mediaItemId, result.storagePath ?? '');
        }
      } else if (job.type === 'transcode') {
        const payload = job.payload as unknown as TranscodePayload;
        const worker = await this.getTranscodeWorker();
        const result = await worker.run(payload);

        await supabase
          .from('publication_jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            error: result.error ?? null,
            payload: { ...job.payload, result },
          })
          .eq('id', job.id);
      } else if (job.type === 'publish') {
        const payload = job.payload as unknown as PublishPayload;
        const worker = await this.getPublishWorker();
        const result = await worker.run(payload);

        await supabase
          .from('publication_jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            error: result.error ?? null,
            payload: { ...job.payload, result },
          })
          .eq('id', job.id);
      }
    } catch (error) {
      const appError = errorFactory({
        provider: null,
        status: 500,
        message: error instanceof Error ? error.message : 'Error en job dispatch',
        cause: error,
      });

      await supabase
        .from('publication_jobs')
        .update({
          status: 'failed',
          error: appError.message,
        })
        .eq('id', job.id);
    }
  }
private async enqueueTranscodeJob(mediaItemId: string, storagePath: string): Promise<void> {
    await supabase.from('publication_jobs').insert({
      publication_id: crypto.randomUUID(),
      type: 'transcode',
      status: 'pending',
      error: null,
      payload: { mediaItemId, storagePath },
    });
  }

  async createPublishJob(publicationId: string, payload: PublishPayload): Promise<string> {
    const { data, error } = await supabase
      .from('publication_jobs')
      .insert({
        publication_id: publicationId,
        type: 'publish',
        status: 'pending',
        error: null,
        payload,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al crear job de publicación: ${error?.message ?? 'Unknown error'}`,
        body: error,
      });
    }

    this.startPolling(4000);
    return data.id;
  }

  async createDownloadJob(publicationId: string, payload: DownloadPayload): Promise<string> {
    const { data, error } = await supabase
      .from('publication_jobs')
      .insert({
        publication_id: publicationId,
        type: 'download',
        status: 'pending',
        error: null,
        payload,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: `Error al crear job de descarga: ${error?.message ?? 'Unknown error'}`,
        body: error,
      });
    }

    this.startPolling(4000);
    return data.id;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    type: string;
    status: string;
    error: string | null;
    payload: Record<string, unknown>;
  } | null> {
    const { data, error } = await supabase
      .from('publication_jobs')
      .select('id, type, status, error, payload')
      .eq('id', jobId)
      .single();

    if (error || !data) return null;
    return data;
  }
}

export const jobQueue = new JobQueue();
export type { DownloadPayload, TranscodePayload, PublishPayload };