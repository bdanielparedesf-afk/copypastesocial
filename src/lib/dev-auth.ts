/**
 * Helper de auth para rutas API.
 *
 * La app no tiene login de Supabase Auth (no hay UI de sesión), por lo que
 * exigir sesión real en producción devuelve 401 y rompe todos los botones
 * "Iniciar sesión con ...".
 *
 * Estrategia unificada (local + Vercel):
 *  1. Intenta sesión real de Supabase si el request trae JWT (Authorization
 *     Bearer) o cookies — si existe, usa ese user.id.
 *  2. Si no hay sesión, cae al OWNER anónimo único compartido por toda la
 *     app (single-owner mode). TODAS las rutas deben usar ESTA constante,
 *     nunca literales distintos, para no fragmentar cuentas por user_id.
 */
import { supabase, createServerClient } from '@/lib/supabase';

/** Owner único cuando no hay login (mismo en dev y prod). */
export const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
/** Alias semántico: la app trabaja en modo single-owner sin login. */
export const ANONYMOUS_OWNER_ID = DEV_USER_ID;

function extractJwt(request?: Request): string | null {
  if (!request) return null;
  try {
    const auth = request.headers.get('authorization') ?? '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
    const cookie = request.headers.get('cookie') ?? '';
    const sbMatch = cookie.match(/sb-[^=]*-auth-token=([^;]+)/);
    if (sbMatch?.[1]) {
      try {
        const decoded = decodeURIComponent(sbMatch[1]);
        const parsed = JSON.parse(decoded) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // cookie no parseable → ignorar
      }
    }
  } catch {
    // sin headers
  }
  return null;
}

async function userIdFromJwt(jwt: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (user?.id) return user.id;
  } catch {
    // token inválido
  }
  return null;
}

/**
 * Devuelve el user.id real si hay sesión, o el owner anónimo.
 * NUNCA devuelve null: las rutas OAuth/cuentas no deben dar 401 porque
 * la app no tiene pantalla de login.
 */
export async function getUserIdAllowDev(request?: Request): Promise<string> {
  // 1) JWT explícito del request (cuando el frontend loguee en el futuro)
  const jwt = extractJwt(request);
  if (jwt) {
    const id = await userIdFromJwt(jwt);
    if (id) return id;
  }
  // 2) Sesión ambiente del cliente (local dev con supabase-js persistente)
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
  // 3) Fallback single-owner (funciona en dev y en producción/Vercel)
  return DEV_USER_ID;
}

/** Alias con nombre más claro para rutas nuevas. */
export const getOwnerId = getUserIdAllowDev;

