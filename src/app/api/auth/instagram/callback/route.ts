import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, getLongLivedToken, getUserProfile } from '@/lib/providers/instagram/auth';
import { saveInstagramToken } from '@/lib/providers/instagram/token';
import { getUserIdAllowDev } from '@/lib/dev-auth';

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
  // El callback del provider NO puede exigir sesión previa.
  const userId = await getUserIdAllowDev(request);

  const origin = resolveOrigin(request);
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
    await saveInstagramToken(userId, {
      accessToken: longToken.accessToken,
      expiresAt: longToken.expiresAt,
      refreshToken: longToken.refreshToken,
      profile,
      scopes: [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_comments',
        'instagram_business_manage_messages',
        'instagram_business_manage_insights',
      ],
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

