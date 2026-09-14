import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserIdAllowDev } from '@/lib/dev-auth';
import { switchAccount } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  account_id: z.string().uuid('account_id debe ser un UUID'),
});

export async function POST(request: NextRequest) {
  // Single-owner: nunca 401 (la app no tiene login propio).
  const userId = await getUserIdAllowDev(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Body inválido' },
      { status: 400 }
    );
  }

  const { account_id: accountId } = parsed.data;

  try {
    const result = await switchAccount(accountId, userId);

    // Set cookie de sesión activa (workspace): active_account_id
    const response = NextResponse.json({ success: true, account: result.account });
    response.cookies.set('active_account_id', accountId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 días
    });

    return response;
  } catch (error) {
    const status = error instanceof Error && /no encontrada|sin permisos/i.test(error.message) ? 404 : 401;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error al cambiar de cuenta' },
      { status }
    );
  }
}