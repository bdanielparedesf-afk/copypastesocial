import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { getAuthUrl } from '@/lib/providers/instagram/auth';
import { buildOAuthState, canonicalOrigin, redirectUriFor } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);

  const state = buildOAuthState('instagram');
  // Instagram comparte el Login de Meta: la URI canónica es la misma que
  // Facebook (/api/auth/callback/facebook); el callback distingue por state.
  const redirectUri = redirectUriFor('instagram', origin);

  const url = getAuthUrl({ redirectUri, state });

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

