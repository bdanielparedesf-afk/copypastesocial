import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import {
  buildOAuthState,
  canonicalOrigin,
  redirectUriFor,
  TIKTOK_AUTH_URL,
  TIKTOK_SCOPES,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  // client_key SIEMPRE desde env (TIKTOK_CLIENT_KEY). Nunca hardcodeado y nunca
  // el de Sandbox: en Vercel debe ser el Client Key de Production.
  const clientKey = (config.providers.tiktok.clientKey ?? '').trim();
  if (!clientKey) {
    return NextResponse.json(
      {
        error:
          'TikTok no configurado: falta TIKTOK_CLIENT_KEY real en .env.local (local) y en Vercel (producción).',
      },
      { status: 500 }
    );
  }

  const origin = canonicalOrigin(request.nextUrl?.origin);

  // State firmado (HMAC) + timestamp: se valida en el callback para evitar CSRF.
  const state = buildOAuthState('tiktok');
  // redirect_uri EXACTO al whitelisteado en TikTok Developers → Login Kit:
  // https://copypastesocial.vercel.app/api/auth/callback/tiktok
  // (sin slash final, sin query params ni fragmentos).
  const redirectUri = redirectUriFor('tiktok', origin);

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    // TikTok espera los scopes separados por COMAS (no por espacios).
    scope: TIKTOK_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  const url = `${TIKTOK_AUTH_URL}?${params.toString()}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

