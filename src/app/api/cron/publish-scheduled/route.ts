/**
 * FASE 10 — POST /api/cron/publish-scheduled
 *
 * Cron que publica los items de la cola que ya vencieron:
 *   - getDueItems() → PENDING o SCHEDULED con scheduled_at <= now().
 *   - processPost(item) → createContainer → polling 5s → publishContainer.
 *
 * Protegido por header `x-cron-secret` (CRON_SECRET). En dev sin CRON_SECRET
 * se permite (patrón MOCK/DEV); en producción CRON_SECRET es obligatorio.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDueItems, processPost } from '@/lib/publishing';

export const dynamic = 'force-dynamic';

interface CronPublishResult {
  ok: boolean;
  found: number;
  published: number;
  failed: number;
  errors: string[];
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // En producción, el header x-cron-secret es obligatorio.
  if (secret && request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: CronPublishResult = { ok: true, found: 0, published: 0, failed: 0, errors: [] };

  try {
    const due = await getDueItems({ limit: 10 });
    result.found = due.length;

    for (const item of due) {
      try {
        await processPost(item.id);
        result.published += 1;
      } catch (err) {
        result.failed += 1;
        result.errors.push(
          `${item.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    result.ok = result.published > 0 || result.failed === 0;
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        found: 0,
        published: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : 'Cron publish-scheduled falló'],
      },
      { status: 500 }
    );
  }
}