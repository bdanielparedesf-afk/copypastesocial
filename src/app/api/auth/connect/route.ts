import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { redirectUriFor } from '@/lib/oauth';

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
        scopes: [
          'public_profile',
          'pages_show_list',
          'pages_read_engagement',
          'instagram_business_basic',
          'instagram_business_content_publish',
          'instagram_business_manage_comments',
          'instagram_business_manage_messages',
          'instagram_business_manage_insights',
        ],
      };
    case 'facebook':
      return {
        url: `https://www.facebook.com/${config.providers.facebook.graphApiVersion}/dialog/oauth`,
        // NOTA: 'publish_video' NO existe en Meta → causaba error de OAuth.
        // App 1231742610032848 (Graph v19.0): Pages + Instagram Business.
        scopes: [
          'public_profile',
          'pages_show_list',
          'pages_read_engagement',
          'pages_manage_posts',
          'pages_manage_engagement',
          'instagram_business_basic',
          'instagram_business_content_publish',
          'instagram_business_manage_comments',
          'instagram_business_manage_messages',
          'instagram_business_manage_insights',
        ],
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

  // URL canónica del redirect_uri por provider (lee @/lib/oauth).
  // Meta (FB+IG) usa una sola URI: /api/auth/callback/facebook ; el resto usa
  // /api/auth/<provider>/callback. Esto debe coincidir EXACTO con lo registrado
  // en cada consola del provider para evitar "El dominio de esta URL no está
  // incluido en los dominios de la app" en Facebook.
  const redirectUri = redirectUriFor(
    provider as 'facebook' | 'instagram' | 'tiktok' | 'youtube',
    origin
  );

  // YouTube usa scopes separados por espacio; Meta/TikTok también aceptan espacio.
  const scopeSep = provider === 'facebook' || provider === 'instagram' ? ',' : ' ';
  const params = new URLSearchParams({
    client_id: clientIdFor(provider),
    redirect_uri: redirectUri,
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

