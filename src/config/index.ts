export const config = {
  app: {
    name: 'CopyPasteSocial',
    version: '0.1.0',
    description: 'Importa contenido social, elige lo importante y publícalo en tus destinos.',
  },
  providers: {
        instagram: {
      // App Facebook 1231742610032848 — aliases nuevos con fallback al META_* legacy.
      appId:
        process.env.FACEBOOK_APP_ID ??
        process.env.FACEBOOK_CLIENT_ID ??
        process.env.META_APP_ID,
      appSecret:
        process.env.FACEBOOK_APP_SECRET ??
        process.env.FACEBOOK_CLIENT_SECRET ??
        process.env.META_APP_SECRET,
      graphApiVersion: 'v19.0',
      graphApiUrl: 'https://graph.facebook.com',
    },
    youtube: {
      apiKey: process.env.GOOGLE_API_KEY,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      baseUrl: 'https://www.googleapis.com/youtube/v3',
    },
    facebook: {
      // App Facebook 1231742610032848 — aliases nuevos con fallback al META_* legacy.
      appId:
        process.env.FACEBOOK_APP_ID ??
        process.env.FACEBOOK_CLIENT_ID ??
        process.env.META_APP_ID,
      appSecret:
        process.env.FACEBOOK_APP_SECRET ??
        process.env.FACEBOOK_CLIENT_SECRET ??
        process.env.META_APP_SECRET,
      graphApiVersion: 'v19.0',
      graphApiUrl: 'https://graph.facebook.com',
    },
    tiktok: {
      clientKey: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      baseUrl: 'https://open.tiktokapis.com/v2',
    },
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  mock: {
    enabled: process.env.MOCK_MODE === 'true',
  },
  ffmpeg: {
    path: process.env.FFMPEG_PATH || 'ffmpeg',
  },
  api: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },
} as const;

export type AppConfig = typeof config;

export function isMockMode(): boolean {
  return config.mock.enabled;
}

export function getProviderConfig(provider: string) {
  return config.providers[provider as keyof typeof config.providers];
}