/**
 * FASE 19 — GET /api/analytics/stats
 *
 * Retorna metricas de publication_jobs agrupadas por provider y status,
 * mas datos para grafico de ultimos 7 dias y ultimos 20 fallos.
 *
 * FASE 20: Auth 401 si no hay usuario.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = createServerClient();
  const {
    data: { user },
  } = await admin.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. GROUP BY provider, status — conteos para cards de plataforma
  const { data: groupData, error: groupError } = await admin
    .from('publication_jobs')
    .select('provider, status');

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Agregar en memoria: { provider: { success: n, failed: n, pending: n, total: n } }
  const platformStats: Record<string, { success: number; failed: number; pending: number; retrying: number; total: number }> = {};

  for (const row of groupData ?? []) {
    const provider = (row.provider ?? 'unknown').toLowerCase();
    const status = (row.status ?? 'unknown').toLowerCase();

    if (!platformStats[provider]) {
      platformStats[provider] = { success: 0, failed: 0, pending: 0, retrying: 0, total: 0 };
    }
    platformStats[provider].total++;

    if (status === 'success' || status === 'completed') {
      platformStats[provider].success++;
    } else if (status === 'failed') {
      platformStats[provider].failed++;
    } else if (status === 'retrying') {
      platformStats[provider].retrying++;
    } else {
      platformStats[provider].pending++;
    }
  }

  // 2. Ultimos 7 dias — success vs failed por dia
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();

  const { data: dailyData, error: dailyError } = await admin
    .from('publication_jobs')
    .select('status, created_at')
    .gte('created_at', sevenDaysAgoISO);

  if (dailyError) {
    return NextResponse.json({ error: dailyError.message }, { status: 500 });
  }

  // Agregar por dia
  const dailyMap: Record<string, { date: string; success: number; failed: number }> = {};
  for (const row of dailyData ?? []) {
    const day = (row.created_at ?? '').slice(0, 10);
    if (!day) continue;
    if (!dailyMap[day]) {
      dailyMap[day] = { date: day, success: 0, failed: 0 };
    }
    const status = (row.status ?? '').toLowerCase();
    if (status === 'success' || status === 'completed') {
      dailyMap[day].success++;
    } else if (status === 'failed') {
      dailyMap[day].failed++;
    }
  }

  const dailyStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // 3. Ultimos 20 fallos con error_message
  const { data: recentFailures, error: failuresError } = await admin
    .from('publication_jobs')
    .select('id, provider, status, error_message, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(20);

  if (failuresError) {
    return NextResponse.json({ error: failuresError.message }, { status: 500 });
  }

  return NextResponse.json({
    platformStats,
    dailyStats,
    recentFailures: recentFailures ?? [],
  });
}
