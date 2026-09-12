# FASE 8 — MEDIA PROCESSOR REAL — COMPLETADA ✅

**Fecha:** 2026-09-12
**Status:** COMPLETADA ✅
**Typecheck:** `npm run typecheck` → 0 errores
**Check:** `.\check-fase8.ps1` → FFmpeg no en PATH ⇒ fallback MOCK de copia (permitido por spec) / TYPECHECK OK

## Stack

- FFmpeg/ffprobe reales vía `child_process` (sin dependencias npm).
- Fallback a copia literal si ffmpeg no está instalado (el dev local no se rompe).
- Supabase Storage buckets `raw` (original_asset, nunca se borra) y `processed`.

## `src/lib/media/ffmpeg.ts` — exports reales

| Export | Descripción |
| --- | --- |
| `probeVideo(filePath)` | Metadata real con ffprobe: `hasVideoStream`, `hasAudioStream`, `duration`, `width`, `height`, `codec`, `aspectRatio`, `isVertical`, `is9x16`. Retorna `null` si ffprobe no está (fallback dev). |
| `generateThumbnail(inputPath, outputPath)` | Frame en el segundo 1 (`-ss 1 -frames:v 1 -q:v 2`). Lanza si ffmpeg no está (el caller lo trata como best-effort). |
| `transcodeToVertical916(inputPath, outputPath, { hasAudioStream })` | Pipeline real a TikTok 9:16 — ver abajo. Sin ffmpeg ⇒ copia input→output (fallback spec). |
| `getFfmpegAvailable()` / `getFfprobeAvailable()` | Disponibilidad cacheada de los binarios. |
| Constantes | `SKIP_CODEC='h264'`, `SKIP_MAX_WIDTH=1080`, `TARGET_WIDTH=1080`, `TARGET_HEIGHT=1920`. |

### `transcodeToVertical916` — pipeline de transcodificación real

- `-vf scale=1080:1920:force_original_aspect_ratio=decrease` + `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black` + `setsar=1` (mantiene aspecto con barras negras).
- `-c:v libx264 -preset fast -crf 23`.
- `-maxrate 2500k -bufsize 5000k` (compress).
- `-c:a aac -b:a 128k -af "loudnorm=I=-16:TP=-1.5:LRA=11"` si hay audio; `-an` si no.
- `-movflags +faststart` (web).
- 10 min de timeout por comando, `windowsHide: true` para Windows.

## `src/lib/media/processor.ts` — `processMediaItem` (7 pasos, REAL)

1. **Carga** del media_item y marca `status='PROCESSING'`.
2. **Download** del raw: bucket `raw` de Storage (`downloadFile`) o URL fuente vía HTTP (`fetch`) con redirect.
3. **VALIDATION + METADATA + CHECK 9:16** (`probeVideo`):
   - Buffer no vacío (0 bytes ⇒ error).
   - Stream de video real (`hasVideoStream` true, si no ⇒ error).
   - Skip si ya es 9:16 h264 ancho ≤ 1080 (`is9x16 && codec==='h264' && width<=1080`) ⇒ passthrough sin transcode.
   - Imágenes/carousel ⇒ passthrough.
4. **TRANSCODE** `transcodeToVertical916` con **3 intentos** antes de fallar el paso (o copia si PASO 3 determinó skip).
5. **STORAGE** sube el resultado a bucket `processed` con ruta determinista `${rawDir}/processed.mp4` (`uploadFile`, upsert → idempotente).
6. **THUMBNAIL** `generateThumbnail` + upload a `processed` `${rawDir}/thumbnail.jpg` (best-effort: si falla no bloquea, thumbnail_url queda null).
7. **DB UPDATE** `media_items`: `processed_url`, `processed_path`, `thumbnail_url`, `status='READY'`, `processed_at`, `duration/width/height`, y `metadata.processing` con flags por paso.

- Idempotente: ruta determinista + upsert sobreescriben sin duplicar; re-procesar produce el mismo resultado.
- Errores ⇒ `status='FAILED'` con mensaje en `metadata.processing_error`.
- El original en bucket `raw` **nunca se borra**.

## `src/app/api/media/[id]/route.ts`

- `GET /api/media/[id]` con ownership vía `sources.user_id` = auth user.
- `params: Promise<{ id }>` (estilo Next 15).
- Firma URLs de `raw`/`processed` (1h) si apuntan a Storage; externas tal cual.

## `src/app/api/media/process/route.ts`

- `POST /api/media/process` → procesa el media_item y retorna `processed_url`, `thumbnail_url`, `skip`, `metadata`.

## Checks de cierre

- [x] `npm run typecheck` → 0 errores
- [x] `.\check-fase8.ps1` → FFMPEG no en PATH → fallback MOCK de copia (OK según spec)
- [x] Exports reales: `probeVideo` / `generateThumbnail` / `transcodeToVertical916`
- [x] Sin mock: el fallback a copia solo aplica si ffmpeg no está instalado (dev); en producción corre el proceso real
- [x] Regla de Oro #41: typecheck OK, documentado, anterior sigue funcionando

> **Siguiente:** FASE 9 — OAuth/Instagram (pendiente).