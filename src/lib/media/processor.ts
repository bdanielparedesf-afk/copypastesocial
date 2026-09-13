/**
 * FASE 8 — Procesador de media items (raw -> processed).
 *
 * Flujo de `processMediaItem(mediaItemId)` (spec por pasos):
 *   PASO 1  VALIDATION → valida el raw: buffer no vacío y, para videos,
 *           stream de video real (probeVideo). FALLA si no hay video.
 *   PASO 2  METADATA   → metadata completa vía ffprobe: duración,
 *           dimensiones, códec, aspect ratio, isVertical, is9x16.
 *   PASO 3  SKIP/CHECK → el raw ya es TikTok 9:16 (h264, ancho <= 1080) o
 *           es imagen/carousel → NO se transcodifica: passthrough
 *           (documentado en skip_reason).
 *   PASO 4  TRANSCODE  → transcode a TikTok 9:16 (1080x1920): scale + pad
 *           negro + libx264 preset fast crf 23 + maxrate 2500k + loudnorm
 *           I=-16 + faststart. 3 intentos antes de fallar el paso.
 *   PASO 5  THUMBNAIL  → thumbnail JPG (frame en el segundo 1), best-effort.
 *   PASO 6  STORAGE    → sube el resultado al bucket 'processed' con ruta
 *           determinista (upsert, sobreescribe).
 *   PASO 7  DB UPDATE  → media_items: processed_url/path, thumbnail_url,
 *           duration/width/height, metadata.processing (flags por paso,
 *           skip, códec, aspect ratio), status='READY', processed_at.
 *
 * Errores: status='FAILED' (mensaje en metadata.processing_error) y se
 * retorna { ok: false, error }.
 *
 * Idempotente: la ruta determinista + upsert sobreescriben sin duplicar
 * objetos; re-procesar el mismo item produce el mismo resultado.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getDbClient } from '@/lib/supabase/api';
import { downloadFile, extractStoragePath, uploadFile } from '@/lib/storage/storage';
import {
  generateThumbnail,
  probeVideo,
  transcodeToVertical916,
  type VideoProbe,
} from './ffmpeg';

/** Intentos del transcode (spec: 3 antes de fallar el paso). */
const MAX_TRANSCODE_ATTEMPTS = 3;

export type ProcessResult =
  | {
      ok: true;
      processedUrl: string;
      thumbnailUrl: string | null;
      skip: boolean;
      probe: VideoProbe | null;
    }
  | { ok: false; error: string };

/** Extensión a partir del Content-Type de la respuesta HTTP. */
function extFromContentType(contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

/** Content-Type a partir de la extensión del archivo. */
function contentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

/** Extensión inferida de la URL (sin query ni hash). */
function extFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const ext = clean.slice(clean.lastIndexOf('.'));
    return /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Procesa un media_item completo (raw -> processed) y actualiza la fila.
 * El ownership se valida en la ruta que llama (user_id via sources).
 */
export async function processMediaItem(mediaItemId: string): Promise<ProcessResult> {
  const db = getDbClient();

  try {
    // 1) Cargar el media_item
    const { data: item, error: itemError } = await db
      .from('media_items')
      .select('*')
      .eq('id', mediaItemId)
      .single();

    if (itemError || !item) {
      return {
        ok: false,
        error: `media_item no encontrado: ${itemError?.message ?? mediaItemId}`,
      };
    }

    // Marcar en proceso
    await db.from('media_items').update({ status: 'processing' }).eq('id', mediaItemId);

    // 2) Descargar el raw: bucket 'raw' de Storage o source_url/url vía HTTP
    const rawRef = extractStoragePath(item.raw_url);
    let buffer: Buffer;
    let inputExt: string;

    if (rawRef) {
      buffer = await downloadFile(rawRef.bucket, rawRef.path);
      inputExt = path.extname(rawRef.path).toLowerCase() || '.mp4';
    } else {
      const sourceUrl: string = item.source_url ?? item.url;
      if (!sourceUrl) {
        return { ok: false, error: 'El media item no tiene raw_url ni URL de origen' };
      }

      const res = await fetch(sourceUrl, { redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`Descarga del raw falló (HTTP ${res.status}): ${sourceUrl}`);
      }

      buffer = Buffer.from(await res.arrayBuffer());
      inputExt =
        extFromContentType(res.headers.get('content-type') ?? '') ||
        extFromUrl(sourceUrl) ||
        '.mp4';
    }

    // PASO 1/2/3 — VALIDATION, METADATA y CHECK de skip
    const isVideo = (item.type ?? 'video') === 'video';
    const outputExt = isVideo ? '.mp4' : inputExt;
    const originalFileName = rawRef
      ? rawRef.path.split('/').pop() ?? 'original'
      : `original${inputExt}`;
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `cps-${mediaItemId}-raw${inputExt}`);
    const outputPath = path.join(tmpDir, `cps-${mediaItemId}-processed${outputExt}`);
    const thumbnailTempPath = path.join(tmpDir, `cps-${mediaItemId}-thumbnail.jpg`);

    let probe: VideoProbe | null = null;
    let skip = false;
    let skipReason: string | null = null;

    try {
      await fs.writeFile(inputPath, buffer);

      if (!isVideo) {
        // PASO 3 (imagen/carousel): passthrough, sin VALIDATION de video
        skip = true;
        skipReason = 'imagen/carousel: passthrough sin transcode';
      } else {
        // VALIDATION: buffer no vacío; para videos además stream real
        if (buffer.length === 0) {
          throw new Error('VALIDATION falló: el raw está vacío (0 bytes)');
        }

        probe = await probeVideo(inputPath);

        if (probe) {
          if (!probe.hasVideoStream) {
            throw new Error('VALIDATION falló: el raw no tiene stream de video real');
          }

          // METADATA (paso 2) extraída: duración, códec, aspect ratio, skip
          if (probe.is9x16 && probe.codec === 'h264' && (probe.width ?? 0) <= 1080) {
            skip = true;
            skipReason = 'raw ya es 9:16 h264 (ancho <= 1080): no se transcodifica';
          }
        }
        // probe null (sin ffprobe, fallback dev): no se puede validar →
        // continúa; TRANSCODE hace fallback a copia
      }

      // PASO 4 — TRANSCODE: a TikTok 9:16 con 3 intentos (o passthrough si
      // PASO 3 determinó skip)
      if (!skip) {
        let transcodeError: Error | null = null;
        for (let attempt = 1; attempt <= MAX_TRANSCODE_ATTEMPTS; attempt++) {
          try {
            await transcodeToVertical916(inputPath, outputPath, {
              hasAudioStream: probe ? probe.hasAudioStream : undefined,
            });
            transcodeError = null;
            break;
          } catch (err) {
            transcodeError = err instanceof Error ? err : new Error('TRANSCODE falló');
            console.error(
              `[processor] TRANSCODE intento ${attempt}/${MAX_TRANSCODE_ATTEMPTS} falló:`,
              transcodeError.message
            );
          }
        }
        if (transcodeError) {
          throw new Error(
            `TRANSCODE falló tras ${MAX_TRANSCODE_ATTEMPTS} intentos: ${transcodeError.message}`
          );
        }
      } else {
        // PASO 3 skip: passthrough tal cual (skip_reason lo documenta)
        await fs.copyFile(inputPath, outputPath);
      }

      // PASO 6 — STORAGE: sube el resultado al bucket 'processed' con ruta
      // determinista: directorio del original en 'raw' + processed<ext>
      // (upsert: sobreescribe si el objeto ya existe)
      const processedBuffer = await fs.readFile(outputPath);
      const rawDir = rawRef
        ? rawRef.path.split('/').slice(0, -1).join('/')
        : String(item.source_id ?? mediaItemId);
      const processedStoragePath = `${rawDir}/processed${outputExt}`;
      const processedUrl = await uploadFile(
        'processed',
        processedStoragePath,
        processedBuffer,
        isVideo ? 'video/mp4' : contentTypeFromExt(outputExt)
      );

      // PASO 5 — THUMBNAIL: JPG del frame en el segundo 1, best-effort (si
      // falla — p. ej. ffmpeg sin instalar — no bloquea: thumbnail_url null)
      let thumbnailUrl: string | null = null;
      try {
        await generateThumbnail(inputPath, thumbnailTempPath);
        const thumbnailBuffer = await fs.readFile(thumbnailTempPath);
        thumbnailUrl = await uploadFile(
          'processed',
          `${rawDir}/thumbnail.jpg`,
          thumbnailBuffer,
          'image/jpeg'
        );
      } catch (thumbError) {
        console.error('[processor] THUMBNAIL falló (no bloquea):', thumbError);
      }

      // PASO 7 — DB UPDATE: processed_url/path, thumbnail_url, duration,
      // width/height, metadata.processing (flags por paso, skip, códec,
      // aspect ratio), status='READY', processed_at
      const update: Record<string, unknown> = {
        processed_url: processedUrl,
        processed_path: processedStoragePath,
        thumbnail_url: thumbnailUrl,
        status: 'READY',
        processed_at: new Date().toISOString(),
        metadata: {
          ...((item.metadata as Record<string, unknown>) ?? {}),
          processing: {
            validated: true,
            metadataExtracted: probe !== null,
            skip,
            skipReason,
            transcodeAttempts: skip ? 0 : MAX_TRANSCODE_ATTEMPTS,
            thumbnail: thumbnailUrl !== null,
            duration: probe?.duration ?? null,
            width: probe?.width ?? null,
            height: probe?.height ?? null,
            codec: probe?.codec ?? null,
            aspectRatio: probe?.aspectRatio ?? null,
            isVertical: probe?.isVertical ?? null,
            is9x16: probe?.is9x16 ?? null,
            hasAudioStream: probe?.hasAudioStream ?? null,
            originalFileName,
            processedFileName: `processed${outputExt}`,
          },
        },
      };
      if (probe?.duration != null) update.duration = probe.duration;
      if (probe?.width != null) update.width = probe.width;
      if (probe?.height != null) update.height = probe.height;

      const { error: updateError } = await db
        .from('media_items')
        .update(update)
        .eq('id', mediaItemId);

      if (updateError) {
        throw new Error(`No se pudo actualizar media_items: ${updateError.message}`);
      }

      return { ok: true, processedUrl, thumbnailUrl, skip, probe };
    } finally {
      // Limpieza de temporales (no bloquea el resultado).
      await Promise.allSettled([
        fs.rm(inputPath, { force: true }),
        fs.rm(outputPath, { force: true }),
        fs.rm(thumbnailTempPath, { force: true }),
      ]);
    }
  } catch (error) {
    // Error -> status='FAILED' (mensaje guardado en metadata.processing_error)
    const message =
      error instanceof Error ? error.message : 'Error desconocido procesando el media item';

    try {
      const { data: current } = await db
        .from('media_items')
        .select('metadata')
        .eq('id', mediaItemId)
        .single();

      const metadata = {
        ...((current?.metadata as Record<string, unknown>) ?? {}),
        processing_error: message,
      };

      await db
        .from('media_items')
        .update({ status: 'FAILED', metadata })
        .eq('id', mediaItemId);
    } catch (dbError) {
      console.error('[processor] No se pudo marcar FAILED:', dbError);
    }

    console.error('[processor] processMediaItem falló:', message);
    return { ok: false, error: message };
  }
}
