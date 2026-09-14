import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { tokenService } from '@/services/TokenService';
import {
  canonicalOrigin,
  redirectUriFor,
  parseOAuthState,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/**
 * TikTok OAuth callback — path canónico: /api/auth/callback/tiktok
 *
 * 1. Recibe `code` y `state` desde TikTok.
 * 2. Valida el state (CSRF): debe estar presente y decodificar provider='tiktok'.
 * 3. Intercambia el `code` por access_token en https://open.tiktokapis.com/v2/oauth/token/
 *    usando client_key + client_secret (del env, nunca hardcodeados).
 * 4. Obtiene open_id y display_name del usuario.
 * 5. Persiste la cuenta en Supabase.
 * 6. Redirige a /accounts?connected=tiktok
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // El callback del provider NO puede exigir sesión previa.
  const userId = await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);
  const redirectUri = redirectUriFor('tiktok', origin);

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const errorParam =
    request.nextUrl.searchParams.get('error') ??
    request.nextUrl.searchParams.get('error_code');
  const errorMsg =
    request.nextUrl.searchParams.get('error_description') ??
    request.nextUrl.searchParams.get('error_msg');

  const accountsUrl = new URL('/accounts', origin);

  if (errorParam) {
    accountsUrl.searchParams.set(
      'error',
      errorMsg ? `${errorParam}: ${errorMsg}` : errorParam
    );
    return NextResponse.redirect(accountsUrl);
  }

  if (!code) {
    accountsUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(accountsUrl);
  }

  // CSRF: el state debe estar presente y decodificar provider='tiktok'.
  // Si falta o no coincide, rechazar el request.
  const stateProvider = parseOAuthState(state);
  if (!state || !stateProvider || stateProvider !== 'tiktok') {
    accountsUrl.searchParams.set('error', 'state_mismatch');
    return NextResponse.redirect(accountsUrl);
  }

  try {
    // --- Intercambio de code → access_token ---
    // Endpoint oficial: https://open.tiktokapis.com/v2/oauth/token/
    const tokenRes = await fetch(
      `${config.providers.tiktok.baseUrl}/oauth/token/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: config.providers.tiktok.clientKey ?? '',
          client_secret: config.providers.tiktok.clientSecret ?? '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      }
    );

    const tokenBody = (await tokenRes
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const data =
      (tokenBody.data as Record<string, unknown> | undefined) ?? tokenBody;

    if (!tokenRes.ok || !data.access_token) {
      const errMsg =
        (tokenBody.error_response as Record<string, unknown>)?.msg ??
        (tokenBody.msg as string | undefined) ??
        ((typeof data === 'string'
          ? data
          : (data as any)?.error_description ||
            (data as any)?.message ||
            JSON.stringify(data)) ||
          'Error intercambiando el code de TikTok');
      throw new Error(errMsg);
    }

    const accessToken = tokenBody.access_token as string;
    const expiresAt = tokenBody.expires_in
      ? new Date(Date.now() + Number(tokenBody.expires_in) * 1000).toISOString()
      : null;
    const refreshToken = tokenBody.refresh_token
      ? (tokenBody.refresh_token as string)
      : null;

    // --- UserInfo (open_id + display_name) ---
    let username = (data.open_id as string | undefined) ?? 'TikTok';
    const userRes = await fetch(
      `${config.providers.tiktok.baseUrl}/user/info/?fields=open_id,display_name,avatar_url`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (userRes.ok) {
      const userData = (await userRes.json().catch(() => ({}))) as {
        data?: { user?: { display_name?: string } };
      };
      const user = userData.data?.user;
      if (user?.display_name) username = user.display_name;
    }

    // --- Persistir en Supabase ---
    const encryptedAccess = tokenService.encrypt(accessToken);
    const encryptedRefresh = refreshToken ? tokenService.encrypt(refreshToken) : null;

    const admin = createServerClient();
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'tiktok')
      .eq('username', username)
      .maybeSingle();

    const record = {
      user_id: userId,
      provider: 'tiktok',
      username,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
      scopes: ['user.info.basic', 'video.publish'] as string[],
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existing?.id
      ? await admin.from('social_accounts').update(record).eq('id', existing.id)
      : await admin.from('social_accounts').insert(record);

    if (dbError) throw new Error(dbError.message);

    accountsUrl.searchParams.set('connected', 'tiktok');
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'OAuth callback de TikTok fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}
