/**
 * Helper de auth para rutas API.
 * En local/dev sin login de Supabase Auth, cae al usuario de desarrollo
 * (mismo patrón que actions/publish.ts) para que /accounts y OAuth funcionen.
 * En producción exige sesión real.
 */
import { supabase, createServerClient } from '@/lib/supabase';

export const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function getUserIdAllowDev(): Promise<string | null> {
  try {
    const client = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createServerClient()
      : supabase;
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // sin sesión
  }
  if (process.env.NODE_ENV !== 'production') return DEV_USER_ID;
  return null;
}
