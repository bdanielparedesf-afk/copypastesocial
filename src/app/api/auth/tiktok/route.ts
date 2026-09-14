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

  const state = buildState('tiktok');
  const redirectUri = `${origin}/api/auth/tiktok/callback`;

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

