import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { buildOAuthState, canonicalOrigin, redirectUriFor } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  const clientId = (config.providers.youtube.clientId ?? '').trim();
  const clientSecret = (config.providers.youtube.clientSecret ?? '').trim();
  if (
    !clientId ||
    !clientSecret ||
    clientId.includes('your-google-client-id') ||
    clientSecret.includes('your-google-client-secret')
  ) {
    return NextResponse.json(
      {
        error:
          'YouTube no configurado: falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET reales en .env.local (local) y en Vercel (producción).',
      },
      { status: 500 }
    );
  }

  // Supabase check (no bloquea, pero valida que el cliente existe)
  try {
    createServerClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Supabase no configurado' },
      { status: 500 }
    );
  }

  const origin = canonicalOrigin(request.nextUrl?.origin);

  const state = buildOAuthState('youtube');
  const redirectUri = redirectUriFor('youtube', origin);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });
  params.set('state', state);

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

