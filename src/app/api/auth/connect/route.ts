import { NextRequest, NextResponse } from 'next/server';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { config } from '@/config';
import { buildOAuthState, redirectUriFor, TIKTOK_AUTH_URL, TIKTOK_SCOPES } from '@/lib/oauth';

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
  appId?: string;
  configId?: string;
}

function buildAuthUrl(provider: string): ProviderAuthUrl | null {
  const metaBase = 'https://www.facebook.com/v20.0/dialog/oauth';
  const APP_ID = '1231742610032848';
  const CONFIG_ID = '1432189552393923';

  switch (provider) {
    case 'instagram':
    case 'facebook': {
      // Business Login con config_id (Graph v20.0).
      // Los scopes de Instagram Business ya vienen incluidos en el config_id
      // 1432189552393923 configurado en Meta Developer Dashboard.
      // NO añadir scope=instagram_business_* — causaba "Invalid Scopes".
      return {
        url: metaBase,
        scopes: [], // vacío: los permisos vienen del config_id
        appId: APP_ID,
        configId: CONFIG_ID,
      };
    }
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
        // Endpoint v2 de Login Kit (slash final obligatorio).
        url: TIKTOK_AUTH_URL,
        // TikTok espera los scopes separados por COMAS.
        scopes: TIKTOK_SCOPES.split(','),
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
  // State firmado (HMAC + timestamp) — mismo formato que /api/auth/<provider>,
  // requerido por los callbacks (validación anti-CSRF).
  const state = buildOAuthState(provider);

  // URL canónica del redirect_uri por provider (lee @/lib/oauth).
  // Meta (FB+IG) usa una sola URI: /api/auth/callback/facebook ; el resto usa
  // /api/auth/<provider>/callback. Esto debe coincidir EXACTO con lo registrado
  // en cada consola del provider para evitar "El dominio de esta URL no está
  // incluido en los dominios de la app" en Facebook.
  const redirectUri = redirectUriFor(
    provider as 'facebook' | 'instagram' | 'tiktok' | 'youtube',
    origin
  );

  // Construcción de la URL de auth por provider.
  const auth = buildAuthUrl(provider);
  if (!auth) {
    return NextResponse.json({ error: 'Provider no soportado' }, { status: 400 });
  }

  let authUrl: string;
  if (provider === 'facebook' || provider === 'instagram') {
    // Business Login con config_id (Graph v20.0).
    const { appId, configId } = auth as { appId: string; configId: string };
    authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&config_id=${configId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
  } else {
    // YouTube / TikTok: construir con scopes tradicionales.
    // TikTok y Meta esperan la lista de scopes separada por COMAS;
    // Google (YouTube) la espera separada por espacios.
    const scopeSep = provider === 'youtube' ? ' ' : ',';
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: auth.scopes.join(scopeSep),
      state,
    });
    // TikTok usa 'client_key' en lugar de 'client_id' (Login Kit v2).
    const clientIdParam = provider === 'tiktok' ? 'client_key' : 'client_id';
    params.set(clientIdParam, clientIdFor(provider));
    if (provider === 'youtube') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    }
    authUrl = `${auth.url}?${params.toString()}`;
  }

  return NextResponse.json({ url: authUrl });
}

export { handle as GET, handle as POST };

