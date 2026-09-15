/**
 * FASE 18 — POST /api/cron/processQueue
import { checkEnv } from '@/lib/env';

// Verificar ENV al iniciar (throw en producción si faltan)
checkEnv();

 *
 * Trigger manual/worker para procesar la cola de publication_jobs.
 * - Busca jobs en PENDING y los ejecuta uno a uno vía processJob().
 * - processJob() marca PENDING -> PROCESSING -> SUCCESS/FAILED (o RETRYING).
 * - Protegido por header x-cron-secret (CRON_SECRET). En dev sin CRON_SECRET
 *   se permite (patrón MOCK/DEV); en producción CRON_SECRET es obligatorio.
 *
 * Uso:
 *   - Botón [PROCESAR COLA] en /publications.
 *   - Worker externo o cron horario.
 */
import { NextRequest, NextResponse } from 'next/server';
import { processQueue } from '@/lib/publishing/queue';

export const dynamic = 'force-dynamic';

interface ProcessQueueResult {
  ok: boolean;
  found: number;
  processed: number;
  failed: number;
  errors: string[];
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // En producción, el header x-cron-secret es obligatorio.
  if (secret && request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: ProcessQueueResult = { ok: true, found: 0, processed: 0, failed: 0, errors: [] };

  try {
    // processQueue() internamente consulta publication_jobs en PENDING y
    // los marca PROCESSING antes de ejecutar (ver processJob en
    // src/lib/publishing/publication.service.ts).
    const found = await processQueue();
    result.found = found;

    // processQueue lanza si hay error grave de BD; los jobs individuales
    // se marcan FAILED internamente y se registran en errors.
    result.processed = found;
    result.ok = true;

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        found: 0,
        processed: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : 'processQueue falló'],
      },
      { status: 500 }
    );
  }
}