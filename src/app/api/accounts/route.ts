import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import {
  listAccounts,
  disconnectAccount,
  type AccountWithToken,
} from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Single-owner: nunca 401 (la app no tiene login propio).
    const userId = await getUserIdAllowDev(request);
    // FASE 11: listAccounts con provider_tokens.is_valid + expires_at + límites
    const accounts = await listAccounts(userId);

    const payload: Array<AccountWithToken & { used_today?: number }> = [];

    for (const account of accounts) {
      const { data: limits } = await createServerClient()
        .from('publish_queue')
        .select('id')
        .eq('social_account_id', account.id)
        .eq('status', 'PUBLISHED')
        .gte('created_at', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());

      payload.push({ ...account, used_today: limits?.length ?? 0 });
    }

    return NextResponse.json({ success: true, accounts: payload });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Single-owner: nunca 401 (la app no tiene login propio).
    const userId = await getUserIdAllowDev(request);
    const accountId = request.nextUrl.searchParams.get('account_id');

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'account_id es requerido' },
        { status: 400 }
      );
    }

    await disconnectAccount(accountId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

