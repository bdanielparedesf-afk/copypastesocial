# Proyecto CopyPasteSocial — Progreso de Fases

## Estado de Fases

| Fase | Descripción | Estado |
|------|-------------|--------|
| FASE 1-6 | Core arquitectura, sources, import, dedup | ✅ DONE |
| FASE 7 | Librería de Contenido (/content) — Bento grid, filtros, preview modal | ✅ DONE |
| FASE 8 | Media processing (transcode, signed URLs) | ✅ DONE |
| FASE 9 | Instagram tokens (auth, long-lived, refresh) | ✅ DONE |
| FASE 10 | Cola de publicación (publish_queue) | ✅ DONE |
| FASE 11 | Accounts multi-workspace + límites diarios | ✅ DONE |
| FASE 12 | Publicación multi-plataforma (IG, FB, YT, TT) | ✅ DONE |
| FASE 13 | Idempotency + rate limiting | ✅ DONE |
| FASE 14 | Modal Progreso + API Connect | ✅ DONE |
| FASE 15 | Confetti + Success Screen + Logs + Retry | ✅ DONE |
| FASE 16 | Historial conectado con modal read-only + API jobs | ✅ DONE |
| FASE 17 | UI IA: Tabs en preview, generación con IA, batch IA, caption AI en publicación | ✅ DONE |
| FASE 18 | MOCK_MODE 1×4 / 10×4 / 50×4, badge de entorno y testing guiado | ✅ DONE |


---

## FASE 14 — Modal Progreso + API Connect

**Fecha:** 2025-09-13

### Componentes creados:
- `src/components/publishing/publication-progress-modal.tsx`
  - Modal estilo Vercel deploy logs
  - Barra de progreso gradiente animada
  - Lista de jobs con status por plataforma (IG/YT/FB/TT)
  - Logs colapsables con terminal style
  - Botón "Reintentar fallidos"

### Componentes actualizados:
- `src/app/(dashboard)/content/page.tsx`
  - Integración con `usePublication()` hook
  - Selector de cuentas sociales en SelectionBar
  - Checkboxes en cards → `setSelectedMedia`
  - Botón "Fotocopiar" → POST `/api/publications`
  - Polling GET `/api/publications` cada 3s
  - Modal de progreso abierto durante publicación

### Servicios actualizados:
- `src/lib/publishing/queue.ts`
  - `processQueue`: try/catch por job (independencia plataformas)
  - Un job fallado no detiene los demás

### Flujo:
1. Usuario selecciona videos (checkbox en cards)
2. Usuario selecciona cuentas destino (IG/YT/FB/TT badges en SelectionBar)
3. Click "Fotocopiar" → POST /api/publications {media_ids, account_ids}
4. Modal muestra progreso en tiempo real con polling 3s
5. Al completar: resumen éxito/fallo + opción reintentar fallidos

### Validación:
- ✅ `npm run typecheck` → 0 errores
- ✅ `MOCK_MODE=true npx vitest run` → tests pasan
- ✅ `npm run build` → exitoso

---

## FASE 15 — Confetti + Success Screen + Logs Colapsables + Retry API

**Fecha:** 2026-09-13

### Componentes creados:
- `src/app/api/publications/retry/route.ts`
  - POST /api/publications/retry con `{ failed_ids: string[] }`
  - Resetea jobs FAILED → PENDING (attempts=0, error_message=null)
  - Verifica ownership del usuario sobre las publicaciones
  - Dispara `processQueue()` para re-procesar inmediatamente

### Componentes actualizados:
- `src/components/publishing/publication-progress-modal.tsx`
  - Pantalla "PUBLICACIÓN TERMINADA" con stats grandes (procesados, exitosos, fallidos)
  - Confetti sutil con framer-motion (40 divs cayendo con animación infinita)
  - Logs colapsables por job: expande para mostrar `external_id` y `error_message`
  - Botón [REINTENTAR FALLIDOS] llama POST /api/publications/retry con failed_ids
  - `PublicationJob` type actualizado: añade `id`, `externalId` campos
  - fetchJobs mapea `id` y `external_id` desde Supabase

- `src/app/(dashboard)/content/page.tsx`
  - `retryFailedPublications` actualizado: llama POST /api/publications/retry con `failed_ids`

### Validación:
- ✅ `npm run typecheck` → 0 errores
- ✅ `npm run build` → exitoso
- ✅ `/api/publications/retry` route registrada

---

## FASE 16 — Historial conectado con modal read-only + API jobs

**Fecha:** 2026-09-13

### Componentes creados:
- `src/app/api/publications/[id]/jobs/route.ts`
  - GET /api/publications/[id]/jobs
  - Selecciona `*` from `publication_jobs` where `publication_id = id`
  - Incluye joins con `media_items(title)` y `social_accounts(provider)`
  - Verifica ownership del usuario sobre la publicación
  - Devuelve jobs mapeados con: id, mediaTitle, provider, status, externalId, error, attempts, createdAt, updatedAt

### Componentes actualizados:
- `src/app/api/publications/route.ts`
  - GET ahora filtra por `user_id` y agrega conteos de jobs (total, succeeded, failed)
  - Devuelve formato `{ success: true, publications: PublicationHistoryItem[] }`

- `src/app/(dashboard)/content/page.tsx`
  - Nuevo estado: `historyPublications`, `historyLoading`, `historyError`, `showHistory`
  - `fetchHistory()` llama GET /api/publications y popula el historial
  - Botón "Historial" en header con contador total
  - Tabla de historial con columnas: Fecha, Estado, Procesados, Exitosos, Fallidos, Acciones
  - Filas clickeables → `openHistoryPublication(pubId)` setea `publicationId` y abre modal
  - Botón "Ver detalles" en cada fila (también abre modal)
  - Badges de estado con colores: verde (completado), ámbar (parcial), rojo (fallido), violeta (en progreso)
  - Close handler del modal resetea `publicationId`

- `src/components/publishing/publication-progress-modal.tsx`
  - Ya soporta modo read-only vía `publicationId` prop
  - Al recibir `publicationId`, usa realtime + polling 2s para cargar jobs de Supabase
  - Botón [REINTENTAR FALLIDOS] visible cuando `failed > 0` (usa `onRetryFailed` existente)

### Flujo:
1. Usuario click "Historial" en /content
2. Se cargan publicaciones previas con agregados de jobs
3. Click en fila o "Ver detalles" → abre `PublicationProgressModal` en modo read-only
4. Modal carga jobs via GET /api/publications/[id]/jobs (realtime + polling)
5. Si hay fallidos, botón [REINTENTAR FALLIDOS] llama POST /api/publications/retry

### Validación:
- ✅ `npm run typecheck` → 0 errores
- ✅ `npm run build` → 17 rutas (incluye `/api/publications/[id]/jobs`)

---

## FASE 17 — UI IA (Generación de captions con IA)

**Fecha:** 2026-09-13

### Migración creada:
- `supabase/migrations/20240109000000_phase17_ai_fields.sql`
  - `ALTER TABLE media_items ADD COLUMN IF NOT EXISTS ai_generated_caption TEXT`
  - `ALTER TABLE media_items ADD COLUMN IF NOT EXISTS ai_generated_title TEXT`
  - `ALTER TABLE media_items ADD COLUMN IF NOT EXISTS ai_generated_hashtags TEXT[]`
  - Índice parcial `idx_media_items_ai_caption` para items con caption IA

### Componentes creados:
- `src/components/ui/tabs.tsx`
  - shadcn-style Tabs (Tabs, TabsList, TabsTrigger, TabsContent)
  - Basado en `@radix-ui/react-tabs` (ya instalado)
  - Tema oscuro con gradiente brand-purple → brand-cyan en tabs activos

### Componentes actualizados:
- `src/app/(dashboard)/content/page.tsx`
  - Importa `Tabs, TabsList, TabsTrigger, TabsContent` de `@/components/ui`
  - `ContentItem` interface: añade `aiGeneratedCaption`, `aiGeneratedTitle`, `aiGeneratedHashtags`, `useAi`
  - `PreviewModal`:
    - Tabs con [USAR ORIGINAL] | [✨ GENERAR CON IA]
    - Tab IA: Select platform (IG/FB/TT/YT) + Select tone (viral/profesional/divertido)
    - Botón [✨ GENERAR] con gradiente `#7C3AED→#06B6D4` y spinner técnico
    - Llama a POST `/api/ai/generate { mediaItemIds:[id], action:'caption', platform, tone }`
    - Resultado en Card glass `bg-[#151517] border-[#262629]` con botón copiar (Lucide Copy) + [USAR ESTE]
    - [USAR ESTE] hace PATCH `/api/media/[id]` para guardar `ai_generated_caption` y setea `useAi=true` local
  - `SelectionBar`: botón [✨ IA MASIVA] que batch genera captions para todos los seleccionados (POST `/api/ai/generate` + PATCH por item)
  - `useAiIds` Set local para tracking de items con useAi activado
  - `copySelected`: construye `use_ai_captions` map y lo envía en POST `/api/publications`

- `src/app/api/content/route.ts`
  - GET ahora retorna `ai_generated_caption`, `ai_generated_title`, `ai_generated_hashtags`

- `src/app/api/media/[id]/route.ts`
  - PATCH agregado: actualiza `ai_generated_caption`, `ai_generated_title`, `ai_generated_hashtags`
  - Ownership: media_items -> sources.user_id (igual que GET)
  - Validación de tipos por campo

- `src/app/api/publications/route.ts`
  - POST acepta `use_ai_captions?: Record<string, string>` y lo reenvía a `createPublication`

- `src/lib/publishing/publication.service.ts`
  - `createPublication`: acepta `use_ai_captions`, almacena `{ useAi: true }` en el `payload` de cada job correspondiente
  - `processJob`: si `payload.useAi === true`, usa `media.ai_generated_caption` como caption en el upload
  - `UploadParams` interface: añade `caption?: string | null`

- `src/components/ui/index.ts`
  - Exporta Tabs, TabsList, TabsTrigger, TabsContent

### Flujo:
1. Usuario abre el preview modal de un item (click en play/preview)
2. Ve 2 tabs: [USAR ORIGINAL] (caption original) | [✨ GENERAR CON IA]
3. En tab IA: selecciona plataforma (IG/FB/TT/YT) y tono (viral/profesional/divertido)
4. Click [✨ GENERAR] → POST `/api/ai/generate` → muestra resultado en Card glass
5. Click [USAR ESTE] → PATCH `/api/media/[id]` guarda caption + `useAi=true` local
6. Al publicar (Fotocopiar Seleccionados): items con `useAi=true` envían `use_ai_captions` → `createPublication` marca jobs con `payload.useAi` → `processJob` usa `ai_generated_caption` en el upload
7. Desde la SelectionBar: [✨ IA MASIVA] batch genera captions para todos los items seleccionados

### Validación:
- ✅ `npm run typecheck` → 0 errores
- ✅ `npm run build` → build exitoso (17 rutas estáticas)

---

## FASE 18 — MOCK_MODE 1×4 / 10×4 / 50×4

**Fecha:** 2026-09-13

### Cambios realizados:
- `.env.local`
  - `MOCK_MODE=true`
  - `NEXT_PUBLIC_MOCK_MODE=true` para el badge del cliente
- `src/lib/publishing/publication.service.ts`
  - `processJob` detecta `MOCK_MODE=true`
  - En modo mock espera 500 ms, no llama a Instagram, Facebook, TikTok ni YouTube
  - Marca el job como `SUCCESS` y genera un `external_id` con prefijo `mock_`
- `src/app/(dashboard)/content/page.tsx`
  - Añadido badge amarillo `MOCK_MODE ACTIVO` en el header cuando `NEXT_PUBLIC_MOCK_MODE=true`
- `docs/TESTING.md`
  - Guía manual para los escenarios 1×4, 10×4 y 50×4
  - Criterios de aceptación para jobs, realtime, paginación y límites de Vercel

### Flujo mock:
1. La API crea los jobs de publicación en Supabase.
2. La cola toma cada job `PENDING`.
3. `processJob` marca `PROCESSING`, espera 500 ms y marca `SUCCESS`.
4. El modal recibe los jobs mediante polling/realtime y muestra los identificadores `mock_*`.
5. `/publications` muestra los totales y estados finales.

### Validación:
- ✅ `npm run typecheck` → 0 errores
- ✅ `npm run lint` → sin errores
- ✅ `npm run build` → build exitoso
- ✅ Testing manual guiado documentado para 1×4, 10×4 y 50×4
