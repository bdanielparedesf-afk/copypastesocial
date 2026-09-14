import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
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

// App Facebook 1231742610032848 — scopes Pages + Instagram Business (Graph v19.0).
const FACEBOOK_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
] as string[];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getUserIdAllowDev(request);

  const origin = resolveOrigin(request);
  // URI canónica registrada en Facebook Developers:
  // https://copypastesocial.vercel.app/api/auth/callback/facebook
  const redirectUri = `${origin}/api/auth/callback/facebook`;

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
    const encryptedAccess = tokenService.encrypt(accessToken);

    const admin = createServerClient();
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'facebook')
      .eq('username', username)
      .maybeSingle();

    const record = {
      user_id: userId,
      provider: 'facebook',
      username,
      access_token: encryptedAccess,
      refresh_token: null,
      expires_at: expiresAt,
      scopes: FACEBOOK_SCOPES,
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existing?.id
      ? await admin.from('social_accounts').update(record).eq('id', existing.id)
      : await admin.from('social_accounts').insert(record);

    if (dbError) throw new Error(dbError.message);

    accountsUrl.searchParams.set('connected', 'facebook');
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback de Facebook fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}
