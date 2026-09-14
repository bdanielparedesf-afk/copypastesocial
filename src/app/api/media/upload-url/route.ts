/**
 * FASE 21 — POST /api/media/upload-url
 *
 * Devuelve una signed upload URL por archivo para subir DIRECTO a Supabase
 * Storage desde el navegador (sin pasar el binario por la función).
 *
 * Motivo: Vercel limita el body de las Functions a 4.5MB → subir el video por
 * /api/media/upload-local devolvía 413 FUNCTION_PAYLOAD_TOO_LARGE.
 *
 * Body (JSON, diminuto):
 *   { files: [{ name: string, size: number, type: string }] }   // 1..50
 *
 * Respuesta:
 *   { success: true, bucket: 'raw', targets: [{ path, token, signedUrl, ... }] }
 *
 * El cliente sube cada archivo con PUT a `signedUrl` y después llama a
 * /api/media/finalize-upload para crear las filas de BD.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserIdAllowDev } from '@/lib/dev-auth';
import {
  MAX_FILES_PER_BATCH,
  UPLOAD_BUCKET,
  createSignedUploadTargets,
  getUploadSchemaStatus,
  validateUploadFiles,
} from '@/lib/storage/signed-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FileSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().int().nonnegative(),
  type: z.string().max(120).optional().default(''),
});

const BodySchema = z.object({
  files: z.array(FileSchema).min(1).max(MAX_FILES_PER_BATCH),
});

export async function POST(request: NextRequest) {
  try {
    // Single-owner: nunca 401 (la app no tiene login propio).
    const userId = await getUserIdAllowDev(request);

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

    const validation = validateUploadFiles(parsed.data.files);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // Fail-fast: si la DB no tiene el esquema del flujo local, no tiene sentido
    // que el navegador suba cientos de MB para fallar al confirmar.
    const schema = await getUploadSchemaStatus();
    if (!schema.ready) {
      return NextResponse.json(
        { error: schema.message, missing: schema.missing, code: 'SCHEMA_NOT_MIGRATED' },
        { status: 409 }
      );
    }

    const targets = await createSignedUploadTargets(userId, validation.files);

    return NextResponse.json({
      success: true,
      bucket: UPLOAD_BUCKET,
      targets,
    });
  } catch (error) {
    console.error('Error en POST /api/media/upload-url:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron firmar las subidas' },
      { status: 500 }
    );
  }
}