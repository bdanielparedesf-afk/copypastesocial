/**
 * FASE 18.2 — GET /api/publications/queue-counts
 *
 * Devuelve el conteo de publication_jobs por estado:
 * - pending: jobs en 'pending'
 * - retrying: jobs en 'retrying'
 * - success: jobs en 'success' (últimas 24h)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Contar jobs pending
    const { count: pendingCount, error: pendingError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingError) throw pendingError;

    // Contar jobs retrying
    const { count: retryingCount, error: retryingError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'retrying');

    if (retryingError) throw retryingError;

    // Contar jobs success (últimas 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: successCount, error: successError } = await supabase
      .from('publication_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'success')
      .gte('updated_at', oneDayAgo);

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
