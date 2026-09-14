import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { buildOAuthState, canonicalOrigin, redirectUriFor } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);

  const state = buildOAuthState('tiktok');
  const redirectUri = redirectUriFor('tiktok', origin);

  const params = new URLSearchParams({
    client_key: config.providers.tiktok.clientKey ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    // Orden canónico TikTok: user.info.basic primero
    scope: 'user.info.basic video.publish',
  });
  params.set('state', state);

  const url = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

