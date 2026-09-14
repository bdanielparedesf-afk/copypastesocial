import { encrypt, decrypt } from '@/services/crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

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
    return `${origin}/api/auth/callback/tiktok`;
  }
  return `${origin}/api/auth/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// State OAuth (base64url con provider + timestamp)
// ---------------------------------------------------------------------------

/** State OAuth (base64url con provider + timestamp). */
export function buildOAuthState(provider: string): string {
  return Buffer.from(JSON.stringify({ provider, ts: Date.now() })).toString('base64url');
}

/** Lee el provider del state; null si no parseable. */
export function parseOAuthState(state: string | null): string | null {
  if (!state) return null;
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
