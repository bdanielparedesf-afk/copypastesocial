import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Single-owner: nunca 401 (la app no tiene login propio).
  const user = { id: await getUserIdAllowDev(request) };

  const supabase = createServerClient();
  const { error } = await supabase
    .from('social_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

