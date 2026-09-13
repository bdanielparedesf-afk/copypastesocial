/**
 * FASE 7 — POST /api/sources/import
 * Body: { url: string }
 * Importa una fuente accesible a la librería usando importFromSource
 * (detect → check → fetch → dedup → persistir). El dedup es OBLIGATORIO:
 * los items ya existentes se saltan y se reportan en la respuesta.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { importFromSource } from '@/services/import-service';
import { resolveUserId } from '@/lib/supabase/api';

const BodySchema = z.object({
  url: z.string().min(1, 'La URL es obligatoria'),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const userId = await resolveUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'URL inválida' },
      { status: 400 }
    );
  }

  try {
    const userId = await resolveUserId();
    const result = await importFromSource(parsed.data.url, userId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: 'unsupported',
        url: parsed.data.url,
        accessibility: 'ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error al importar la fuente.',
        sourceId: null,
        persisted: false,
        alreadyImported: false,
        imported: 0,
        duplicatesSkipped: 0,
        duplicates: [],
        mediaItems: [],
      },
      { status: 500 }
    );
  }
}
