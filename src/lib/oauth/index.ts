import { encrypt, decrypt } from '@/services/crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Scopes requeridos para YouTube. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

/** Origen canónico según entorno (request origin > NEXT_PUBLIC_APP_URL > default por env). */
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
