/**
 * FASE 8 — POST /api/media/process
 *
 * Body: { mediaItemId: string (uuid) }
 * Valida UUID + ownership (user_id = auth user, vía sources) y dispara el
 * procesamiento raw -> processed. Retorna { processed_url }.
 *
 * REGLA: requiere runtime Node (child_process para FFmpeg).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { processMediaItem } from '@/lib/media/processor';
import { getUserIdAllowDev } from '@/lib/dev-auth';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

const BodySchema = z.object({
  mediaItemId: z.string().uuid('mediaItemId debe ser un UUID válido'),
});

export async function POST(request: Request) {
  // 1) Auth — single-owner: nunca 401 (la app no tiene login propio).
  const userId = await getUserIdAllowDev(request);
  // Service-role: la consulta de ownership con cliente anon puede fallar por
  // RLS (media_items/sources) y devolver 404 aunque el item exista.
  const supabase = createServerClient();

  // 2) Body + validación UUID
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Body inválido' },
      { status: 400 }
    );
  }

  const { mediaItemId } = parsed.data;

  // 3) Ownership: media_items -> sources.user_id (media_items no tiene user_id propio)
  const { data: owned, error: ownedError } = await supabase
    .from('media_items')
    .select('id, sources!inner(user_id)')
    .eq('id', mediaItemId)
    .single();

  // Con cliente sin generic, postgrest-js tipa el embed como array aunque en
  // runtime (FK many-to-one + !inner) llegue como objeto → normalizar.
  const sources = owned?.sources as unknown;
  const sourceOwner = Array.isArray(sources)
    ? (sources[0] as { user_id?: string } | undefined)?.user_id
    : (sources as { user_id?: string } | undefined)?.user_id;

  if (ownedError || !owned || sourceOwner !== userId) {
    return NextResponse.json(
      { error: 'media_item no encontrado o sin permisos' },
      { status: 404 }
    );
  }

  // 4) Procesar (raw -> processed)
  const result = await processMediaItem(mediaItemId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    processed_url: result.processedUrl,
    thumbnail_url: result.thumbnailUrl,
    skip: result.skip,
    metadata: result.probe,
  });
}
