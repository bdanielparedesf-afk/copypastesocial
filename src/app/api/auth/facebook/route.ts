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

  const state = buildState('facebook');
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  const scopes = ['pages_manage_posts', 'pages_read_engagement', 'publish_video'];
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
