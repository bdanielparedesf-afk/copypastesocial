import type { ProviderId } from '@/types';

export type ErrorCode =
  | 'API_RESTRICTED'
  | 'AUTH_REQUIRED'
  | 'PRIVATE'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppErrorOptions {
  code?: ErrorCode;
  message?: string;
  statusCode?: number;
  provider?: ProviderId | null;
  isRetryable?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly provider: ProviderId | null;
  readonly isRetryable: boolean;
  readonly cause?: unknown;

  constructor(options: AppErrorOptions = {}) {
    super(options.message ?? 'Error de la aplicación');
    this.name = 'AppError';
    this.code = options.code ?? 'UNKNOWN';
    this.statusCode = options.statusCode ?? 500;
    this.provider = options.provider ?? null;
    this.isRetryable = options.isRetryable ?? false;
    this.cause = options.cause;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      provider: this.provider,
      isRetryable: this.isRetryable,
    };
  }

  static fromUnknown(error: unknown, provider?: ProviderId | null): AppError {
    if (error instanceof AppError) return error;

    if (isErrorFactoryInput(error)) {
      return errorFactory({
        provider: provider ?? null,
        status: error.status ?? error.statusCode,
        message: typeof error.message === 'string' ? error.message : undefined,
        body: error.body ?? error.data,
        code: typeof error.code === 'string' ? error.code : undefined,
      });
    }

    if (error instanceof Error) {
      return new AppError({
        code: 'UNKNOWN',
        message: error.message,
        provider: provider ?? null,
        cause: error,
      });
    }

    return new AppError({
      code: 'UNKNOWN',
      message: error != null ? String(error) : 'Error desconocido',
      provider: provider ?? null,
    });
  }
}

interface ProviderErrorInput {
  status?: number;
  statusCode?: number;
  message?: unknown;
  body?: unknown;
  data?: unknown;
  code?: unknown;
}

function isErrorFactoryInput(value: unknown): value is ProviderErrorInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProviderErrorInput>;
  return (
    typeof candidate.status === 'number' ||
    typeof candidate.statusCode === 'number' ||
    typeof candidate.code === 'string' ||
    candidate.body !== undefined ||
    candidate.data !== undefined
  );
}

export interface ErrorFactoryContext {
  provider: ProviderId | null;
  status?: number;
  statusCode?: number;
  message?: string;
  body?: unknown;
  code?: string;
  cause?: unknown;
}

const ERROR_CODES = [
  'API_RESTRICTED',
  'AUTH_REQUIRED',
  'PRIVATE',
  'UNAVAILABLE',
  'UNSUPPORTED',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'INVALID_RESPONSE',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'UNKNOWN',
] as const;

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ErrorRecord)
    : null;
}

function findString(record: ErrorRecord | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function getResponseDetails(body: unknown, code?: string) {
  const root = asRecord(body);
  const error = asRecord(root?.error);
  const firstError = Array.isArray(root?.errors) ? asRecord(root.errors[0]) : null;
  const message =
    findString(root, ['message', 'error_description', 'error_message']) ??
    findString(error, ['message', 'description', 'error_description']) ??
    findString(firstError, ['message', 'reason', 'description']) ??
    undefined;
  const errorCode =
    findString(error, ['code', 'reason', 'error_subcode']) ??
    findString(firstError, ['reason', 'code']) ??
    (typeof code === 'string' ? code : undefined);

  return { message, errorCode };
}

export function errorFactory(ctx: ErrorFactoryContext): AppError {
  const status = ctx.status ?? ctx.statusCode;
  const details = getResponseDetails(ctx.body, ctx.code);
  const message = ctx.message ?? details.message;
  const errorCode = details.errorCode?.toLowerCase();
  const bodyStr = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body ?? {});
  const combined = `${message ?? ''} ${errorCode ?? ''} ${bodyStr}`.trim().toLowerCase();
  const provider = ctx.provider;

  if (status === 401 || /\b401\b|unauthorized|invalid (token|credentials)/.test(combined)) {
    return new AppError({
      code: 'AUTH_REQUIRED',
      message: message || 'Autenticación requerida',
      statusCode: status ?? 401,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  if (
    provider === 'youtube' &&
    status === 403 &&
    /quotaexceeded|\bquota\b|quota exceeded|rate limit|api restricted/.test(combined)
  ) {
    return new AppError({
      code: 'API_RESTRICTED',
      message: message || 'Cuota de YouTube agotada',
      statusCode: status ?? 403,
      provider,
      isRetryable: true,
      cause: ctx,
    });
  }

  if (
    provider === 'instagram' &&
    (status === 403 || /private|perfil privado|account is private|login required/.test(combined))
  ) {
    return new AppError({
      code: 'PRIVATE',
      message: message || 'Contenido privado',
      statusCode: status ?? 403,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  if (
    provider === 'tiktok' &&
    (status === 404 || /video not found|content not found|not found|unavailable/.test(combined))
  ) {
    return new AppError({
      code: 'UNAVAILABLE',
      message: message || 'Contenido no disponible',
      statusCode: status ?? 404,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  if (status === 404 || /\b404\b|not found|no existe|unavailable|no disponible/.test(combined)) {
    return new AppError({
      code: 'UNAVAILABLE',
      message: message || 'Contenido no disponible',
      statusCode: status ?? 404,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  if (status === 429 || /\b429\b|rate limit|too many requests/.test(combined)) {
    return new AppError({
      code: 'RATE_LIMITED',
      message: message || 'Límite de velocidad alcanzado',
      statusCode: status ?? 429,
      provider,
      isRetryable: true,
      cause: ctx,
    });
  }

  if (status === 403 || /\b403\b|forbidden|acceso denegado|permiso denegado/.test(combined)) {
    return new AppError({
      code: 'PRIVATE',
      message: message || 'Acceso privado o denegado',
      statusCode: status ?? 403,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  if (status && status >= 500) {
    return new AppError({
      code: 'NETWORK_ERROR',
      message: message || 'Error del proveedor',
      statusCode: status,
      provider,
      isRetryable: true,
      cause: ctx,
    });
  }

  if (ctx.code && ERROR_CODES.includes(ctx.code as (typeof ERROR_CODES)[number])) {
    return new AppError({
      code: ctx.code as (typeof ERROR_CODES)[number],
      message: message || 'Error del proveedor',
      statusCode: status ?? 500,
      provider,
      isRetryable: false,
      cause: ctx,
    });
  }

  return new AppError({
    code: 'UNKNOWN',
    message: message || 'Error del proveedor',
    statusCode: status ?? 500,
    provider,
    isRetryable: false,
    cause: ctx,
  });
}

export function toAppError(error: unknown, provider?: ProviderId | null): AppError {
  return AppError.fromUnknown(error, provider);
}

export default AppError;
