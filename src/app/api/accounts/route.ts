import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tokenService } from '@/services/TokenService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('social_accounts')
      .select('id, provider, username, is_valid, expires_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, accounts: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, username, accessToken, refreshToken, expiresAt, scopes } = body;

    if (!provider || !username || !accessToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const encryptedAccess = tokenService.encrypt(accessToken);
    const encryptedRefresh = refreshToken ? tokenService.encrypt(refreshToken) : null;

    const { data, error } = await supabase
      .from('social_accounts')
      .upsert({
        user_id: crypto.randomUUID(),
        provider,
        username,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        expires_at: expiresAt ?? null,
        scopes: scopes ?? [],
        is_valid: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider,username' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ account: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
