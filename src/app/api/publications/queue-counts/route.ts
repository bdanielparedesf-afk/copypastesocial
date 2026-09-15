/**
 * FASE 18.2 — GET /api/publications/queue-counts
 *
 * Devuelve el conteo de publication_jobs por estado:
 * - pending: jobs en 'pending'
 * - retrying: jobs en 'retrying'
 * - success: jobs en 'success' (últimas 24h)
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    // Single-owner: nunca 401 (la app no tiene login propio).
    await getUserIdAllowDev();

    // Contar jobs pending
    const { count: pendingCount, error: pendingError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingError) throw pendingError;

    // Contar jobs retrying (estado no soportado por el CHECK actual de BD:
    // siempre será 0, se mantiene por compatibilidad con la UI)
    const { count: retryingCount, error: retryingError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'retrying');

    if (retryingError) throw retryingError;

    // Contar jobs completed (últimas 24h). La tabla no tiene updated_at,
    // se usa created_at como referencia temporal.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: successCount, error: successError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', oneDayAgo);

    if (successError) throw successError;

    return NextResponse.json({
      pending: pendingCount ?? 0,
      retrying: retryingCount ?? 0,
      success: successCount ?? 0,
    });
  } catch (error) {
    console.error('Error en GET /api/publications/queue-counts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener conteos' },
      { status: 500 }
    );
  }
}
