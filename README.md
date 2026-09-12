# CopyPasteSocial

**Importa. Selecciona. Publica.**

Importa contenido de redes sociales (Instagram, YouTube, Facebook, TikTok), elige exactamente lo que quieres copiar y publícalo en tus destinos sin perder el control.

## Stack

Next.js 14 (App Router) + TypeScript + Supabase + Tailwind CSS + shadcn/ui + Framer Motion + Lucide React + FFmpeg

## Estructura

```
src/
├── app/              # Next.js App Router
├── providers/        # Proveedores de redes sociales
├── services/         # Servicios de negocio
├── workers/          # Workers asíncronos (download, transcode, publish)
├── types/            # Tipos compartidos
├── utils/            # Utilidades
├── config/           # Configuración centralizada
├── components/ui/    # shadcn/ui primitives
└── lib/supabase/     # Supabase client
```

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

## Roadmap

- [x] Fase 1: Auditoría + Design System
- [x] Fase 4: Publicación en destinos
- [x] Fase 6: Detección de fuentes + dedup
- [x] Fase 7: API de contenido y cuentas
- [x] **Fase 8: Media Processor real (9:16 TikTok)** — OK ✅ (_2026-09-12_)
- [ ] Fase 9: OAuth Instagram (pendiente)

## Docs

- [Arquitectura](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Design System](docs/DESIGN.md)