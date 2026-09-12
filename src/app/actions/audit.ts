'use server';

import { z } from 'zod';
import { AuditService } from '@/services/audit';
import { detect } from '@/services/SourceDetector';
import { normalizeUrl } from '@/utils';
import { AuditResult, AuditStatus } from '@/types';
import { toJsonObject } from '@/utils';

const AuditSchema = z.object({
  url: z.string().url('URL inválida'),
});

export interface AuditActionResponse {
  success: boolean;
  data?: AuditResult;
  error?: string;
}

export async function auditUrl(url: string): Promise<AuditActionResponse> {
  const parsed = AuditSchema.safeParse({ url });
  if (!parsed.success) {
    return { success: false, error: 'URL inválida' };
  }

  const normalized = normalizeUrl(parsed.data.url);
  if (!normalized) {
    return { success: false, error: 'URL inválida o no normalizable' };
  }

  // Pre-check with SourceDetector before hitting the provider
  const detected = detect(normalized);
  if (!detected) {
    const result: AuditResult = {
      id: crypto.randomUUID(),
      sourceUrl: normalized,
      provider: 'instagram',
      status: AuditStatus.UNSUPPORTED,
      title: 'Plataforma no soportada',
      message: 'No se reconoce el enlace ingresado.',
      metadata: toJsonObject({ unsupported: true, url: normalized }),
      createdAt: new Date().toISOString(),
    };
    return { success: true, data: result };
  }

  const service = new AuditService();
  try {
    const result = await service.check(normalized);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}