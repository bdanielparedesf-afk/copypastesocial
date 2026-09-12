# FASE 10 — PUBLISHING REAL IG

**Fecha:** 2026-09-12
**Status:** IMPLEMENTADA ✅ (real Graph API + MOCK fallback si no hay token)
**Typecheck:** `npm run typecheck` → 0 errores
**Check:** `.\check-fase10.ps1` → 7 exports OK + POST /api/publish OK + cron OK

## Objetivo

Publicar los media_items READY (Fase 8, 9:16 TikTok) como **Reels de
Instagram** usando la Graph API de Meta con el token long-lived guardado en
`provider_tokens` (Fase 9). Pipeline: signed URL del bucket `processed` →
container → polling 5s hasta FINISHED → publish → marca PUBLISHED.

## Exports de `src/lib/publishing/publisher.ts` (7)

1. `validateCaption(caption)` → trim + máx. 2200 chars.
2. `getAccessToken(socialAccountId)` → token long-lived real de `provider_tokens` (desencriptado); null si no hay (dev → MOCK).
3. `getSignedProcessedUrl(media)` → **signed URL (1h) del bucket `processed`**; lanza si el media no tiene processed.
4. `createContainer(videoUrl, caption)` → contenedor REELS (`/{igUserId}/media` con `media_type=REELS`) → `id`.
5. `getContainerStatus(containerId)` → `status_code`: IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED.
6. `publishContainer(creationId)` → `/{igUserId}/media_publish` → `media_id` real de Meta.
7. `publishToInstagram({ videoUrl, caption, accessToken, userId })` → pipeline completo con **retry 3** si el contenedor queda ERROR y **polling 5s** hasta FINISHED. Sin token real → **fallback MOCK** (`mock_<ts>`).

## Cola `src/lib/publishing/queue.ts`

- `enqueuePost({ userId, socialAccountId, mediaId, caption, scheduledAt })` → PENDING o SCHEDULED.
- `getQueue(userId, { status?, limit? })` → cola del usuario.
- `getDueItems({ limit? })` → PENDING o SCHEDULED con `scheduled_at <= now()` (para el cron).
- `cancelScheduled(queueId, userId)` → FAILED con `error='canceled_by_user'`.
- `retryFailed(userId, queueIds?)` → FAILED → PENDING (resetea attempts).
- `processPost(queueId)` → media READY → signed URL processed → `publishToInstagram` → PUBLISHED (o FAILED con error).

## Rutas API

- **`POST /api/publish`** → valida `media_id` READY (ownership vía sources.user_id) → encola → procesa en línea (si no hay `scheduled_at`) → `{ success, queue: { status, ig_media_id } }`.
- **`POST /api/cron/publish-scheduled`** → publica lote: `getDueItems()` → `processPost()` por item. Protegido por `x-cron-secret` (`CRON_SECRET`).

## Migración (Fase 10)

`supabase/migrations/20240106000000_phase10_publish_queue.sql`:
tabla `publish_queue` con status `PENDING/SCHEDULED/PUBLISHING/PUBLISHED/FAILED`,
`ig_media_id`, `attempts`, RLS (`auth.uid() = user_id`), índice por vencimiento y trigger `updated_at`.

## Reglas cumplidas

- [x] Video URL siempre **signed URL del bucket `processed`** (nunca `raw`).
- [x] Caption máx. 2200 chars + trim.
- [x] **Retry 3 intentos** si contenedor ERROR.
- [x] **Fallback MOCK** si no hay token real (marca PUBLISHED con `mock_*`).
- [x] Polling de estado **cada 5s** hasta FINISHED.
- [x] Cron publica `scheduled_at <= now()`.

## Checks de cierre

- [x] `npm run typecheck` → 0 errores
- [x] `.\check-fase10.ps1` → 7 exports + flow POST + cron OK

> **Nota:** con token real usa las APIs `/{igUser}/media`, `/{containerId}` y
> `/{igUser}/media_publish` de la Instagram Graph API (`graph.facebook.com/v18.0`).