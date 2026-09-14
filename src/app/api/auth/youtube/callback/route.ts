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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);
  const redirectUri = redirectUriFor('youtube', origin);

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

  if (parseOAuthState(state) && parseOAuthState(state) !== 'youtube') {
    accountsUrl.searchParams.set('error', 'state_mismatch');
    return NextResponse.redirect(accountsUrl);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.providers.youtube.clientId ?? '',
        client_secret: config.providers.youtube.clientSecret ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({})) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      const raw =
        typeof tokenData === 'string'
          ? tokenData
          : (tokenData as any).error_message ??
            (tokenData as any).error_description ??
            undefined;
      throw new Error(raw ?? 'Error intercambiando el code de Google');
    }

    const accessToken = tokenData.access_token as string;
    const expiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;
    const refreshToken = tokenData.refresh_token
      ? (tokenData.refresh_token as string)
      : null;

    let username = 'Canal de YouTube';
    const channelRes = await fetch(
      `${config.providers.youtube.baseUrl}/channels?part=snippet&mine=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (channelRes.ok) {
      const channelData = (await channelRes.json().catch(() => ({}))) as {
        items?: { snippet?: { title?: string } }[];
      };
      const channel = channelData.items?.[0];
      if (channel?.snippet?.title) username = channel.snippet.title;
    }

    const encryptedAccess = tokenService.encrypt(accessToken);
    const encryptedRefresh = refreshToken
      ? tokenService.encrypt(refreshToken)
      : null;

    const admin = createServerClient();
    const ownerId = userId;
    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', ownerId)
      .eq('provider', 'youtube')
      .eq('username', username)
      .maybeSingle();

    const record = {
      user_id: ownerId,
      provider: 'youtube',
      username,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
      scopes: ['youtube.upload', 'youtube.readonly'] as string[],
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } =
      existing?.id
        ? await admin
            .from('social_accounts')
            .update(record)
            .eq('id', existing.id)
        : await admin.from('social_accounts').insert(record);

    if (dbError) throw new Error(dbError.message);

    accountsUrl.searchParams.set('connected', 'youtube');
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback de YouTube fallo';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}

