import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Service-role: el navegador no tiene sesión (single-owner) y RLS
  // bloquearía la lectura de publications/publication_jobs.
  const supabase = createServerClient();
  const userId = await getUserIdAllowDev(_req);

  const { data: publication, error: pubError } = await supabase
    .from('publications')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (pubError || !publication) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
  }

  if (publication.user_id !== userId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Sin embeds: no hay FK publication_jobs -> media_items en la BD remota.
  const { data: jobs, error: jobsError } = await supabase
    .from('publication_jobs')
    .select('*')
    .eq('publication_id', id)
    .order('created_at', { ascending: true });

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  // Resolver relacionados con consultas separadas (batch).
  const mediaIds = [...new Set((jobs ?? []).map((j: any) => j.media_id).filter(Boolean))];
  const accountIds = [...new Set((jobs ?? []).map((j: any) => j.social_account_id).filter(Boolean))];

  const mediaMap = new Map<string, any>();
  if (mediaIds.length > 0) {
    const { data: medias } = await supabase
      .from('media_items')
      .select('id, metadata')
      .in('id', mediaIds);
    for (const m of medias ?? []) mediaMap.set(String(m.id), m);
  }

  const accountMap = new Map<string, any>();
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('id, provider, username')
      .in('id', accountIds);
    for (const ac of accounts ?? []) accountMap.set(String(ac.id), ac);
  }

  const mapped = (jobs ?? []).map((j: any) => {
    const media = mediaMap.get(String(j.media_id));
    const account = accountMap.get(String(j.social_account_id));
    const payload = (j.payload as Record<string, unknown>) ?? {};
    const metadata = (media?.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: j.id,
      mediaTitle: (metadata.title as string) ?? 'Video',
      provider: (payload.provider as string) ?? account?.provider ?? 'instagram',
      status: j.status,
      externalId: j.external_id ?? (payload.external_id as string) ?? null,
      error: (payload.error_message as string) ?? null,
      attempts: j.attempts ?? 0,
      createdAt: j.created_at,
      updatedAt: null,
    };
  });

  return NextResponse.json({ jobs: mapped, total: mapped.length });
}