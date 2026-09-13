/**
 * FASE 6 — POST /api/sources/check
 *
 * Body: { url: string }
 * Retorna: { provider, url, contentType, identifier, accessibility, message, mediaCount }
 *
 * REGLA DE SEGURIDAD #46: la verificación usa SOLO APIs oficiales de los
 * SourceProviders (Graph API / YouTube Data API v3). Nunca scraping ni bypass.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { checkSource } from '@/services/import-service';

const BodySchema = z.object({
  url: z.string().min(1, 'La URL es obligatoria'),
});

export async function POST(request: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    const result = await checkSource(parsed.data.url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        provider: 'unsupported',
        accessibility: 'ERROR',
        message: error instanceof Error ? error.message : 'Ocurrió un error al consultar la plataforma.',
        mediaCount: 0,
      },
      { status: 500 }
    );
  }
}
