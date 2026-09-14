/**
 * FASE 20 — Verificación de variables de entorno obligatorias.
 *
 * En producción, faltar cualquiera de estas ENV es crítico y debe lanzar error
 * en el primer request (layout/cron).
 *
 * Meta: App Facebook 1231742610032848 — acepta aliases nuevos
 * (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET) o legacy (META_APP_*).
 */
export function checkEnv() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length && process.env.NODE_ENV === 'production') {
    throw new Error(`Falta ENV: ${missing.join(',')}`);
  }
  const hasMetaApp =
    Boolean(process.env.FACEBOOK_APP_ID ?? process.env.FACEBOOK_CLIENT_ID ?? process.env.META_APP_ID) &&
    Boolean(
      process.env.FACEBOOK_APP_SECRET ??
        process.env.FACEBOOK_CLIENT_SECRET ??
        process.env.META_APP_SECRET
    );
  if (!hasMetaApp && process.env.NODE_ENV === 'production') {
    throw new Error('Falta ENV: FACEBOOK_APP_ID / FACEBOOK_APP_SECRET (o META_APP_ID / META_APP_SECRET)');
  }
}

