/**
 * FASE 12 - Helpers de autenticación para rutas.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Verifica que el usuario esté autenticado.
 * @throws Error 401 si no hay sesión.
 */
export async function requireAuth() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.user) {
    throw new Error('No autenticado');
  }

  return session;
}

/**
 * Obtiene la sesión actual si existe.
 */
export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) return null;
  return session;
}
