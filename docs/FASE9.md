# FASE 9 — INSTAGRAM GRAPH API + OAUTH — AUTH REAL

**Fecha:** 2026-09-12
**Status:** IMPLEMENTADA ✅ (flujo real, no mock)
**Typecheck:** `npm run typecheck` → 0 errores
**Check:** `.\check-fase9.ps1` → OAuth flow OK + 8 exports + long-lived 60 días + refresh < 5 días

## Objetivo

Login real con Facebook OAuth para Instagram Business, token long-lived
(~60 días) y refresh automático a **< = 5 días de expirar** (job cron).

## Estructura de archivos

| Archivo | Rol |
| --- | --- |
| `src/lib/providers/instagram/client.ts` | Cliente real de la Instagram **Graph API** (fetch + errores de Meta tipados). |
| `src/lib/providers/instagram/auth.ts` | **8 exports obligatorios** del flujo OAuth. |
| `src/lib/providers/instagram/token.ts` | Guardado en `provider_tokens` (encriptado) + job cron `refreshExpiringTokens`. |
| `src/app/api/auth/instagram/route.ts` | `GET/POST` → devuelve la URL del Facebook Login (`getAuthUrl`). |
| `src/app/api/auth/instagram/callback/route.ts` | Callback: `exchangeCode` → `getLongLivedToken` → perfil → `saveInstagramToken`. |
| `src/app/api/cron/refresh-instagram-tokens/route.ts` | Job cron protegido por `CRON_SECRET` (refresh < 5 días). |
| `supabase/migrations/20240105000000_phase9_instagram_tokens.sql` | Tabla `provider_tokens` con `expires_at` + `refresh_token`. |
| `check-fase9.ps1` | Check automático del flujo. |

## 8 exports obligatorios (`auth.ts`)

1. `getAuthUrl({ redirectUri, state })` → URL del **Facebook Login** (`dialog/oauth`) con scopes `instagram_basic, instagram_content_publish, pages_show_list, business_management`.
2. `exchangeCode(code, redirectUri)` → POST `oauth/access_token` → token de **corta duración** (~2h).
3. `getLongLivedToken(shortLivedToken)` → `grant_type=fb_exchange_token` → **long-lived ~60 días**.
4. `refreshToken(longLivedToken)` → re-intercambia el long-lived (fb_exchange_token). El job cron lo llama a < 5 días de expirar.
5. `getUserProfile(accessToken)` → perfil IG (`/me`, fields: id, username, account_type, media_count, followers_count).
6. `validateToken(accessToken)` → `debug_token` de Meta (`{appId}|{appSecret}`) → vigencia + scopes.
7. `revokeToken(accessToken)` → DELETE `/me/permissions` (idempotente).
8. `getMediaContainerStatus(containerId, accessToken)` → `status_code` de un contenedor IG.

## Flujo OAuth real

```
GET/POST /api/auth/instagram
  └─ getAuthUrl() ──────────────────────────────► Facebook Login → redirect
GET /api/auth/instagram/callback?code=...&state=...
  └─ exchangeCode(code)        → token corto (~2h)
  └─ getLongLivedToken(corto)  → token long-lived (~60 días)
  └─ getUserProfile(longLived) → username + id IG
  └─ saveInstagramToken()      → provider_tokens (AES-256-GCM) + social_accounts
POST /api/cron/refresh-instagram-tokens   [x-cron-secret]
  └─ refreshExpiringTokens({ thresholdDays: 5 })
        → tokens con expires_at <= now + 5 días
        → refreshToken() vía fb_exchange_token → +60 días
```

## Seguridad

- **Tokens SIEMPRE encriptados** con `TokenService` (AES-256-GCM), igual que el resto del proyecto.
- `provider_tokens` con **RLS** (`auth.uid() = user_id`).
- **CSRF**: el `state` del login se valida en el callback.
- Cron protegido por header `x-cron-secret` (`CRON_SECRET`); sin `CRON_SECRET` en dev sigue el patrón MOCK/DEV.
- Upsert idempotente (`uq_provider_tokens_user_provider_username`) para no duplicar.
- Si el refresh falla, el token se marca `is_valid = false` (nunca se borra).

## Checks de cierre

- [x] `npm run typecheck` → 0 errores
- [x] `.\check-fase9.ps1` → OAuth flow OK + token long-lived 60 días + refresh < 5 días
- [x] 8 exports obligatorios implementados y verificados
- [x] Migración `provider_tokens` con `expires_at` + `refresh_token` + RLS
- [x] Job cron de refresh automático
- [x] No mock: llamadas reales a `graph.facebook.com`

> **Nota:** requiere app de Meta configurada (`META_APP_ID`, `META_APP_SECRET`) y modo de "Instagram for Business" en el panel de Meta con redirect URI `.../api/auth/instagram/callback`.