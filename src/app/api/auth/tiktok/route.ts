import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { config } from '@/config';

export const dynamic = 'force-dynamic';

const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function buildState(provider: string): string {
  return Buffer.from(JSON.stringify({ provider, ts: Date.now() })).toString('base64url');
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = request.nextUrl?.origin ?? DEFAULT_ORIGIN;

  const state = buildState('tiktok');
  const redirectUri = `${origin}/api/auth/tiktok/callback`;

  const params = new URLSearchParams({
    client_key: config.providers.tiktok.clientKey ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'video.publish user.info.basic',
  });
  params.set('state', state);

  const url = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };
