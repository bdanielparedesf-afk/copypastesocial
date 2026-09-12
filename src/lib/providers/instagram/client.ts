/**
 * FASE 9 — Cliente real de la Instagram Graph API (Meta).
 *
 * Envuelve `fetch` contra `https://graph.facebook.com/{version}` y tipa los
 * errores de Meta (`error.message`, `error.code`, `error.error_subcode`).
 * No depende de librerías externas.
 *
 * Uso:
 *   const data = await graphRequest('me', { fields: 'id,username', access_token });
 */
import { config } from '@/config';
import { errorFactory } from '@/utils/errors';

export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export type GraphParams = Record<string, string | number | boolean | undefined>;

interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: URLSearchParams;
  headers?: Record<string, string>;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/**
 * Llama a la Graph API de Meta con el prefijo `https://graph.facebook.com/{v}`.
 * Lanza AppError con `provider: 'instagram'` y el mensaje real de Meta.
 */
export async function graphRequest<T>(
  path: string,
  params: GraphParams,
  options: GraphRequestOptions = {}
): Promise<T> {
  const cfg = config.providers.instagram;
  const { method = 'GET', body, headers } = options;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const url = `${cfg.graphApiUrl}/${cfg.graphApiVersion}/${path}?${query.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
    });
  } catch (cause) {
    throw errorFactory({
      provider: 'instagram',
      status: 0,
      message: cause instanceof Error ? cause.message : 'Network error llamando a Graph API',
      cause,
    });
  }

  const data = (await parseJson(res)) as T & MetaErrorBody;

  if (!res.ok) {
    const metaError = data?.error;
    throw errorFactory({
      provider: 'instagram',
      status: res.status,
      message:
        metaError?.message ??
        metaError?.type ??
        `Instagram Graph API respondió HTTP ${res.status}`,
      body: metaError ?? data,
      code: metaError?.code === 190 ? 'AUTH_REQUIRED' : undefined,
    });
  }

  return data;
}