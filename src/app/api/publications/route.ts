import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPublication } from '@/lib/publishing/publication.service';

export async function POST(req: NextRequest) {
  const { media_ids, account_ids, use_ai_captions } = await req.json();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const result = await createPublication({
    user_id: user.id,
    media_ids,
    account_ids,
    use_ai_captions: use_ai_captions ?? null,
  });
  return NextResponse.json(result);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { data: publications, error } = await supabase
    .from('publications')
    .select(`
      id,
      status,
      created_at,
      updated_at,
      publication_jobs ( id, status )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (publications ?? []).map((p: any) => {
    const jobs = p.publication_jobs ?? [];
    const total = jobs.length;
    const succeeded = jobs.filter((j: any) => j.status === 'SUCCESS' || j.status === 'COMPLETED').length;
    const failed = jobs.filter((j: any) => j.status === 'FAILED').length;
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