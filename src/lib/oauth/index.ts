import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { encrypt, decrypt } from '@/services/crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ---------------------------------------------------------------------------
// Constantes de TikTok (Login Kit v2)
// ---------------------------------------------------------------------------

/** Endpoint de autorización de TikTok (v2, con slash final obligatorio). */
export const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';

/**
 * Path canónico del callback de TikTok. Debe coincidir LETRA POR LETRA con el
 * Redirect URI whitelisteado en TikTok Developers → Login Kit (sin slash final
 * y sin query params).
 */
export const TIKTOK_REDIRECT_PATH = '/api/auth/callback/tiktok';

/**
 * Scopes de TikTok.
 *
 * Formato: SIEMPRE separados por COMAS. Con espacios, `URLSearchParams` los
 * serializa como `+` (que en una query equivale a un espacio) y TikTok lo
 * interpreta como UN ÚNICO scope inválido → pantalla "Hubo un problema".
 *
 * IMPORTANTE: TikTok también muestra la pantalla de error (en vez de la de
 * consentimiento) cuando pedimos un scope que la app NO tiene habilitado.
 * Este proyecto todavía NO tiene la Content Posting API aprobada (ver
 * `upload()` en src/lib/providers/tiktok/client.ts, que lanza "no tiene
 * habilitada la publicación automática"), así que por defecto pedimos SOLO el
 * scope de Login Kit (`user.info.basic`), que siempre está disponible.
 *
 * Cuando la Content Posting API esté aprobada se habilita `video.publish` SIN
 * tocar código, definiendo en Vercel (y en `.env.local`):
 *   TIKTOK_SCOPES=user.info.basic,video.publish
 */
export const TIKTOK_SCOPES =
  (process.env.TIKTOK_SCOPES ?? '').trim() || 'user.info.basic';

/** Edad máxima aceptada para el state firmado (1 hora). */
export const OAUTH_STATE_MAX_AGE_MS = 60 * 60 * 1000;

/** Scopes requeridos para YouTube. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

// ---------------------------------------------------------------------------
// Origen canónico (request origin > NEXT_PUBLIC_APP_URL > default por env)
// ---------------------------------------------------------------------------

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

/**
 * Origen canónico: origin del request > NEXT_PUBLIC_APP_URL > default por env.
 * Regla: el redirect_uri se construye SIEMPRE desde el origin del request en
 * runtime (request.nextUrl.origin). Así local (cualquier puerto) y Vercel usan
 * la URI que el provider redirige, sin desfasajes con NEXT_PUBLIC_APP_URL.
 */
export function canonicalOrigin(requestOrigin?: string | null): string {
  if (requestOrigin && /^https?:\/\//i.test(requestOrigin)) {
    return stripTrailingSlash(requestOrigin.trim());
  }
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (env) return stripTrailingSlash(env);
  return process.env.NODE_ENV === 'production'
    ? 'https://copypastesocial.vercel.app'
    : 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// redirect_uri canónico por provider
// ---------------------------------------------------------------------------

/**
 * redirect_uri canónico por provider (mismo path en init y en callback).
 * - Meta (FB+IG) usa UNA sola URI: /api/auth/callback/facebook (el state distingue).
 * - TikTok:   /api/auth/callback/tiktok
 * - YouTube:  /api/auth/youtube/callback
 *
 * URIs a registrar en cada consola (añade AMBAS, local + prod):
 *   - Facebook/Instagram (Meta Developers → Facebook Login → "URI de redirección de OAuth válidos"):
 *       http://localhost:3000/api/auth/callback/facebook
 *       https://copypastesocial.vercel.app/api/auth/callback/facebook
 *   - TikTok (TikTok Developers → tu app → Login Kit → Redirect URI):
 *       http://localhost:3000/api/auth/callback/tiktok
 *       https://copypastesocial.vercel.app/api/auth/callback/tiktok
 *   - YouTube (Google Cloud Console → Credenciales → OAuth Client Web → redirect_uris):
 *       http://localhost:3000/api/auth/youtube/callback
 *       https://copypastesocial.vercel.app/api/auth/youtube/callback
 */
export function redirectUriFor(
  provider: 'facebook' | 'instagram' | 'tiktok' | 'youtube',
  requestOrigin?: string | null
): string {
  const origin = canonicalOrigin(requestOrigin);
  if (provider === 'facebook' || provider === 'instagram') {
    return `${origin}/api/auth/callback/facebook`;
  }
  if (provider === 'tiktok') {
    return `${origin}${TIKTOK_REDIRECT_PATH}`;
  }
  return `${origin}/api/auth/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// State OAuth (base64url {provider,ts,nonce} + firma HMAC-SHA256)
// ---------------------------------------------------------------------------

/**
 * Secreto para firmar el state. Debe ser estable entre el init y el callback
 * de la misma deployment (por eso lee de envs ya presentes en Vercel).
 */
function oauthStateSecret(): string {
  return (
    (process.env.OAUTH_STATE_SECRET ?? '').trim() ||
    (process.env.ENCRYPTION_KEY ?? '').trim() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    'copypastesocial-oauth-state-dev'
  );
}

function signOAuthPayload(payload: string): string {
  return createHmac('sha256', oauthStateSecret()).update(payload).digest('hex');
}

export interface OAuthStatePayload {
  provider: string;
  ts: number;
  nonce: string;
}

/**
 * State OAuth firmado (anti-CSRF): `base64url({provider,ts,nonce}).<hmac>`.
 * Sin la firma no se puede forjar ni alterar el state.
 */
export function buildOAuthState(provider: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      provider,
      ts: Date.now(),
      nonce: randomBytes(16).toString('hex'),
    })
  ).toString('base64url');
  return `${payload}.${signOAuthPayload(payload)}`;
}

/**
 * Valida firma + estructura del state. Devuelve el payload o null si el state
 * falta, está alterado o no tiene firma válida.
 */
export function verifyOAuthState(state: string | null): OAuthStatePayload | null {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;

  const payload = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!signature) return null;

  try {
    const received = Buffer.from(signature, 'hex');
    const expected = Buffer.from(signOAuthPayload(payload), 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      provider?: string;
      ts?: number;
      nonce?: string;
    };
    if (!parsed.provider || typeof parsed.ts !== 'number') return null;
    return { provider: parsed.provider, ts: parsed.ts, nonce: parsed.nonce ?? '' };
  } catch {
    return null;
  }
}

/** true si el state no superó la edad máxima permitida. */
export function isOAuthStateFresh(
  ts: number,
  maxAgeMs: number = OAUTH_STATE_MAX_AGE_MS
): boolean {
  if (!Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  return age >= 0 && age <= maxAgeMs;
}

/** Lee el provider del state (firmado o legacy base64url); null si inválido. */
export function parseOAuthState(state: string | null): string | null {
  const verified = verifyOAuthState(state);
  if (verified) return verified.provider;

  // Compatibilidad con states legacy sin firma (base64url plano).
  if (!state || state.includes('.')) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      provider?: string;
    };
    return parsed.provider ?? null;
  } catch {
    return null;
  }
}

/**
 * Origen canónico según entorno (request origin > NEXT_PUBLIC_APP_URL > default
 * por env). Conservado para compatibilidad con código existente que lo llame.
 */
export function appOrigin(requestOrigin?: string | null): string {
  if (requestOrigin) return requestOrigin;
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
  if (env) return env;
  return process.env.NODE_ENV === 'production'
    ? 'https://copypastesocial.vercel.app'
    : 'http://localhost:3000';
}

/** redirect_uri canónico de YouTube según entorno. */
export function youtubeRedirectUri(requestOrigin?: string | null): string {
  return `${appOrigin(requestOrigin)}/api/auth/youtube/callback`;
}

/** URL de autorización de YouTube (flujo server-side con client_secret, sin PKCE). */
export function buildYouTubeAuthUrl(opts: { state: string; requestOrigin?: string | null }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: youtubeRedirectUri(opts.requestOrigin),
    response_type: 'code',
    scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** true si GOOGLE_CLIENT_ID/SECRET están configurados (no placeholder). */
export function isYouTubeConfigured(): boolean {
  const id = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const secret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  if (!id || !secret) return false;
  if (id.includes('your-google-client-id')) return false;
  if (secret.includes('your-google-client-secret')) return false;
  return true;
}

export function encryptToken(token: string): string {
  return encrypt(token, process.env.ENCRYPTION_KEY ?? 'default-key');
}

export function decryptToken(encrypted: string): string {
  return decrypt(encrypted, process.env.ENCRYPTION_KEY ?? 'default-key');
}

// Re-export del módulo completo de YouTube para compatibilidad.
export { getAuthUrl, exchangeCode } from '@/lib/providers/youtube/auth';
