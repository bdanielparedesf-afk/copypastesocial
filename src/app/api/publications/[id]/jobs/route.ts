import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { data: publication, error: pubError } = await supabase
    .from('publications')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (pubError || !publication) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (publication.user_id !== user.id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('publication_jobs')
    .select('*, media_items(title), social_accounts(provider)')
    .eq('publication_id', id)
    .order('created_at', { ascending: true });

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const mapped = (jobs ?? []).map((j: any) => {
    const media = Array.isArray(j.media_items) ? j.media_items[0] : j.media_items;
    const account = Array.isArray(j.social_accounts)
      ? j.social_accounts[0]
      : j.social_accounts;
    return {
      id: j.id,
      mediaTitle: media?.title ?? 'Video',
      provider: account?.provider ?? 'instagram',
      status: j.status,
      externalId: j.external_id ?? null,
      error: j.error_message ?? null,
      attempts: j.attempts ?? 0,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    };
  });

  return NextResponse.json({ jobs: mapped, total: mapped.length });
}