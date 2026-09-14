import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';

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

function buildState(provider: string): string {
  return Buffer.from(JSON.stringify({ provider, ts: Date.now() })).toString('base64url');
}

async function handle(request: NextRequest): Promise<NextResponse> {
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

  const origin = resolveOrigin(request);

  const state = buildState('facebook');
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  // Scopes válidos de Meta. 'publish_video' NO existe → se eliminó.
  const scopes = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'];
  const params = new URLSearchParams({
    client_id: config.providers.facebook.appId ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(','),
  });
  params.set('state', state);

  const url = `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth?${params.toString()}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };

