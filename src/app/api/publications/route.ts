import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jobQueue } from '@/workers';

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('publications')
    .select('*, media_items(*), social_accounts(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const publications = (data ?? []).map((pub) => ({
    ...pub,
    mediaItem: pub.media_items,
    socialAccount: pub.social_accounts,
    media_items: undefined,
    social_accounts: undefined,
  }));

  return NextResponse.json({ publications });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { mediaItemId, socialAccountId, caption } = body;

  if (!mediaItemId || !socialAccountId || !caption) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: publication, error } = await supabase
    .from('publications')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      source_id: '00000000-0000-0000-0000-000000000000',
      social_account_id: socialAccountId,
      caption,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await jobQueue.createDownloadJob(publication.id, {
    sourceId: publication.id,
    url: '',
    provider: 'youtube',
    metadata: {},
  });

  return NextResponse.json({ publication });
}

