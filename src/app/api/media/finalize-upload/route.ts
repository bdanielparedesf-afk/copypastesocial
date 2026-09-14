/**
 * FASE 21 — POST /api/media/finalize-upload
 *
 * Segunda mitad de la subida directa a Storage:
 *  1. El navegador ya subió los binarios al bucket 'raw' con URLs firmadas
 *     (ver /api/media/upload-url).
 *  2. Aquí llega SOLO metadata (JSON) y se crean las filas:
 *     - source (provider='local')
 *     - publication (status='processing')
 *     - media_items con raw_url/raw_path (bucket 'raw'), status='PENDING'
 *       y url = URL pública del original
 *     - publication_jobs 'pending' por destino (si createJobs ≠ false)
 *
 * Validaciones: ownership del path ({user_id}/...), existencia real del objeto
 * en Storage, cantidad y tamaño (mismos límites que la FASE 20).
 *
 * Body (JSON, diminuto):
 *   {
 *     files: [{ path, name, size, type }],   // 1..50
 *     createJobs?: boolean                   // default true (IG/YT/FB/TT)
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserIdAllowDev } from '@/lib/dev-auth';
import { createServerClient } from '@/lib/supabase';
import {
  MAX_FILES_PER_BATCH,
  buildDbErrorHint,
  getUploadSchemaStatus,
  isOwnedStoragePath,
  rawObjectExists,
  rawPublicUrl,
  validateUploadFiles,
} from '@/lib/storage/signed-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Destinos fijos para publication_jobs (mismo orden que upload-local). */
const DESTINATIONS = ['instagram', 'youtube', 'facebook', 'tiktok'] as const;

const FileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(300),
  size: z.number().int().nonnegative(),
  type: z.string().max(120).optional().default(''),
});

const BodySchema = z.object({
  files: z.array(FileSchema).min(1).max(MAX_FILES_PER_BATCH),
  createJobs: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    // Single-owner: nunca 401 (la app no tiene login propio).
    const userId = await getUserIdAllowDev(request);
    const supabase = createServerClient();

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

    const { createJobs } = parsed.data;

    // Defensa en profundidad: el preflight real ocurre en /upload-url.
    const schema = await getUploadSchemaStatus();
    if (!schema.ready) {
      return NextResponse.json(
        { error: schema.message, missing: schema.missing, code: 'SCHEMA_NOT_MIGRATED' },
        { status: 409 }
      );
    }

    const validation = validateUploadFiles(parsed.data.files);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // Ownership + existencia real en Storage (evita media_items fantasma).
    const confirmed: Array<{ path: string; name: string; size: number; type: string }> = [];
    for (const file of parsed.data.files) {
      if (!isOwnedStoragePath(userId, file.path)) {
        return NextResponse.json(
          { error: `Ruta no autorizada: ${file.name}` },
          { status: 403 }
        );
      }
      const exists = await rawObjectExists(file.path);
      if (!exists) {
        return NextResponse.json(
          { error: `El archivo ${file.name} no llegó al Storage. Reintenta la subida.` },
          { status: 409 }
        );
      }
      confirmed.push({ path: file.path, name: file.name, size: file.size, type: file.type });
    }

    if (confirmed.length === 0) {
      return NextResponse.json({ error: 'Archivos inválidos' }, { status: 400 });
    }

    // source (provider='local')
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .insert({
        user_id: userId,
        original_url: `local://${confirmed[0].name}`,
        provider: 'local',
        identifier: `local_${Date.now()}`,
        content_type: 'video',
        status: 'ACCESSIBLE',
      })
      .select()
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        {
          error: `Error al crear source: ${buildDbErrorHint(
            sourceError?.code,
            sourceError?.message
          )}`,
        },
        { status: 500 }
      );
    }

    // publication base
    const { data: publication, error: pubError } = await supabase
      .from('publications')
      .insert({
        user_id: userId,
        source_id: source.id,
        caption: '',
        status: 'processing',
      })
      .select()
      .single();

    if (pubError || !publication) {
      return NextResponse.json(
        {
          error: `Error al crear publicación: ${buildDbErrorHint(
            pubError?.code,
            pubError?.message
          )}`,
        },
        { status: 500 }
      );
    }

    const mediaItems = [];
    let totalJobs = 0;
    let lastMediaError: { code?: string; message?: string } | null = null;

    for (const file of confirmed) {
      const url = rawPublicUrl(file.path);
      const mimeType = file.type || 'video/mp4';

      const { data: mediaItem, error: mediaError } = await supabase
        .from('media_items')
        .insert({
          source_id: source.id,
          url,
          raw_url: url,
          raw_path: file.path,
          thumbnail_url: null,
          type: 'video',
          source_provider: 'local',
          status: 'PENDING',
          metadata: {
            original_filename: file.name,
            size: file.size,
            mime_type: mimeType,
            storage_bucket: 'raw',
            storage_path: file.path,
            upload_mode: 'signed-direct',
            uploaded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (mediaError || !mediaItem) {
        console.error(`Error al crear media_item para ${file.name}:`, mediaError);
        lastMediaError = { code: mediaError?.code, message: mediaError?.message };
        continue;
      }

      if (createJobs) {
        for (const provider of DESTINATIONS) {
          const { error: jobError } = await supabase.from('publication_jobs').insert({
            publication_id: publication.id,
            media_id: mediaItem.id,
            social_account_id: null,
            provider,
            source_provider: 'local',
            // Columnas obligatorias del esquema base de publication_jobs.
            type: 'publish',
            status: 'pending',
            attempts: 0,
            max_attempts: 3,
            payload: {
              original_filename: file.name,
              auto_created: true,
            },
          });

          if (jobError) {
            console.error(`Error al crear job para ${provider}:`, jobError);
          } else {
            totalJobs++;
          }
        }
      }

      mediaItems.push({
        id: mediaItem.id,
        url: mediaItem.url,
        thumbnailUrl: mediaItem.thumbnail_url,
        type: mediaItem.type,
        sourceProvider: 'local',
        metadata: mediaItem.metadata,
      });
    }

    if (mediaItems.length === 0) {
      return NextResponse.json(
        {
          error: `No se pudo registrar ningún video: ${buildDbErrorHint(
            lastMediaError?.code,
            lastMediaError?.message
          )}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      publicationId: publication.id,
      sourceId: source.id,
      imported: mediaItems.length,
      jobsCreated: totalJobs,
      destinations: createJobs ? [...DESTINATIONS] : [],
      mediaItems,
    });
  } catch (error) {
    console.error('Error en POST /api/media/finalize-upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al procesar la subida' },
      { status: 500 }
    );
  }
}