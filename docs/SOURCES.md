# Source Detector — Documentación

## Resumen

El detector de fuentes (`src/services/source-detector.ts`) analiza URLs de redes sociales y extrae información estructurada sobre el proveedor, tipo de contenido e identificador.

## API

### `detectSource(url: string): SourceDetectionResult`

Analiza una URL y retorna el resultado de detección. Siempre devuelve un objeto (nunca `null`). Si la URL no coincide con ninguna plataforma soportada, `provider` será `'unsupported'`.

### `normalizeSourceUrl(url: string): string`

Normaliza una URL eliminando:
- Parámetros UTM (`utm_source`, `utm_medium`, etc.)
- Trailing slash final
- Hash (`#...`)

Si la URL no tiene protocolo, se añade `https://` automáticamente.

## Tipos (`src/types/source.ts`)

```typescript
export type SourceProvider = 'instagram' | 'youtube' | 'facebook' | 'unsupported';
export type SourceContentType = 'profile' | 'post' | 'reel' | 'short' | 'video';

export interface SourceDetectionResult {
  provider: SourceProvider;
  url: string;          // URL normalizada
  contentType: SourceContentType;
  identifier: string;   // ID del contenido o usuario
  originalUrl: string;  // URL original pegada por el usuario
}
```

## Providers de importación (FASE 6)

Además del detector de URLs (arriba), la Fase 6 incluye una capa de **Source Providers** que verifica accesibilidad y obtiene metadatos usando **únicamente APIs oficiales**. El registro vive en `src/providers/source-registry.ts` (distinto de `src/providers/registry.ts`, que es el de auditoría de la Fase 2).

### `getSourceProvider(name)` / `getSourceProviderForUrl(url)`

Resuelve el provider correcto a partir del nombre de plataforma o de una URL (usa `detectSource` internamente).

### Instancias compartidas

`sourceProviders` es un array con una única instancia de cada provider (singleton). Permite inyectar tokens de usuario en Fases 9-12 sin crear nuevas instancias.

### Proveedores implementados

| Provider | Plataforma | API oficial usada | Credenciales | Comportamiento sin credencial |
|----------|-----------|-------------------|--------------|-------------------------------|
| `InstagramSourceProvider` | Instagram | Graph API oEmbed (`graph.facebook.com/{v}/oembed`) | `INSTAGRAM_ACCESS_TOKEN` o `META_APP_ID\|META_APP_SECRET` | `AUTH_REQUIRED` |
| `YoutubeSourceProvider` | YouTube | YouTube Data API v3 | `GOOGLE_API_KEY` | `API_RESTRICTED` |
| `FacebookSourceProvider` | Facebook | Graph API (app token) | `META_APP_ID` / `META_APP_SECRET` | `AUTH_REQUIRED` |

### Contrato `SourceProvider` (`src/providers/interface.ts`)

```ts
interface SourceProvider {
  name: SourceProviderName;
  canHandle(url: string): boolean;
  checkAccessibility(url: string): Promise<SourceAccessibility>;
  fetchMetadata(url: string): Promise<MediaItem[]>;
}
```

- `checkAccessibility` nunca lanza: ante fallos inesperados retorna `ERROR`.
- `fetchMetadata` solo debe llamarse después de confirmar `ACCESSIBLE`; si no es accesible retorna `[]`.
- `SourceAccessibility`: `ACCESSIBLE` | `PRIVATE` | `UNAVAILABLE` | `UNSUPPORTED` | `AUTH_REQUIRED` | `API_RESTRICTED` | `ERROR`. (`CHECKING` es estado exclusivo de UI.)
- `MediaItem`: `externalId`, `url`, `title`, `thumbnailUrl`, `type`, `duration`, `width`, `height`, `publishedAt`, `metadata`.

### MOCK_MODE

`MOCK_MODE=true` (leído en runtime, no en import) hace que los providers **no contacten ninguna API**. La simulación es determinista por keywords en la URL:

| URL contiene | Estado retornado |
|--------------|------------------|
| `error` | `ERROR` |
| `quota` / `restricted` | `API_RESTRICTED` |
| `auth` | `AUTH_REQUIRED` |
| `private` | `PRIVATE` |
| `gone` / `missing` / `deleted` | `UNAVAILABLE` |
| resto | `ACCESSIBLE` (perfiles → 12 items, contenido individual → 1) |

### Regla de seguridad #46

- ❌ NUNCA: scraping evasivo, bypass de CAPTCHA/login/contenido privado, robo de cookies/sesiones, credenciales de terceros, evasión de rate limits, ocultar automatización, descargas no autorizadas.
- ✅ SOLO: OAuth oficial y APIs públicas oficiales.
- Contenido privado → `PRIVATE` / `AUTH_REQUIRED`. Jamás se intenta acceder.

---

## Plataformas soportadas

### Instagram
| Patrón | contentType | identifier |
|--------|------------|------------|
| `instagram.com/p/{id}` | `post` | ID del post |
| `instagram.com/reel/{id}` | `reel` | ID del reel |
| `instagram.com/stories/{user}` | `profile` | Username |
| `instagram.com/{username}` | `profile` | Username |

### YouTube
| Patrón | contentType | identifier |
|--------|------------|------------|
| `youtube.com/watch?v={id}` | `video` | Video ID |
| `youtu.be/{id}` | `video` | Video ID |
| `youtube.com/shorts/{id}` | `short` | Short ID |
| `youtube.com/@/{username}` | `profile` | Channel handle |
| `youtube.com/channel/{id}` | `profile` | Channel ID |

### Facebook
| Patrón | contentType | identifier |
|--------|------------|------------|
| `facebook.com/{user}/videos/{id}` | `video` | Video ID |
| `facebook.com/watch` | `video` | Video ID (de `?v=`) |
| `fb.watch/{id}` | `video` | Watch ID |

### No soportado
Cualquier URL que no coincida con los patrones anteriores retorna `provider: 'unsupported'`.

## Integración en Dashboard

En `src/routes/DashboardPage.tsx`:

1. El usuario pega una URL en el input hero.
2. Se ejecuta `detectSource` con un **debounce de 300ms** en cada cambio.
3. Se muestra un panel animado con Framer Motion:
   - **Instagram**: icono con gradiente + "Instagram detectado"
   - **YouTube**: icono rojo + "YouTube detectado"
   - **Facebook**: icono azul + "Facebook detectado"
   - **Unsupported**: badge amarillo "Plataforma no soportada por ahora"
4. Todo con efecto `glass` + `glow-purple` del Design System.

## Ejemplos

```typescript
import { detectSource } from '@/services/source-detector';

// Instagram post
detectSource('https://www.instagram.com/p/Cr5KJQvu1Hs/');
// {
//   provider: 'instagram',
//   contentType: 'post',
//   identifier: 'Cr5KJQvu1Hs',
//   url: 'https://www.instagram.com/p/Cr5KJQvu1Hs',
//   originalUrl: 'https://www.instagram.com/p/Cr5KJQvu1Hs/'
// }

// YouTube short
detectSource('https://youtube.com/shorts/dQw4w9WgXcQ');
// { provider: 'youtube', contentType: 'short', identifier: 'dQw4w9WgXcQ', ... }

// URL con UTM (se normaliza)
detectSource('https://instagram.com/p/Cr5KJQvu1Hs/?utm_source=instagram');
// url: 'https://instagram.com/p/Cr5KJQvu1Hs' (sin UTM)

// No soportado
detectSource('https://www.tiktok.com/@usuario/video/123');
// { provider: 'unsupported', contentType: 'profile', identifier: '', ... }
```

## Tests

Archivo: `src/services/source-detector.test.ts` (20+ tests con Vitest)

Cubre:
- Detección de cada plataforma y tipo de contenido
- Normalización de URL (UTM, trailing slash, protocolo)
- URLs inválidas
- Caso unsupported
- Consistencia del resultado (nunca null, todos los campos presentes)

## Ejecución de tests

```bash
npm run test -- source-detector
```

---

# Fase 6 — Verificación de accesibilidad + Importación (Source Providers)

## Resumen

La Fase 6 agrega la capa de **Source Providers** que verifica si una fuente es
accesible y obtiene sus metadatos **usando únicamente APIs oficiales**
(Graph API de Meta y YouTube Data API v3 de Google), más el servicio de
importación con **deduplicación obligatoria** y la API `/api/sources/check`.

## Regla de Seguridad #46 (obligatoria)

`src/providers/*` cumple estrictamente:

- ❌ NUNCA: scraping evasivo, bypass de CAPTCHA/login/contenido privado,
  robo de cookies/sesiones, credenciales de terceros, evasión de rate limits,
  ocultar automatización ni descargas no autorizadas.
- ✅ SOLO: OAuth oficial y APIs públicas oficiales.
- Contenido privado → se reporta `PRIVATE` / `AUTH_REQUIRED`. Jamás se intenta acceder.

## Arquitectura

```
URL pegada (Dashboard)
   │  detectSource()            (Fase 5, sin cambios)
   ▼
POST /api/sources/check
   │  checkSource(url)          (src/services/import-service.ts)
   ▼
getSourceProvider(provider)     (src/providers/source-registry.ts)
   │
   ├─ checkAccessibility(url)   → 'ACCESSIBLE' | 'PRIVATE' | ...
   └─ fetchMetadata(url)        → MediaItem[] (solo si ACCESSIBLE)
```

### Archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `src/providers/interface.ts` | Contrato `SourceProvider`, tipo `SourceAccessibility`, `MediaItem`, `SourceCheckResult` y mensajes humanos. Módulo puro (client-safe). |
| `src/providers/mock.ts` | Helpers de simulación (`MOCK_MODE` leído en runtime). |
| `src/providers/instagram.ts` | `InstagramSourceProvider`: Graph API (oEmbed oficial). Sin token → `AUTH_REQUIRED`. Privado → `PRIVATE`. |
| `src/providers/youtube.ts` | `YoutubeSourceProvider`: YouTube Data API v3 (`GOOGLE_API_KEY`). Video público → `ACCESSIBLE`; privado → `AUTH_REQUIRED`; sin cuota/credencial → `API_RESTRICTED`. |
| `src/providers/facebook.ts` | `FacebookSourceProvider`: Graph API con app token (`META_APP_ID`/`META_APP_SECRET`). Solo páginas/perfiles públicos. |
| `src/providers/source-registry.ts` | Registro de los 3 providers + resolución por URL. |
| `src/services/import-service.ts` | `checkSource(url)` + `importFromSource(url, userId, store?)` con dedup a/b/c. |
| `src/app/api/sources/check/route.ts` | `POST { url }` → `{ provider, url, contentType, identifier, accessibility, message, mediaCount }`. |
| `supabase/migrations/20240103000000_phase6_source_dedup.sql` | Columnas de dedup: `media_items.external_id`, `source_url`, `content_hash`, `published_at` y `sources.normalized_url` + índices. |
| `src/providers/instagram.test.ts`, `youtube.test.ts`, `facebook.test.ts` | Tests con `MOCK_MODE=true` (ACCESSIBLE, PRIVATE, API_RESTRICTED, AUTH_REQUIRED, UNAVAILABLE, ERROR). |
| `src/services/import-service.test.ts` | Tests de `checkSource` e `importFromSource` con store en memoria. |

> Nota: los providers de auditoría de la Fase 2 (`src/providers/{instagram,youtube,facebook,tiktok}/index.ts`)
> siguen intactos; `registry.ts` ahora importa con rutas explícitas `/index`
> para evitar el shadowing de los nuevos archivos planos.

### `SourceAccessibility`

```
'ACCESSIBLE' | 'PRIVATE' | 'UNAVAILABLE' | 'UNSUPPORTED' |
'AUTH_REQUIRED' | 'API_RESTRICTED' | 'ERROR'
```

(`CHECKING` es un estado exclusivo de la UI, nunca del provider.)

### Mensajes humanos (ejemplos)

| Estado | Mensaje |
|--------|---------|
| `ACCESSIBLE` (YouTube/Facebook) | "12 videos encontrados" |
| `ACCESSIBLE` (Instagram) | "12 publicaciones encontradas" |
| `PRIVATE` | "Este perfil es privado, no podemos acceder sin autorización." |
| `AUTH_REQUIRED` (YouTube) | "Necesitas conectar tu cuenta de YouTube." |
| `AUTH_REQUIRED` (Instagram) | "Necesitas conectar tu cuenta de Instagram para acceder a este contenido." |
| `AUTH_REQUIRED` (Facebook) | "Necesitas conectar tu cuenta de Facebook para acceder a este contenido." |
| `UNSUPPORTED` | "Plataforma no soportada por ahora. Prueba con Instagram, YouTube o Facebook." |

## API `POST /api/sources/check`

```bash
curl -X POST http://localhost:3000/api/sources/check \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.youtube.com/@micanal"}'
```

```json
{
  "provider": "youtube",
  "url": "https://www.youtube.com/@micanal",
  "contentType": "profile",
  "identifier": "micanal",
  "accessibility": "ACCESSIBLE",
  "message": "12 videos encontrados",
  "mediaCount": 12
}
```

## Servicio de importación (`importFromSource`)

Flujo: `detectSource` → provider → `checkAccessibility` → si `ACCESSIBLE` →
`fetchMetadata` → **dedup obligatoria** → persistir en Supabase (`sources` + `media_items`).

Deduplicación (en este orden de prioridad):

1. **a) por `external_id`** — ID del contenido en la plataforma.
2. **b) por `source_url` normalizada** — sin UTM/hash/trailing slash.
3. **c) por `content_hash`** — SHA-256 de `provider|externalId|url|type`.

Si es duplicado → **no se re-importa**; se retorna el existente con
`alreadyImported: true` y `duplicates: [{ reason, value }]`.

La persistencia es resiliente: si Supabase no está configurado (o falla), el
servicio responde sin persistir (`persisted: false`) sin lanzar errores. El
store es inyectable (`SourceStore`) para tests con memoria.

## MOCK_MODE

Con `MOCK_MODE=true` los providers **no contactan ninguna API**: los estados se
simulan de forma determinista por keywords en la URL:

| URL contiene | Estado |
|--------------|--------|
| `error` | `ERROR` |
| `quota` / `restricted` | `API_RESTRICTED` |
| `auth` | `AUTH_REQUIRED` |
| `private` | `PRIVATE` |
| `gone` / `missing` / `deleted` | `UNAVAILABLE` |
| resto | `ACCESSIBLE` (perfiles → 12 items, contenido individual → 1) |

```bash
npm run test -- --run providers import-service
```

## Integración en Dashboard (Fase 5 + 6)

Después del panel de detección (Fase 5, sin cambios), el Dashboard muestra el
estado animado del acceso (Framer Motion):

1. **CHECKING**: spinner tech violeta (`LoaderCircle` en `text-brand-purple`) +
   puntos pulsantes: "Verificando acceso en YouTube...".
2. **ACCESSIBLE**: check verde + "12 videos encontrados" (glow purple).
3. **PRIVATE**: amarillo + "Este perfil es privado, no podemos acceder sin autorización."
4. **AUTH_REQUIRED**: amarillo + mensaje + botón **Conectar Cuenta** → `/accounts`
   (el OAuth real llega en las Fases 9-12).
5. `API_RESTRICTED` / `UNAVAILABLE` / `ERROR`: naranja/rojo con su mensaje.

Las respuestas obsoletas (usuario sigue tecleando) se descartan con un contador
de secuencia (`checkSeqRef`).

## OAuth (pendiente)

Esta fase NO implementa OAuth (es Fase 9-12). Los providers ya exponen
`setUserAccessToken()` (Instagram/Facebook) para inyectar el token conectado
cuando exista el flujo de cuentas.

