import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAuthUrl } from '@/lib/providers/instagram/auth';

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

  const state = buildState('instagram');
  const redirectUri = `${origin}/api/auth/instagram/callback`;

  const url = getAuthUrl({ redirectUri, state });

  return NextResponse.json({ url, state, redirectUri });
}

export { handle as GET, handle as POST };
