import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { tokenService } from '@/services/TokenService';
import type { SocialAccount } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerClient();
  // Single-owner: nunca 401 (la app no tiene login propio).
  // Se valida ownership filtrando por user_id en la query.
  const ownerId = await getUserIdAllowDev(request);

  const { id } = await params;

  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', ownerId)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Cuenta no encontrada' }, { status: 404 });
  }

  const account: SocialAccount = {
    id: data.id,
    userId: data.user_id,
    provider: data.provider,
    username: data.username,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_at ?? null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    isValid: data.is_valid,
  };

  try {
    await tokenService.revoke(account);
  } catch {
    await supabase
      .from('social_accounts')
      .update({ is_valid: false, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ success: true });
}
