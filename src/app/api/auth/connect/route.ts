import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { config } from '@/config';

export const dynamic = 'force-dynamic';

const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface ProviderAuthUrl {
  url: string;
  scopes: string[];
}

function buildAuthUrl(provider: string): ProviderAuthUrl | null {
  switch (provider) {
    case 'instagram':
      return {
        url: `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth`,
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
      };
    case 'facebook':
      return {
        url: `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth`,
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'publish_video'],
      };
    case 'youtube':
      return {
        url: 'https://accounts.google.com/o/oauth2/v2/auth',
        scopes: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
        ],
      };
    case 'tiktok':
      return {
        url: 'https://www.tiktok.com/v2/auth/authorize/',
        scopes: ['video.publish', 'user.info.basic'],
      };
    default:
      return null;
  }
}

function clientIdFor(provider: string): string {
  switch (provider) {
    case 'youtube':
      return config.providers.youtube.clientId ?? '';
    case 'tiktok':
      return config.providers.tiktok.clientKey ?? '';
    case 'instagram':
    case 'facebook':
      return config.providers.facebook.appId ?? '';
    default:
      return '';
  }
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let provider: string | null = null;

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as { provider?: string };
      provider = body.provider ?? null;
    } catch {
      return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
    }
  } else {
    provider = request.nextUrl.searchParams.get('provider');
  }

  if (!provider) {
    return NextResponse.json({ error: 'Provider requerido' }, { status: 400 });
  }

  const auth = buildAuthUrl(provider);
  if (!auth) {
    return NextResponse.json({ error: 'Provider no soportado' }, { status: 400 });
  }

  const state = Buffer.from(JSON.stringify({ provider })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientIdFor(provider),
    redirect_uri: `${DEFAULT_ORIGIN}/api/auth/${provider}/callback`,
    response_type: 'code',
    scope: auth.scopes.join(','),
    state,
  });

  if (provider === 'youtube') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return NextResponse.json({ url: `${auth.url}?${params.toString()}` });
}

export { handle as GET, handle as POST };
