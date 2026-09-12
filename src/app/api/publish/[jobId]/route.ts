import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
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