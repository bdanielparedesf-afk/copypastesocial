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
  const redirectUri = `${origin}/api/auth/tiktok/callback`;

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
      if (parsed.provider && parsed.provider !== 'tiktok') {
        accountsUrl.searchParams.set('error', 'state_mismatch');
        return NextResponse.redirect(accountsUrl);
      }
    } catch {
    }
  }

  try {
    const tokenRes = await fetch(`${config.providers.tiktok.baseUrl}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.providers.tiktok.clientKey ?? '',
        client_secret: config.providers.tiktok.clientSecret ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenBody = await tokenRes.json().catch(() => ({}));
    const data = tokenBody.data ?? tokenBody;

    if (!tokenRes.ok || !data.access_token) {
      throw new Error('Error intercambiando el code de TikTok');
    }

    const accessToken = data.access_token as string;
    const expiresAt = data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null;
    const refreshToken = data.refresh_token ? (data.refresh_token as string) : null;

    let username = data.open_id ?? 'TikTok';
    const userRes = await fetch(`${config.providers.tiktok.baseUrl}/user/info/?fields=open_id,display_name,avatar_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userRes.ok) {
      const userData = await userRes.json().catch(() => ({}));
      const user = userData.data?.user;
      if (user?.display_name) username = user.display_name;
    }

    const encryptedAccess = tokenService.encrypt(accessToken);
    const encryptedRefresh = refreshToken ? tokenService.encrypt(refreshToken) : null;

    const admin = createServerClient();
    const ownerId = process.env.NODE_ENV === 'production' ? userId : DEV_USER_ID;
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', ownerId)
      .eq('provider', 'tiktok')
      .eq('username', username)
      .maybeSingle();

    const record = {
      user_id: ownerId,
      provider: 'tiktok',
      username,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
      scopes: ['video.publish', 'user.info.basic'] as string[],
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
    const message = err instanceof Error ? err.message : 'OAuth callback de TikTok fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}

