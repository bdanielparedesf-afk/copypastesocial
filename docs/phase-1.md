# Fase 1 — Núcleo y dashboard

## Alcance implementado

- App React 19 + TypeScript + Vite.
- Shell responsive con sidebar colapsable, topbar y layout centrado.
- `/dashboard` con hero, input tipo command-k y atajo `Ctrl/Cmd + K`.
- Normalización y validación segura de URLs HTTP/HTTPS.
- Auto-detección de Instagram, YouTube/youtu.be y Facebook.
- Estados de análisis: `CHECKING`, `ACCESSIBLE`, `PRIVATE`, `ERROR`.
- Tarjetas bento de compatibilidad y pasos futuros.
- Diseño dark tech minimal con glassmorphism, gradientes violeta/cyan, Lucide React y Framer Motion.
- Tests unitarios y de componente para detección, análisis y flujo del dashboard.

## Comportamiento actual

El análisis de la Fase 1 es local y determinista. No realiza llamadas a APIs sociales ni guarda datos. Las URLs con marcadores `/private/`, `/closed/` o `?access=private` simulan una fuente privada; las fuentes compatibles públicas pasan a `ACCESSIBLE`.

## Validación

Ejecutados correctamente:

```text
npm test       -> 2 archivos, 10 tests aprobados
npx tsc --noEmit -> sin errores
npm run lint   -> sin errores ni warnings
npm run build  -> build Vite completado
```

## Archivos principales

- `src/routes/DashboardPage.tsx`
- `src/components/AppShell.tsx`
- `src/components/PlatformMark.tsx`
- `src/lib/sourceAnalyzer.ts`
- `src/lib/platforms.ts`
- `src/styles.css`
- `src/test/sourceAnalyzer.test.ts`
- `src/test/DashboardPage.test.tsx`

## Criterio de salida

La Fase 1 queda cerrada sin errores críticos. Las fases de selección de contenido, cuentas, fotocopiado, progreso y publicaciones permanecen fuera de esta iteración.
