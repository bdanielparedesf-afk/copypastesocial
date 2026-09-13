import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  void params.provider;
  const body = await req.json();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { external_id, status, error_message } = body;
  if (!external_id) return NextResponse.json({ ok: true });

  await supabase
    .from('publication_jobs')
    .update({
      status: status === 'published' ? 'SUCCESS' : 'FAILED',
      error_message,
    })
    .eq('external_id', external_id);

  return NextResponse.json({ ok: true });
}
