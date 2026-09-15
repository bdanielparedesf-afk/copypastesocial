import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { createPublication } from '@/lib/publishing/publication.service';

export async function POST(req: NextRequest) {
  const { media_ids, account_ids, use_ai_captions } = await req.json();
  // Single-owner: la app no tiene login propio; sin esto la ruta devuelve
  // siempre 401 y el botón "Publicar" nunca funciona (ni en dev ni en Vercel).
  const userId = await getUserIdAllowDev(req);

  const result = await createPublication({
    user_id: userId,
    media_ids,
    account_ids,
    use_ai_captions: use_ai_captions ?? null,
  });
  return NextResponse.json(result);
}

export async function GET() {
  // Service-role: publications/publication_jobs se leen por user_id explícito.
  const supabase = createServerClient();
  const userId = await getUserIdAllowDev();

  const { data: publications, error } = await supabase
    .from('publications')
    .select(`
      id,
      status,
      created_at,
      updated_at,
      publication_jobs ( id, status )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (publications ?? []).map((p: any) => {
    const jobs = p.publication_jobs ?? [];
    const total = jobs.length;
    // Estados reales en BD (CHECK): pending | running | completed | failed.
    const succeeded = jobs.filter((j: any) => j.status === 'completed').length;
    const failed = jobs.filter((j: any) => j.status === 'failed').length;
    return {
      id: p.id,
      status: p.status,
      total_jobs: total,
      succeeded_jobs: succeeded,
      failed_jobs: failed,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({ success: true, publications: mapped });
}