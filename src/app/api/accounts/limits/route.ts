import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAccountLimits } from '@/lib/accounts/manager';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('account_id');
  if (!id) return NextResponse.json({ error: 'MISSING' }, { status: 400 });
  const limits = await getAccountLimits(id);
  return NextResponse.json(limits);
}
