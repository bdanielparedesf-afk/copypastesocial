/**
 * FASE 9 — GET /api/auth/instagram/callback
 *
 * Callback del Facebook Login de Instagram. Recibe `?code=` + `state`,
 * y ejecuta el flujo OAuth real:
 *   1. exchangeCode(code, redirectUri) → token corto (~2h)
 *   2. getLongLivedToken(corto) → token long-lived (~60 dias)
 *   3. getUserProfile(longLived) → perfil IG (username, id)
 *   4. saveInstagramToken() → guarda en provider_tokens
 *      + sincroniza social_accounts (encriptado)
 * Redirige a /accounts?connected=instagram (o ?error=... si algo falla).
 *
 * FASE 20: Auth 401 si no hay usuario.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { exchangeCode, getLongLivedToken, getUserProfile } from '@/lib/providers/instagram/auth';
import { saveInstagramToken } from '@/lib/providers/instagram/token';
import { resolveUserId } from '@/lib/supabase/api';

export const dynamic = 'force-dynamic';

const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = request.nextUrl?.origin ?? DEFAULT_ORIGIN;
  const redirectUri = `${origin}/api/auth/instagram/callback`;

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const errorParam = request.nextUrl.searchParams.get('error');

  const accountsUrl = new URL('/accounts', origin);

  if (errorParam) {
    accountsUrl.searchParams.set('error', errorParam);
    return NextResponse.redirect(accountsUrl);
  }

  if (!code) {
    accountsUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(accountsUrl);
  }

  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
        provider?: string;
      };
      if (parsed.provider && parsed.provider !== 'instagram') {
        accountsUrl.searchParams.set('error', 'state_mismatch');
        return NextResponse.redirect(accountsUrl);
      }
    } catch {
    }
  }

  try {
    const shortToken = await exchangeCode(code, redirectUri);
    const longToken = await getLongLivedToken(shortToken.accessToken);
    const profile = await getUserProfile(longToken.accessToken);
    const userId = await resolveUserId();
    await saveInstagramToken(userId, {
      accessToken: longToken.accessToken,
      expiresAt: longToken.expiresAt,
      refreshToken: longToken.refreshToken,
      profile,
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
    });

    accountsUrl.searchParams.set('connected', 'instagram');
    accountsUrl.searchParams.set('username', profile.username);
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback de Instagram fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}
