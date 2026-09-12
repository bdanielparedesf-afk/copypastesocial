# CopyPasteSocial — Design System

## Paleta de colores

### Base (ink)
| Token | Valor | Uso |
|-------|-------|-----|
| ink-900 | `#0A0A0B` | Background principal |
| ink-800 | `#151517` | Background secundario, cards |
| ink-700 | `#1F1F22` | Border, separators |
| ink-600 | `#2A2A2E` | Elevated surfaces |
| ink-500 | `#3A3A3F` | Muted elements |

### Brand (gradient)
| Token | Valor | Uso |
|-------|-------|-----|
| brand-purple | `#7C3AED` | Primary start, accents |
| brand-cyan | `#06B6D4` | Primary end, highlights |
| gradient-brand | `linear-gradient(135deg, #7C3AED, #06B6D4)` | Buttons, headers |

### Status
| Token | Valor | Uso |
|-------|-------|-----|
| status-checking | `#F59E0B` | En progreso |
| status-accessible | `#22C55E` | Éxito |
| status-private | `#EF4444` | Privado |
| status-unavailable | `#6B7280` | No disponible |
| status-unsupported | `#8B5CF6` | No soportado |
| status-auth | `#EAB308` | Auth requerido |
| status-api | `#F97316` | API restringida |
| status-error | `#DC2626` | Error |

## Tipografía

- **Sans-serif**: Geist — body, headings, UI
- **Mono**: Geist Mono — code, URLs, data

## Componentes

### Button
- Variantes: `default` (gradient), `glow` (gradient+glow), `destructive`, `outline`, `secondary`, `ghost`, `link`
- Tamaños: `sm`, `default`, `lg`, `xl`, `icon`, `icon-sm`
- Características: hover scale(1.02), active scale(0.98), focus ring, shadow glow

### Card
- Variantes: `glass` (blur + border), `strong` (darker + blur), default (border + bg)
- Subcomponentes: CardHeader, CardTitle, CardDescription, CardContent, CardFooter

### Badge
- Variantes: `default`, `secondary`, `destructive`, `outline`, `status`
- Modo `status`: aplica clase `status-{status}` con colores predefinidos

### Input
- Estilo "command": rounded-lg, bg-background/50, focus ring brand-purple/50
- Props: `error` (mostrar mensaje), `icon` (icono a la izquierda)

### Skeleton
- Variantes: `text`, `circular`, `rectangular`, `card`
- Efecto shimmer con animated gradient

### Spinner
- Basado en LoaderCircle de Lucide React
- Animación spin infinita

## Animaciones

| Nombre | Keyframes | Duración |
|--------|-----------|----------|
| fade-in | opacity + translateY(8px) → 0 | 0.5s |
| pulse-glow | opacity 0.4 ↔ 0.8 | 2s |
| spin | rotate 0 → 360deg | 1s |
| shimmer | background-position -200% → 200% | 2s |

## Tokens CSS (globals.css)

```css
:root {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --primary: 262 70% 55%;
  --ring: 262 70% 55%;
  /* ... */
}
```

## Utilidades CSS

| Clase | Efecto |
|-------|--------|
| `.glass` | blur(20px) + border rgba(255,255,255,0.08) |
| `.glass-strong` | blur(24px) + border rgba(255,255,255,0.10) |
| `.text-gradient` | bg-clip-text + gradient-brand |
| `.glow-purple` | box-shadow brand-purple glow |
| `.glow-cyan` | box-shadow brand-cyan glow |