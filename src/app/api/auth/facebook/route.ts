import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { buildOAuthState, canonicalOrigin, redirectUriFor } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  const origin = canonicalOrigin(request.nextUrl?.origin);

  const state = buildOAuthState('facebook');
  // URI canónica = la registrada en Facebook Developers
  // (Productos > Facebook Login > URI de redirección válidos).
  const redirectUri = redirectUriFor('facebook', origin);

  // Business Login con config_id (Graph v20.0).
  // Los scopes de Instagram Business ya vienen incluidos en el config_id
  // 1432189552393923 configurado en Meta Developer Dashboard.
  // NO añadir scope=instagram_business_* a la URL — causaba "Invalid Scopes".
  const APP_ID = '1231742610032848';
  const CONFIG_ID = '1432189552393923';
  const REDIRECT_URI = 'https://copypastesocial.vercel.app/api/auth/callback/facebook';

  const url = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${APP_ID}&config_id=${CONFIG_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=${state}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

