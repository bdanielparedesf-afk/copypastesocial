/**
 * FASE 9 — OAuth real de Instagram (Instagram Graph API, Meta).
 *
 * Exports obligatorios (8):
 *   1. getAuthUrl             → URL del diálogo de Facebook Login (OAuth code)
 *   2. exchangeCode           → code → access_token de corta duración
 *   3. getLongLivedToken      → short-lived → long-lived (~60 días)
 *   4. refreshToken           → re-intercambia long-lived (fb_exchange_token)
 *   5. getUserProfile         → perfil de la IG Business Account conectada
 *   6. validateToken          → debug_token de Meta (vigencia + scopes)
 *   7. revokeToken            → revoca permisos de la app en la cuenta
 *   8. getMediaContainerStatus → estado de un contenedor (creación de media)
 *
 * Flujo: getAuthUrl -> (FB login) -> callback?code -> exchangeCode ->
 *        getLongLivedToken -> save en provider_tokens -> cron refresh < 5 días.
 */
import { config } from '@/config';
import { graphRequest } from './client';

export interface AuthUrlOptions {
  redirectUri: string;
  state?: string;
  /** Scopes extra (se suman a los básicos de IG). */
  extraScopes?: string[];
}

export interface TokenResult {
  accessToken: string;
  tokenType: string | null;
  expiresIn: number | null;
  /** ISO timestamp calculado a partir de expires_in. */
  expiresAt: string | null;
  refreshToken: string | null;
}

export interface InstagramProfile {
  id: string;
  username: string;
  accountType: string | null;
  mediaCount: number | null;
  followersCount: number | null;
}

export interface TokenValidation {
  isValid: boolean;
  appId: string | null;
  userId: string | null;
  tokenType: string | null;
  scopes: string[];
  expiresAt: string | null;
}

export interface MediaContainerStatus {
  id: string;
  statusCode: string | null;
  status: string | null;
}

interface AccessTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number | string;
}

interface DebugTokenResponse {
  data?: {
    is_valid?: boolean;
    app_id?: string;
    user_id?: string;
    type?: string;
    scopes?: string[];
    expires_at?: number;
  };
}

function isoFromExpiresIn(expiresIn: number | string | undefined): string | null {
  if (expiresIn === undefined) return null;
  const secs = Number(expiresIn);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  return new Date(Date.now() + secs * 1000).toISOString();
}

/**
 * 1) URL del Facebook Login para conectar una cuenta de Instagram.
 *    Scopes App 1231742610032848 (Graph v19.0, Instagram Business API):
 *    instagram_business_basic + instagram_business_content_publish +
 *    manage_comments/messages/insights + pages_* (para descubrir la IG Business).
 */
export function getAuthUrl(options: AuthUrlOptions): string {
  const cfg = config.providers.instagram;
  const scopes = [
    'public_profile',
    'pages_show_list',
    'pages_read_engagement',
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
    'instagram_business_manage_insights',
    ...(options.extraScopes ?? []),
  ];

  const params = new URLSearchParams({
    client_id: cfg.appId ?? '',
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: scopes.join(','),
  });
  if (options.state) params.set('state', options.state);

  return `https://www.facebook.com/${cfg.graphApiVersion}/dialog/oauth?${params.toString()}`;
}

/**
 * 2) Intercambia el `code` del callback por un access_token de corta
 *    duración (~2h). Es un POST form-encoded a /oauth/access_token.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResult> {
  const cfg = config.providers.instagram;
  const body = new URLSearchParams({
    client_id: cfg.appId ?? '',
    client_secret: cfg.appSecret ?? '',
    redirect_uri: redirectUri,
    code,
  });

  const data = await graphRequest<AccessTokenResponse>(
    'oauth/access_token',
    {},
    { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!data.access_token) {
    throw new Error('exchangeCode: Meta no devolvió access_token');
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? null,
    expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : null,
    expiresAt: isoFromExpiresIn(data.expires_in),
    refreshToken: null,
  };
}

/**
 * 3) Long-lived token (~60 días) a partir del token de corta duración.
 *    Usa grant_type=fb_exchange_token (estándar de Meta).
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<TokenResult> {
  const cfg = config.providers.instagram;
  const body = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: cfg.appId ?? '',
    client_secret: cfg.appSecret ?? '',
    fb_exchange_token: shortLivedToken,
  });

  const data = await graphRequest<AccessTokenResponse>(
    'oauth/access_token',
    {},
    { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!data.access_token) {
    throw new Error('getLongLivedToken: Meta no devolvió access_token');
  }

  const expiresAt = isoFromExpiresIn(data.expires_in);
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? null,
    expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : null,
    expiresAt,
    // El refresh de Meta es el propio long-lived: se re-intercambia el mismo
    // token con fb_exchange_token antes de que expire (job cron < 5 días).
    refreshToken: data.access_token,
  };
}
/**
 * 4) Refresh (no-op real de Meta): re-intercambia el long-lived con
 *    fb_exchange_token para extenderlo ~60 días. Devuelve un token nuevo.
 *    El job cron lo llama cuando expires_at < now + 5 días.
 */
export async function refreshToken(longLivedToken: string): Promise<TokenResult> {
  return getLongLivedToken(longLivedToken);
}

/**
 * 5) Perfil del usuario conectado vía `/me` (FB Login).
 *    Para IG usamos los campos de la cuenta de negocio conectada
 *    (account_type / media_count / followers_count).
 */
export async function getUserProfile(accessToken: string): Promise<InstagramProfile> {
  const data = await graphRequest<{
    id?: string;
    username?: string;
    account_type?: string;
    media_count?: number;
    follow_count?: number;
    followers_count?: number;
  }>('me', {
    fields: 'id,username,account_type,media_count,followers_count',
    access_token: accessToken,
  });

  return {
    id: data.id ?? '',
    username: data.username ?? data.id ?? 'Instagram',
    accountType: data.account_type ?? null,
    mediaCount: data.media_count ?? null,
    followersCount: data.followers_count ?? data.follow_count ?? null,
  };
}

/**
 * 6) Valida el token contra el debug_token de Meta usando el token de la app
 *    (`{appId}|{appSecret}`). Devuelve vigencia, scopes y expiración real.
 */
export async function validateToken(accessToken: string): Promise<TokenValidation> {
  const cfg = config.providers.instagram;
  const appToken = `${cfg.appId}|${cfg.appSecret}`;

  const data = await graphRequest<DebugTokenResponse>('debug_token', {
    input_token: accessToken,
    access_token: appToken,
  });

  const d = data?.data;

  return {
    isValid: Boolean(d?.is_valid),
    appId: d?.app_id ?? null,
    userId: d?.user_id ?? null,
    tokenType: d?.type ?? null,
    scopes: d?.scopes ?? [],
    expiresAt:
      typeof d?.expires_at === 'number' ? new Date(d.expires_at * 1000).toISOString() : null,
  };
}

/**
 * 7) Revoca los permisos de la app sobre la cuenta (`/me/permissions` opción
 *    de Meta). Idempotente: si el token ya es inválido, no lanza.
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await graphRequest<{ success?: boolean }>(
      'me/permissions',
      { access_token: accessToken },
      { method: 'DELETE' }
    );
  } catch (error) {
    // Si Meta ya no reconoce el token, la revocación se considera exitosa.
    if (error instanceof Error && /oAuth|token/i.test(error.message)) return;
    throw error;
  }
}

/**
 * 8) Estado de un contenedor de IG (verificación de media creado/subido).
 *    status_code: EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED.
 */
export async function getMediaContainerStatus(
  containerId: string,
  accessToken: string
): Promise<MediaContainerStatus> {
  const data = await graphRequest<{ id?: string; status_code?: string; status?: string }>(
    containerId,
    { fields: 'id,status_code,status', access_token: accessToken }
  );

  return {
    id: data.id ?? containerId,
    statusCode: data.status_code ?? null,
    status: data.status ?? null,
  };
}