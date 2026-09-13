import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processQueue } from '@/lib/publishing/queue';

export async function POST(req: NextRequest) {
  const { failed_ids } = await req.json();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  if (!Array.isArray(failed_ids) || failed_ids.length === 0) {
    return NextResponse.json({ error: 'failed_ids is required' }, { status: 400 });
  }

  const { data: jobs, error: fetchError } = await supabase
    .from('publication_jobs')
    .select('id, publication_id')
    .in('id', failed_ids);

  if (fetchError || !jobs) {
    return NextResponse.json({ error: 'Jobs not found' }, { status: 404 });
  }

  const publicationIds = [...new Set(jobs.map((j) => j.publication_id))];
  const { data: pubs, error: pubError } = await supabase
    .from('publications')
    .select('id')
    .in('id', publicationIds)
    .eq('user_id', user.id);

  if (pubError || !pubs || pubs.length !== publicationIds.length) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { error: resetError } = await supabase
    .from('publication_jobs')
    .update({
      status: 'PENDING',
      error_message: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .in('id', failed_ids);

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  try {
    await processQueue();
  } catch {
    /* background processor will handle it */
  }

  return NextResponse.json({ success: true, retried: failed_ids.length });
}
