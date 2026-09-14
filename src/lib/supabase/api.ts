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
import { getUserIdAllowDev } from '@/lib/dev-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Usuario único cuando no hay sesión (single-owner, mismo que dev-auth). */
export const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

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
  // Single-owner: la app no tiene login propio (mismo fallback que
  // /api/accounts y el resto de rutas OAuth). Sin esto, producción devuelve
  // 401 en /api/content, /api/ai/generate y /api/sources/* (librería vacía).
  return getUserIdAllowDev();
}
