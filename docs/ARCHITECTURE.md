# CopyPasteSocial — Arquitectura

## Visión general

Aplicación web de Next.js 14 (App Router) + TypeScript que permite auditar fuentes de redes sociales (Instagram, YouTube, Facebook, TikTok), seleccionar contenido y prepararlo para publicación en destinos múltiples.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript 6.0 (strict) |
| Estilos | Tailwind CSS 3.4 + shadcn/ui |
| Animaciones | Framer Motion 13 |
| Iconos | Lucide React 0.554 |
| Estado | React 19 + hooks |
| Backend DB | Supabase (PostgreSQL) |
| Client DB | @supabase/supabase-js |
| Procesamiento | FFmpeg (worker threads) |
| UI primitives | Radix UI (Dialog, Label, Select, Tabs, Tooltip, Slot) |
| Utility | clsx + tailwind-merge + class-variance-authority |

## Estructura de directorios

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout + metadata
│   ├── page.tsx            # Home page
│   └── globals.css         # Tailwind + design tokens
├── providers/              # Plataformas de origen
│   ├── instagram/          # InstagramProvider
│   ├── youtube/            # YoutubeProvider
│   ├── facebook/           # FacebookProvider
│   ├── tiktok/             # TikTokProvider
│   └── index.ts            # Registry + helpers
├── services/               # Servicios de negocio
│   ├── audit.ts            # AuditService
│   └── index.ts            # Registry + helpers
├── workers/                # Workers asíncronos
│   ├── base.ts             # BaseWorker, JobQueue
│   ├── download.ts         # DownloadWorker
│   ├── transcode.ts        # TranscodeWorker (FFmpeg)
│   ├── publish.ts          # PublishWorker
│   └── index.ts
├── types/                  # Tipos compartidos
│   └── index.ts            # SourceProvider, AuditStatus, AuditResult, etc.
├── utils/                  # Utilidades
│   └── index.ts            # cn, debounce, sleep, normalizeUrl, etc.
├── config/                 # Configuración centralizada
│   ├── index.ts            # Config object + helpers
│   └── providers.ts        # Supported providers list
├── components/             # Componentes de UI
│   └── ui/                 # shadcn/ui primitives
│       ├── button.tsx      # Button (gradient + glow)
│       ├── card.tsx        # Card (glass)
│       ├── badge.tsx       # Badge (status colors)
│       ├── input.tsx       # Input (command-style)
│       ├── skeleton.tsx    # Skeleton
│       └── spinner.tsx     # Spinner
├── routes/                 # Páginas (legacy, migradas a app/)
│   └── DashboardPage.tsx   # Dashboard principal
└── lib/
    └── supabase/           # Supabase client + types
        ├── client.ts       # createClient + createServerClient
        └── types.ts        # Database schema types
```

## Flujo de datos

1. **Auditoría**: El usuario pega una URL → `AuditService.audit()` → detecta proveedor → llama `provider.audit()` → devuelve `AuditResult` con `AuditStatus`.
2. **Selección**: El usuario elige contenido del resultado (Fase 2+).
3. **Descarga**: `DownloadWorker` procesa los archivos multimedia.
4. **Transcodificación**: `TranscodeWorker` usa FFmpeg para normalizar formatos.
5. **Publicación**: `PublishWorker` envía a destinos configurados.

## Tipos principales

### AuditStatus (enum)
```
CHECKING | ACCESSIBLE | PRIVATE | UNAVAILABLE | UNSUPPORTED | AUTH_REQUIRED | API_RESTRICTED | ERROR
```

### SourceProvider (interface)
```ts
interface SourceProvider {
  id: ProviderId;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  hostnamePatterns: readonly string[];
  api: { type: 'rest' | 'graphql' | 'oembed' | 'html'; baseUrl: string; auth: 'oauth2' | 'api_key' | 'none' };
  capabilities: { canDownload: boolean; canReadProfile: boolean; ... };
}
```

## Configuración

Ver `.env.example` para todas las variables. La configuración centralizada lives en `src/config/index.ts`.

## Workers

- `BaseWorker`: clase abstracta con `name` y `run(payload)`.
- `JobQueue`: evita duplicación de jobs con `enqueue(id, task)`.
- Workers específicos: `DownloadWorker`, `TranscodeWorker`, `PublishWorker`.

## Design System

- **Colores**: `#0A0A0B` (ink-900), `#151517` (ink-800), gradiente `#7C3AED → #06B6D4`.
- **Fuentes**: Geist (sans) + Geist Mono.
- **Componentes**: Button (gradient+glow), Card (glass), Badge (status colors), Input (command-style), Skeleton, Spinner.
- **Tokens CSS**: HSL variables en `:root` (dark mode por defecto).