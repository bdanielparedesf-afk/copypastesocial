import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { tokenService } from '@/services/TokenService';
import { canonicalOrigin, parseOAuthState, redirectUriFor } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

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

const INSTAGRAM_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
] as string[];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);
  // URI canónica registrada en Facebook Developers:
  // https://copypastesocial.vercel.app/api/auth/callback/facebook
  // Instagram comparte este mismo callback (state.provider decide).
  const redirectUri = redirectUriFor('facebook', origin);

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const errorParam =
    request.nextUrl.searchParams.get('error') ??
    request.nextUrl.searchParams.get('error_description');
  const errorReason = request.nextUrl.searchParams.get('error_reason');

  const accountsUrl = new URL('/accounts', origin);

  if (errorParam) {
    accountsUrl.searchParams.set(
      'error',
      errorReason ? `${errorParam}: ${errorReason}` : errorParam
    );
    return NextResponse.redirect(accountsUrl);
  }

  if (!code) {
    accountsUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(accountsUrl);
  }

  // Meta comparte callback FB+IG: el state decide el provider (default facebook).
  const stateProvider = parseOAuthState(state);
  const provider: 'facebook' | 'instagram' =
    stateProvider === 'instagram' ? 'instagram' : 'facebook';
  if (state && stateProvider && stateProvider !== 'facebook' && stateProvider !== 'instagram') {
    accountsUrl.searchParams.set('error', 'state_mismatch');
    return NextResponse.redirect(accountsUrl);
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
    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number | string;
      error?: { message?: string };
    };
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(
        tokenData.error?.message ?? 'Error intercambiando el code de Meta (revisa redirect_uri registrada)'
      );
    }
    let accessToken = tokenData.access_token as string;
    let expiresAt = tokenData.expires_in
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
      const longData = (await longRes.json().catch(() => ({}))) as {
        access_token?: string;
        expires_in?: number | string;
      };
      if (longData.access_token) {
        accessToken = longData.access_token as string;
        if (longData.expires_in) {
          expiresAt = new Date(Date.now() + Number(longData.expires_in) * 1000).toISOString();
        }
      }
    }
    let username = provider === 'instagram' ? 'Instagram' : 'Facebook';
    const userRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    if (userRes.ok) {
      const userData = (await userRes.json().catch(() => ({}))) as { name?: string; id?: string };
      username = userData.name ?? userData.id ?? username;
    }
    const encryptedAccess = tokenService.encrypt(accessToken);

    const admin = createServerClient();
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('username', username)
      .maybeSingle();

    const record = {
      user_id: userId,
      provider,
      username,
      access_token: encryptedAccess,
      refresh_token: provider === 'instagram' ? encryptedAccess : null,
      expires_at: expiresAt,
      scopes: provider === 'instagram' ? INSTAGRAM_SCOPES : FACEBOOK_SCOPES,
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existing?.id
      ? await admin.from('social_accounts').update(record).eq('id', existing.id)
      : await admin.from('social_accounts').insert(record);

    if (dbError) throw new Error(dbError.message);

    accountsUrl.searchParams.set('connected', provider);
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback de Facebook fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}
