import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;

  const { data, error } = await supabase
    .from('publication_jobs')
    .select('id, type, status, error, payload')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Job no encontrado' }, { status: 404 });
  }

  return NextResponse.json({ success: true, job: data });
}
