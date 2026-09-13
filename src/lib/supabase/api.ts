/**
 * FASE 7 — Helpers de API para rutas que consultan Supabase server-side.
 *
 * - getDbClient(): prefiere el cliente service-role (misma estrategia que
 *   import-service.getSupabase) y cae al cliente anon si no hay clave.
 *   El service-role bypassa RLS, por lo que TODAS las queries deben filtrar
 *   explícitamente por user_id.
 * - resolveUserId(): usa la sesión de Supabase Auth si existe; si no (dev sin
 *   login), cae al usuario de desarrollo (mismo patrón que publish.ts).
 */
import { supabase, createServerClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Usuario de desarrollo usado cuando no hay sesión activa (patrón publish.ts). */
export const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

export function getDbClient(): SupabaseClient {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      return createServerClient();
    } catch {
      // Sin clave válida → continuar con el cliente anon (RLS aplica).
    }
  }
  return supabase;
}

export async function resolveUserId(): Promise<string> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // sin sesión activa
  }
  return '';
}
