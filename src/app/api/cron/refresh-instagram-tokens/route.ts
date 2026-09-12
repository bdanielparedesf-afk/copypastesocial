/**
 * FASE 9 — POST /api/cron/refresh-instagram-tokens
 *
 * Job cron que refresca los tokens de Instagram a < = 5 días de expirar
 * (`refreshExpiringTokens` con REFRESH_THRESHOLD_DAYS = 5). Usa
 * fb_exchange_token → extiende el long-lived a ~60 días.
 *
 * Protegido por header `x-cron-secret` (CRON_SECRET). En dev sin CRON_SECRET
 * se permite ejecutar (patrón MOCK_MODE); en producción CRON_SECRET debe
 * existir SIEMPRE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshExpiringTokens } from '@/lib/providers/instagram/token';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // En producción, el header x-cron-secret es obligatorio.
  if (secret && request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await refreshExpiringTokens({ thresholdDays: 5 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Refresh job falló' },
      { status: 500 }
    );
  }
}