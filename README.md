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
- [ ] Fase 2: Selección de contenido
- [ ] Fase 3: Descarga y transcodificación
- [ ] Fase 4: Publicación en destinos
- [ ] Fase 5: Historial y analytics

## Docs

- [Arquitectura](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Design System](docs/DESIGN.md)