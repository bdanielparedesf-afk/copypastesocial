/**
 * FASE 20 — Verificación de variables de entorno obligatorias.
 *
 * En producción, faltar cualquiera de estas ENV es crítico y debe lanzar error
 * en el primer request (layout/cron).
 */
export function checkEnv() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length && process.env.NODE_ENV === 'production') {
    throw new Error(`Falta ENV: ${missing.join(',')}`);
  }
}
