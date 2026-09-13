import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { tokenService } from '@/services/TokenService';
import { config } from '@/config';
import { errorFactory } from '@/utils/errors';
import type { ProviderId } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_PROVIDERS: ProviderId[] = ['instagram', 'facebook', 'youtube', 'tiktok'];
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

function getProviderFromUrl(req: NextRequest): ProviderId | null {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const index = segments.indexOf('auth');
  const candidate = index >= 0 ? segments[index + 1] : null;
  if (!candidate) return null;
  return VALID_PROVIDERS.includes(candidate as ProviderId) ? (candidate as ProviderId) : null;
}

interface TokenData {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  username: string;
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = getProviderFromUrl(req);
  if (!provider) {
    return NextResponse.json({ error: 'Provider no soportado' }, { status: 400 });
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  const accountsUrl = new URL('/accounts', req.nextUrl.origin);

  if (errorParam) {
    accountsUrl.searchParams.set('error', errorParam);
    return NextResponse.redirect(accountsUrl);
  }

  if (!code) {
    accountsUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(accountsUrl);
  }

  let stateProvider: string | null = null;
  try {
    const parsed = state ? JSON.parse(Buffer.from(state, 'base64url').toString()) : null;
    if (parsed && typeof parsed.provider === 'string') {
      stateProvider = parsed.provider;
    }
  } catch {
    // state inválido: se usa el provider de la URL
  }

  if (stateProvider && stateProvider !== provider) {
    accountsUrl.searchParams.set('error', 'state_mismatch');
    return NextResponse.redirect(accountsUrl);
  }

  try {
    let tokenData: TokenData;

    if (provider === 'instagram' || provider === 'facebook') {
      tokenData = await exchangeMetaToken(code, provider, req);
    } else if (provider === 'youtube') {
      tokenData = await exchangeYouTubeToken(code, req);
    } else {
      tokenData = await exchangeTikTokToken(code, req);
    }

    const encryptedAccess = tokenService.encrypt(tokenData.accessToken);
    const encryptedRefresh = tokenData.refreshToken ? tokenService.encrypt(tokenData.refreshToken) : null;

    const admin = createServerClient();

    const { data: existing } = await admin
      .from('social_accounts')
      .select('id')
      .eq('user_id', DEMO_USER_ID)
      .eq('provider', provider)
      .eq('username', tokenData.username)
      .maybeSingle();

    const record = {
      user_id: DEMO_USER_ID,
      provider,
      username: tokenData.username,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: tokenData.expiresAt,
      scopes: ['publish_video', 'read_insights'] as string[],
      is_valid: true,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existing?.id
      ? await admin.from('social_accounts').update(record).eq('id', existing.id)
      : await admin.from('social_accounts').insert(record);

    if (dbError) {
      throw errorFactory({
        provider,
        status: 500,
        message: `Error al guardar la cuenta: ${dbError.message}`,
        body: dbError,
      });
    }

    accountsUrl.searchParams.set('connected', provider);
    return NextResponse.redirect(accountsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback falló';
    accountsUrl.searchParams.set('error', message);
    return NextResponse.redirect(accountsUrl);
  }
}

async function exchangeMetaToken(
  code: string,
  provider: 'instagram' | 'facebook',
  req: NextRequest
): Promise<TokenData> {
  const cfg = config.providers.facebook;
  const redirectUri = `${req.nextUrl.origin}/api/auth/${provider}/callback`;

  // 1) Intercambia el code por un access_token de corta duración
  const tokenParams = new URLSearchParams({
    client_id: cfg.appId ?? '',
    client_secret: cfg.appSecret ?? '',
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/oauth/access_token?${tokenParams}`);
  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !tokenData.access_token) {
    throw errorFactory({
      provider,
      status: tokenRes.status,
      message: 'Error intercambiando el code de Meta',
      body: tokenData,
    });
  }

  // 2) Long-lived token exchange (fb_exchange_token)
  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: cfg.appId ?? '',
    client_secret: cfg.appSecret ?? '',
    fb_exchange_token: tokenData.access_token as string,
  });

  let accessToken = tokenData.access_token as string;
  let expiresAt: string | null = null;

  const longRes = await fetch(`${cfg.graphApiUrl}/${cfg.graphApiVersion}/oauth/access_token?${longParams}`);
  if (longRes.ok) {
    const longData = await longRes.json().catch(() => ({}));
    if (longData.access_token) {
      accessToken = longData.access_token as string;
    }
    if (longData.expires_in) {
      expiresAt = new Date(Date.now() + Number(longData.expires_in) * 1000).toISOString();
    }
  }

  if (!expiresAt && tokenData.expires_in) {
    expiresAt = new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString();
  }

  // 3) Nombre de usuario
  let username = provider === 'instagram' ? 'Instagram' : 'Facebook';
  const userRes = await fetch(
    `${cfg.graphApiUrl}/${cfg.graphApiVersion}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  );
  if (userRes.ok) {
    const userData = await userRes.json().catch(() => ({}));
    username = userData.name ?? userData.id ?? username;
  }

  return { accessToken, refreshToken: null, expiresAt, username };
}

async function exchangeYouTubeToken(code: string, req: NextRequest): Promise<TokenData> {
  const cfg = config.providers.youtube;
  const redirectUri = `${req.nextUrl.origin}/api/auth/youtube/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId ?? '',
      client_secret: cfg.clientSecret ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !tokenData.access_token) {
    throw errorFactory({
      provider: 'youtube',
      status: tokenRes.status,
      message: 'Error intercambiando el code de Google',
      body: tokenData,
    });
  }

  let username = 'Canal de YouTube';
  const channelRes = await fetch(`${cfg.baseUrl}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (channelRes.ok) {
    const channelData = await channelRes.json().catch(() => ({}));
    const channel = channelData.items?.[0];
    if (channel?.snippet?.title) {
      username = channel.snippet.title as string;
    }
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  return {
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token ? (tokenData.refresh_token as string) : null,
    expiresAt,
    username,
  };
}

async function exchangeTikTokToken(code: string, req: NextRequest): Promise<TokenData> {
  const cfg = config.providers.tiktok;
  const redirectUri = `${req.nextUrl.origin}/api/auth/tiktok/callback`;

  const tokenRes = await fetch(`${cfg.baseUrl}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: cfg.clientKey ?? '',
      client_secret: cfg.clientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const body = await tokenRes.json().catch(() => ({}));
  const data = body.data ?? body;

  if (!tokenRes.ok || !data.access_token) {
    throw errorFactory({
      provider: 'tiktok',
      status: tokenRes.status,
      message: 'Error intercambiando el code de TikTok',
      body,
    });
  }

  let username = data.open_id ?? 'Cuenta de TikTok';
  const userRes = await fetch(`${cfg.baseUrl}/user/info/?fields=open_id,display_name`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (userRes.ok) {
    const userData = await userRes.json().catch(() => ({}));
    const user = userData.data?.user;
    if (user?.display_name) {
      username = user.display_name as string;
    } else if (user?.open_id) {
      username = user.open_id as string;
    }
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token ? (data.refresh_token as string) : null,
    expiresAt,
    username,
  };
}