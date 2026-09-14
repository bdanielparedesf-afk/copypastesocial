import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev, DEV_USER_ID } from '@/lib/dev-auth';
import { config } from '@/config';
import { tokenService } from '@/services/TokenService';

export const dynamic = 'force-dynamic';

function resolveOrigin(request: NextRequest): string {
  const fromRequest = request.nextUrl?.origin;
  if (fromRequest && fromRequest.startsWith('http')) return fromRequest;
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
  if (env) return env;
  return process.env.NODE_ENV === 'production'
    ? 'https://copypastesocial.vercel.app'
    : 'http://localhost:3000';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getUserIdAllowDev();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = resolveOrigin(request);
  const redirectUri = `${origin}/api/auth/facebook/callback`;

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
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as { provider?: string };
      if (parsed.provider && parsed.provider !== 'facebook') {
        accountsUrl.searchParams.set('error', 'state_mismatch');
        return NextResponse.redirect(accountsUrl);
      }
    } catch {
    }
  }

  try {
    const cfg = config.providers.facebook;
    const tokenParams = new URLSearchParams({
      client_id: cfg.appId ?? '',
      client_secret: cfg.appSecret ?? '',
      code,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/oauth/access_token?${tokenParams}`);
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error('Error intercambiando el code de Meta');
    }
    let accessToken = tokenData.access_token as string;
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : null;
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: cfg.appId ?? '',
      client_secret: cfg.appSecret ?? '',
      fb_exchange_token: accessToken,
    });
    const longRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/oauth/access_token?${longParams}`);
    if (longRes.ok) {
      const longData = await longRes.json().catch(() => ({}));
      if (longData.access_token) accessToken = longData.access_token as string;
    }
    let username = 'Facebook';
    const userRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    if (userRes.ok) {
      const userData = await userRes.json().catch(() => ({}));
      username = userData.name ?? userData.id ?? username;
    }
    const tokenData2 = { accessToken, refreshToken: null, expiresAt, username };

    const encryptedAccess = tokenService.encrypt(tokenData2.accessToken);
    const encryptedRefresh = tokenData2.refreshToken ? tokenService.encrypt(tokenData2.refreshToken) : null;

    const admin = createServerClient();
    const ownerId = process.env.NODE_ENV === 'production' ? userId : DEV_USER_ID;
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', ownerId)
      .eq('provider', 'facebook')
      .eq('username', tokenData2.username)
      .maybeSingle();

    const record = {
      user_id: ownerId,
      provider: 'facebook',
      username: tokenData2.username,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: tokenData2.expiresAt,
      scopes: ['pages_manage_posts', 'pages_read_engagement', 'publish_video'] as string[],
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existing?.id
      ? await admin.from('social_accounts').update(record).eq('id', existing.id)
      : await admin.from('social_accounts').insert(record);

    if (dbError) {
      throw new Error(dbError.message);
    }

    accountsUrl.searchParams.set('connected', 'facebook');
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback de Facebook fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}

