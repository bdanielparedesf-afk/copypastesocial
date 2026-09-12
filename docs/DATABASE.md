# Base de Datos — CopyPasteSocial

Esquema SQL para la aplicación CopyPasteSocial. Todas las tablas tienen **Row Level Security (RLS)** activado con políticas de `user_id = auth.uid()`.

## Tablas

### `audits`
Resultados de auditoría de fuentes (estado de accesibilidad).

| Columna       | Tipo          | Notas                              |
|---------------|---------------|------------------------------------|
| id            | uuid (PK)     | Generado automáticamente           |
| user_id       | uuid (FK)     | Referencia a `auth.users`          |
| source_url    | text          | URL original auditada              |
| provider      | text          | instagram / youtube / facebook / tiktok |
| status        | text          | CHECKING, ACCESSIBLE, PRIVATE, etc.|
| title         | text          | Título del contenido               |
| message       | text          | Mensaje descriptivo                |
| metadata      | jsonb         | Datos extra (thumbnail, oembed)    |
| created_at    | timestamptz   | Fecha de creación                  |

### `jobs`
Jobs de descarga/transcodificación/publicación.

| Columna    | Tipo          | Notas                         |
|------------|---------------|-------------------------------|
| id         | uuid (PK)     |                               |
| user_id    | uuid (FK)     |                               |
| audit_id   | uuid (FK)     | Referencia a `audits`         |
| status     | text          | pending, running, completed, failed |
| progress   | integer       | 0-100                         |
| result     | jsonb         | Resultado de la descarga      |
| error      | text          | Mensaje de error si falló     |
| created_at | timestamptz   |                               |
| updated_at | timestamptz   | Auto-actualizado por trigger  |

### `sources`
Fuentes importadas (URLs auditadas con sus items multimedia).

| Columna        | Tipo          | Notas                           |
|----------------|---------------|---------------------------------|
| id             | uuid (PK)     |                                 |
| user_id        | uuid (FK)     | Dueño de la fuente              |
| original_url   | text          | URL original pegada             |
| provider       | text          | instagram / youtube / facebook / tiktok |
| identifier     | text          | ID del contenido en la plataforma |
| content_type   | text          | post, reel, story, video        |
| status         | text          | Estado de auditoría             |
| normalized_url | text          | Dedup a nivel de fuente: URL original normalizada (sin UTM, sin hash, sin trailing slash) |
| created_at     | timestamptz   |                                 |
| updated_at     | timestamptz   | Auto-actualizado                |

### `media_items`
Ítems multimedia descargados de una fuente.

| Columna       | Tipo          | Notas                               |
|---------------|---------------|-------------------------------------|
| id            | uuid (PK)     |                                     |
| source_id     | uuid (FK)     | Referencia a `sources`, cascade     |
| url           | text          | URL del medio                       |
| thumbnail_url | text          | URL de la miniatura                 |
| type          | text          | video, image, carousel              |
| duration      | double        | Duración en segundos (si aplica)    |
| width         | integer       | Resolución horizontal               |
| height        | integer       | Resolución vertical                 |
| metadata      | jsonb         | Datos extra (caption, hashtags, title) |
| external_id   | text          | Dedup (a): ID del contenido en la plataforma origen |
| source_url    | text          | Dedup (b): URL normalizada del item (sin UTM/hash)  |
| content_hash  | text          | Dedup (c): SHA-256 de `provider\|external_id\|url\|type` |
| published_at  | timestamptz   | Fecha de publicación en la plataforma |
| created_at    | timestamptz   | Fecha de importación                |

### `social_accounts`
Cuentas sociales conectadas (tokens encriptados AES-256-GCM).

| Columna       | Tipo          | Notas                               |
|---------------|---------------|-------------------------------------|
| id            | uuid (PK)     |                                     |
| user_id       | uuid (FK)     |                                     |
| provider      | text          | instagram / youtube / facebook / tiktok |
| username      | text          | Nombre de usuario                   |
| access_token  | text          | Encriptado                          |
| refresh_token | text          | Encriptado (nullable)               |
| expires_at    | timestamptz   |                                     |
| scopes        | jsonb         | Permisos OAuth                      |
| is_valid      | boolean       | Si la sesión sigue activa           |
| created_at    | timestamptz   |                                     |
| updated_at    | timestamptz   | Auto-actualizado                    |

### `provider_tokens` (Fase 9)
Almacén central de tokens de Instagram OAuth (long-lived ~60 días). Los tokens van **siempre encriptados** (AES-256-GCM) como en el resto del proyecto.

| Columna            | Tipo        | Notas                               |
|--------------------|-------------|-------------------------------------|
| id                 | uuid (PK)   |                                     |
| user_id            | uuid (FK)   | Dueño del token                     |
| provider           | text        | instagram (por ahora único)         |
| social_account_id  | uuid (FK)   | Referencia a `social_accounts` (set null) |
| access_token       | text        | Encriptado (long-lived)             |
| refresh_token      | text        | Encriptado (nullable)               |
| token_type         | text        | long-lived                          |
| ig_user_id         | text        | ID de la cuenta IG                  |
| username           | text        | Nombre de usuario IG                |
| scopes             | jsonb       | Permisos OAuth                      |
| expires_at         | timestamptz | Expiración del token                |
| is_valid           | boolean     | false al revocar/fallar validación  |
| needs_refresh      | boolean     | true cuando el cron falló           |
| last_refreshed_at  | timestamptz | Último refresh del job cron         |
| created_at         | timestamptz |                                     |
| updated_at         | timestamptz | Auto-actualizado                    |

- Único: `uq_provider_tokens_user_provider_username` (user_id, provider, username) → soporta `upsert`.
- Índices: `idx_provider_tokens_user_provider` (user_id, provider) y `idx_provider_tokens_expiry` (expires_at) para el job cron.
- El job cron de refresh marca tokens con `expires_at <= now + 5 días` y los re-intercambia.

### `publish_queue` (Fase 10)
Cola de publicación de Instagram (REELS 9:16). Publica media_items que ya están `READY` (Fase 8) vía Graph API.

| Columna             | Tipo        | Notas                               |
|---------------------|-------------|-------------------------------------|
| id                  | uuid (PK)   |                                     |
| user_id             | uuid (FK)   | Dueño (RLS)                         |
| social_account_id   | uuid (FK)   | Cuenta IG conectada (Fase 9)        |
| media_id            | uuid (FK)   | media_item READY (Fase 8)           |
| caption             | text        | Máx. 2200 chars + trim              |
| video_url           | text        | Signed URL del bucket `processed`   |
| status              | text        | PENDING / SCHEDULED / PUBLISHING / PUBLISHED / FAILED |
| scheduled_at        | timestamptz | Si hay schedule, se publica cuando <= now() |
| attempts            | integer     | Reintentos (retry 3 si ERROR)       |
| ig_media_id         | text        | media_id real de Meta (o mock_*)    |
| error               | text        | Mensaje de error                |
| created_at          | timestamptz |                                     |
| updated_at          | timestamptz | Auto-actualizado                    |

- Índices: `idx_publish_queue_user_status` (user_id, status) y `idx_publish_queue_due` (status, scheduled_at) para el cron.
- Sin token real → fallback MOCK que marca `PUBLISHED` con `ig_media_id mock_*`.
- URL del video siempre firmada del bucket `processed` (nunca `raw`).

### `publications`
Publicaciones programadas o completadas.

| Columna          | Tipo          | Notas                    |
|------------------|---------------|--------------------------|
| id               | uuid (PK)     |                          |
| user_id          | uuid (FK)     |                          |
| source_id        | uuid (FK)     | Referencia a `sources`   |
| social_account_id| uuid (FK)     | Referencia a `social_accounts` |
| caption          | text          | Pie de foto              |
| status           | text          | pending, processing, published, failed |
| scheduled_at     | timestamptz   | Si está programada       |
| created_at       | timestamptz   |                          |
| updated_at       | timestamptz   | Auto-actualizado         |

### `publication_jobs`
Jobs de publicación (download, transcode, publish).

| Columna       | Tipo          | Notas                         |
|---------------|---------------|-------------------------------|
| id            | uuid (PK)     |                                 |
| publication_id| uuid (FK)     | Referencia a `publications`    |
| type          | text          | download, transcode, publish   |
| status        | text          | pending, running, completed, failed |
| attempts      | integer       | Intento actual                 |
| error         | text          | Mensaje de error               |
| payload       | jsonb         | Datos del job                  |
| created_at    | timestamptz   |                                 |

## Políticas RLS

Todas las tablas tienen RLS activado. Las políticas verifican que `auth.uid() = user_id` para operaciones propias. `media_items` y `publication_jobs` validan propiedad a través del recurso padre (exists subquery).

## Triggers

Tablas con `updated_at` tienen un trigger `trg_*_updated_at` que actualiza el campo automáticamente antes de cada UPDATE.

## Índices

- `idx_sources_user_id` — `sources(user_id)`
- `idx_sources_user_normalized_url` — `sources(user_id, normalized_url)` (dedup de fuente)
- `idx_media_items_source_id` — `media_items(source_id)`
- `idx_media_items_external_id` — `media_items(external_id)` (dedup a)
- `idx_media_items_source_url` — `media_items(source_url)` (dedup b)
- `idx_media_items_content_hash` — `media_items(content_hash)` (dedup c)
- `idx_social_accounts_user_id` — `social_accounts(user_id)`
- `idx_publications_user_id` — `publications(user_id)`
- `idx_publication_jobs_pub_id` — `publication_jobs(publication_id)`

## Duplicados (Fase 6)

La detección de duplicados es **obligatoria** en `importFromSource` y usa las
tres claves en orden: `external_id` (a) → `source_url` normalizada (b) →
`content_hash` (c). Los índices no son únicos: la unicidad se controla por
usuario en `src/services/import-service.ts` vía queries con RLS/service role.

En la UI (`/content`) un item se marca "Duplicado" si comparte alguna de las
tres claves con otro item del usuario; el modal muestra el mensaje
"Este contenido ya existe — importado el DD/MM" usando la fecha de
`created_at` del item más antiguo del grupo.
