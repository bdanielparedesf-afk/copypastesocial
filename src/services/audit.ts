import { AuditResult, AuditStatus, ProviderId } from '@/types';
import { detect } from '@/services/SourceDetector';
import { getProvider } from '@/providers/registry';
import { config } from '@/config';
import { supabase } from '@/lib/supabase';
import { AppError, errorFactory } from '@/utils/errors';
import { toJsonObject } from '@/utils';

export interface AuditServiceOptions {
  mockMode?: boolean;
}

export class AuditService {
  constructor(private options: AuditServiceOptions = {}) {}

  private get mockMode(): boolean {
    if (this.options.mockMode !== undefined) return this.options.mockMode;
    return config.mock.enabled;
  }

  async check(url: string): Promise<AuditResult> {
    const detected = detect(url);

    if (!detected) {
      return this.errorResult(url, AuditStatus.UNSUPPORTED, 'Plataforma no soportada', {
        url,
      });
    }

    if (this.mockMode) {
      return this.mockAudit(url, detected);
    }

    try {
      const provider = getProvider(detected.provider);
      if (!provider) {
        return this.errorResult(url, AuditStatus.UNSUPPORTED, 'Provider no encontrado', {
          provider: detected.provider,
        });
      }

            const result = await provider.audit(detected.url);
      await this.persistAudit(result).catch(() => {});
      return result;
    } catch (error) {
      const appError = error instanceof AppError ? error : AppError.fromUnknown(error, detected.provider);
      const result = this.errorFromAppError(url, appError);
      await this.persistAudit(result).catch(() => {});
      return result;
    }
  }

  async audit(url: string): Promise<AuditResult> {
    return this.check(url);
  }

  private async persistAudit(result: AuditResult): Promise<void> {
    try {
      const { error } = await supabase
        .from('audits')
        .insert({
          id: result.id,
          source_url: result.sourceUrl,
          provider: result.provider,
          status: result.status,
          title: result.title,
          message: result.message,
          metadata: result.metadata,
          created_at: result.createdAt,
        });

      if (error) {
        throw errorFactory({
          provider: null,
          status: 500,
          message: error.message,
          body: error,
        });
      }
    } catch (err) {
      throw errorFactory({
        provider: null,
        status: 500,
        message: err instanceof Error ? err.message : 'Error al persistir auditoría',
        cause: err,
      });
    }
  }

  private mockAudit(url: string, detected: { provider: ProviderId; url: string; identifier: string; contentType: string }): AuditResult {
    const statuses: AuditStatus[] = [AuditStatus.ACCESSIBLE, AuditStatus.AUTH_REQUIRED, AuditStatus.API_RESTRICTED];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const labels: Record<AuditStatus, string> = {
      [AuditStatus.CHECKING]: 'Comprobando',
      [AuditStatus.ACCESSIBLE]: 'Accesible',
      [AuditStatus.PRIVATE]: 'Privado',
      [AuditStatus.UNAVAILABLE]: 'No disponible',
      [AuditStatus.UNSUPPORTED]: 'No soportado',
      [AuditStatus.AUTH_REQUIRED]: 'Autenticación requerida',
      [AuditStatus.API_RESTRICTED]: 'API restringida',
      [AuditStatus.ERROR]: 'Error',
    };
    return {
      id: crypto.randomUUID(),
      sourceUrl: url,
      provider: detected.provider,
      status,
      title: labels[status],
      message: 'Resultado simulado (MOCK_MODE)',
      metadata: { mock: true, provider: detected.provider, identifier: detected.identifier },
      createdAt: new Date().toISOString(),
    };
  }

  private errorFromAppError(url: string, error: AppError): AuditResult {
    let status: AuditStatus;
    switch (error.code) {
      case 'AUTH_REQUIRED':
        status = AuditStatus.AUTH_REQUIRED;
        break;
      case 'API_RESTRICTED':
        status = AuditStatus.API_RESTRICTED;
        break;
      case 'PRIVATE':
        status = AuditStatus.PRIVATE;
        break;
      case 'UNAVAILABLE':
        status = AuditStatus.UNAVAILABLE;
        break;
      case 'UNSUPPORTED':
        status = AuditStatus.UNSUPPORTED;
        break;
      case 'RATE_LIMITED':
        status = AuditStatus.API_RESTRICTED;
        break;
      default:
        status = AuditStatus.ERROR;
        break;
    }
    return {
      id: crypto.randomUUID(),
      sourceUrl: url,
      provider: error.provider ?? 'instagram',
      status,
      title: error.message,
      message: error.message,
            metadata: toJsonObject({ error: error.code, isRetryable: error.isRetryable }),
      createdAt: new Date().toISOString(),
    };
  }

    private errorResult(
    url: string,
    status: AuditStatus,
    message: string,
    metadata: Record<string, unknown>
  ): AuditResult {
    return {
      id: crypto.randomUUID(),
      sourceUrl: url,
      provider: 'instagram',
      status,
      title: message,
      message,
      metadata: toJsonObject(metadata),
      createdAt: new Date().toISOString(),
    };
  }
}