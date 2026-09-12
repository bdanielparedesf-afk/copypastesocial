import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', user.id);

  if (sourcesError) {
    return NextResponse.json({ error: sourcesError.message }, { status: 500 });
  }

  const sourceIds = (sources ?? []).map((s) => s.id);

  if (sourceIds.length === 0) {
    return NextResponse.json({ mediaItems: [] });
  }

  const { data, error } = await supabase
    .from('media_items')
    .select('*')
    .in('source_id', sourceIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mediaItems: data });
}


