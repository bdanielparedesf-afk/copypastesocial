/**
 * FASE 12 - Módulo de OAuth para YouTube (Google Identity Services).
 * 
 * Implementa las funciones de OAuth para YouTube:
 * - getAuthUrl: genera URL de autorización con PKCE
 * - exchangeCode: intercambia código por tokens
 * - refreshToken: renueva access token
 * - revokeToken: revoca tokens
 * - encryptToken / decryptToken: encriptación de tokens
 */

import { config } from '@/config';
import { encrypt, decrypt } from '@/services/crypto';

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Scopes requeridos para YouTube
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

/**
 * Genera un verifier y challenge para PKCE.
 * Returns [verifier, challenge].
 */
export async function generatePKCE(): Promise<[string, string]> {
  const verifier = generateRandomString(64);
  const challenge = await sha256Base64(verifier);
  return [verifier, challenge];
}

/** Genera un string aleatorio para verifier. */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr as any);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

/** SHA-256 + base64url sin padding. */
async function sha256Base64(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data) as any);
  const bytes = Array.from(new Uint8Array(buf));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Construye la URL de autorización de Google.
 * state y PKCE challenge를 포함하여 반환.
 */
export function getAuthUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/youtube/callback`
): string {
  const params = new URLSearchParams(Object.entries({
    client_id: config.providers.youtube.clientId ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).filter(([, v]) => v !== undefined) as [string, string][]);

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia un código de autorización por tokens OAuth.
 * PKCE code_verifier를 함께 전송해야 함.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/youtube/callback`
): Promise<{
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
}> {
  const body = new URLSearchParams(Object.entries({
    client_id: config.providers.youtube.clientId ?? '',
    client_secret: config.providers.youtube.clientSecret ?? '',
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  }).filter(([, v]) => v !== undefined));

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`Error al intercambiar código: ${JSON.stringify(error)}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token: string | null;
    expires_in: number;
  };

  return tokens;
}

/**
 * Renueva el access token usando el refresh token.
 */
export async function refreshToken(refreshTokenValue: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams(Object.entries({
    client_id: config.providers.youtube.clientId ?? '',
    client_secret: config.providers.youtube.clientSecret ?? '',
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
  }).filter(([, v]) => v !== undefined));

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`Error al refrescar token: ${JSON.stringify(error)}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return tokens;
}

/**
 * Revoca un token de acceso o refresh (best-effort).
 * 성공 시 true, 실패 시 false 반환.
 */
export async function revokeToken(
  token: string,
  tokenType: 'access_token' | 'refresh_token' = 'access_token'
): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        token_type_hint: tokenType,
      }).toString(),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Encrypta un token usando la key de encriptación del servicio.
 */
export function encryptToken(token: string): string {
  return encrypt(token, process.env.ENCRYPTION_KEY ?? 'default-key');
}

/**
 * Desencripta un token.
 */
export function decryptToken(encrypted: string): string {
  return decrypt(encrypted, process.env.ENCRYPTION_KEY ?? 'default-key');
}
