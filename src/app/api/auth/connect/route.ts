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

interface ProviderAuthUrl {
  url: string;
  scopes: string[];
}

function buildAuthUrl(provider: string): ProviderAuthUrl | null {
  switch (provider) {
    case 'instagram':
      return {
        url: `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth`,
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
      };
    case 'facebook':
      return {
        url: `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth`,
        // NOTA: 'publish_video' NO existe en Meta → causaba error de OAuth.
        // Para publicar video en Pages basta con pages_manage_posts (+ lectura).
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
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
        // Endpoint v2 correcto con slash final
        url: 'https://www.tiktok.com/v2/auth/authorize/',
        scopes: ['user.info.basic', 'video.publish'],
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
  // Single-owner: nunca 401 aquí (la app no tiene login propio).
  await getUserIdAllowDev(request);

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

  if (provider === 'youtube') {
    const clientId = (clientIdFor(provider) ?? '').trim();
    const clientSecret = (config.providers.youtube.clientSecret ?? '').trim();
    if (!clientId || !clientSecret || clientId.includes('your-google-client-id') || clientSecret.includes('your-google-client-secret')) {
      return NextResponse.json(
        {
          error:
            'YouTube no configurado: falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET reales en .env.local (local) y en Vercel (producción).',
        },
        { status: 500 }
      );
    }
  }

  if (provider === 'instagram' || provider === 'facebook') {
    const appId = (config.providers.facebook.appId ?? '').trim();
    const appSecret = (config.providers.facebook.appSecret ?? '').trim();
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'Meta no configurado: falta META_APP_ID / META_APP_SECRET reales en .env.local (local) y en Vercel (producción).' },
        { status: 500 }
      );
    }
  }

  if (provider === 'tiktok') {
    const key = (config.providers.tiktok.clientKey ?? '').trim();
    const secret = (config.providers.tiktok.clientSecret ?? '').trim();
    if (!key || !secret) {
      return NextResponse.json(
        { error: 'TikTok no configurado: falta TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET reales en .env.local (local) y en Vercel (producción).' },
        { status: 500 }
      );
    }
  }

  const origin = resolveOrigin(request);
  const state = Buffer.from(JSON.stringify({ provider })).toString('base64url');

  // YouTube usa scopes separados por espacio; Meta/TikTok también aceptan espacio.
  const scopeSep = provider === 'facebook' || provider === 'instagram' ? ',' : ' ';
  const params = new URLSearchParams({
    client_id: clientIdFor(provider),
    redirect_uri: `${origin}/api/auth/${provider}/callback`,
    response_type: 'code',
    scope: auth.scopes.join(scopeSep),
    state,
  });

  if (provider === 'youtube') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return NextResponse.json({ url: `${auth.url}?${params.toString()}` });
}

export { handle as GET, handle as POST };

