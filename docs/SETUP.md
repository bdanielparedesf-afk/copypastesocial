# CopyPasteSocial — Setup

## Requisitos previos

- Node.js >= 18
- npm >= 9
- FFmpeg instalado en el sistema (para workers de transcodificación)
- Cuenta de Supabase (https://supabase.com)

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-organisation/copy-paste-social
cd copy-paste-social

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales

# 4. Configurar Supabase
# Crear un proyecto en https://supabase.com
# Copiar URL y keys a .env

# 5. Ejecutar en modo desarrollo
npm run dev
```

## Variables de entorno

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Clave anónima (pública)
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio (solo backend)
- `DATABASE_URL`: URL de conexión a PostgreSQL

### Meta (Instagram + Facebook)
- `META_APP_ID`: ID de la aplicación Meta
- `META_APP_SECRET`: Secreto de la aplicación Meta

### Google (YouTube)
- `GOOGLE_API_KEY`: API key de Google Cloud
- `GOOGLE_CLIENT_ID`: Client ID de OAuth
- `GOOGLE_CLIENT_SECRET`: Client Secret de OAuth

### TikTok
- `TIKTOK_CLIENT_KEY`: Client Key de TikTok for Developers
- `TIKTOK_CLIENT_SECRET`: Client Secret de TikTok

### Otros
- `ENCRYPTION_KEY`: Clave de 32 bytes para encriptación
- `MOCK_MODE`: `true` para usar datos simulados
- `FFMPEG_PATH`: Ruta al binario de FFmpeg
- `PORT`: Puerto del server (default: 3000)

## Scripts

| Script | Comando |
|--------|---------|
| Desarrollo | `npm run dev` |
| Build | `npm run build` |
| Producción | `npm start` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |

## Estructura de la app

La aplicación usa Next.js App Router:
- `src/app/layout.tsx`: Layout raíz
- `src/app/page.tsx`: Página de inicio (Dashboard)
- `src/app/globals.css`: Estilos globales + tokens de diseño

## Proveedores soportados

| Prologo | API | Auth | Estado |
|---------|-----|------|--------|
| Instagram | Facebook Graph API | OAuth2 | IMPLEMENTADO |
| YouTube | Google API v3 | API Key + OAuth2 | IMPLEMENTADO |
| Facebook | Facebook Graph API | OAuth2 | IMPLEMENTADO |
| TikTok | TikTok API v2 | OAuth2 | AUTH_REQUIRED |