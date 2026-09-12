'use server';

import { z } from 'zod';
import { AuditService } from '@/services/audit';
import { detect } from '@/services/SourceDetector';
import { jobQueue } from '@/workers';
import { normalizeUrl } from '@/utils';
import { AuditStatus } from '@/types';

const DownloadSchema = z.object({
  url: z.string().url('URL inválida'),
});

export interface DownloadActionResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

export async function downloadSource(url: string): Promise<DownloadActionResponse> {
  const parsed = DownloadSchema.safeParse({ url });
  if (!parsed.success) {
    return { success: false, error: 'URL inválida' };
  }

  const normalized = normalizeUrl(parsed.data.url);
  if (!normalized) {
    return { success: false, error: 'URL inválida o no normalizable' };
  }

  const detected = detect(normalized);
  if (!detected) {
    return { success: false, error: 'Plataforma no soportada' };
  }

  const auditService = new AuditService();
  const auditResult = await auditService.check(normalized);

  if (auditResult.status !== AuditStatus.ACCESSIBLE) {
    return {
      success: false,
      error: `No se puede descargar: ${auditResult.message}`,
    };
  }

  try {
    const publicationId = crypto.randomUUID();
    const jobId = await jobQueue.createDownloadJob(publicationId, {
      sourceId: publicationId,
      url: normalized,
      provider: detected.provider,
      metadata: auditResult.metadata,
    });

    return { success: true, jobId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al crear job de descarga',
    };
  }
}

export async function getJobStatus(jobId: string): Promise<{
  id: string;
  type: string;
  status: string;
  error: string | null;
  payload: Record<string, unknown>;
} | null> {
  return jobQueue.getJobStatus(jobId);
}
