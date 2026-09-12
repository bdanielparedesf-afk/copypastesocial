# check-fase9.ps1 - FASE 9 check: Instagram Graph API + OAuth real
Write-Host "=== FASE 9 CHECK ===" -ForegroundColor Cyan

Write-Host "`n[1] Node/npm:" -ForegroundColor Yellow
node -v
npm -v

Write-Host "`n[2] Exports obligatorios (8) en src/lib/providers/instagram/:" -ForegroundColor Yellow
$auth = Get-Content "src/lib/providers/instagram/auth.ts" -Raw
$required = @(
  "getAuthUrl",
  "exchangeCode",
  "getLongLivedToken",
  "refreshToken",
  "getUserProfile",
  "validateToken",
  "revokeToken",
  "getMediaContainerStatus"
)
$okCount = 0
foreach ($fn in $required) {
  if ($auth -match ("export (async )?function $fn")) {
    Write-Host "  $fn  OK" -ForegroundColor Green
    $okCount++
  } else {
    Write-Host "  $fn  FALTA" -ForegroundColor Red
  }
}

Write-Host "`n[3] Flujo OAuth real:" -ForegroundColor Yellow
if ($auth -match "fb_exchange_token") { Write-Host "  Long-lived (fb_exchange_token) OK" -ForegroundColor Green } else { Write-Host "  Long-lived FALTA" -ForegroundColor Red }
if ($auth -match "dialog/oauth") { Write-Host "  Facebook Login dialog OK" -ForegroundColor Green } else { Write-Host "  Facebook Login dialog FALTA" -ForegroundColor Red }
if ($auth -match "debug_token") { Write-Host "  validateToken (debug_token) OK" -ForegroundColor Green } else { Write-Host "  validateToken FALTA" -ForegroundColor Red }
if ($auth -match "me/permissions") { Write-Host "  revokeToken (/me/permissions) OK" -ForegroundColor Green } else { Write-Host "  revokeToken FALTA" -ForegroundColor Red }
if ($auth -match "status_code") { Write-Host "  getMediaContainerStatus OK" -ForegroundColor Green } else { Write-Host "  getMediaContainerStatus FALTA" -ForegroundColor Red }

Write-Host "`n[4] Gestión de tokens (provider_tokens):" -ForegroundColor Yellow
$token = Get-Content "src/lib/providers/instagram/token.ts" -Raw
if ($token -match "saveInstagramToken") { Write-Host "  saveInstagramToken OK" -ForegroundColor Green } else { Write-Host "  saveInstagramToken FALTA" -ForegroundColor Red }
if ($token -match "refreshExpiringTokens") { Write-Host "  refreshExpiringTokens OK" -ForegroundColor Green } else { Write-Host "  refreshExpiringTokens FALTA" -ForegroundColor Red }
if ($token -match "REFRESH_THRESHOLD_DAYS = 5") { Write-Host "  Refresh < 5 dias antes de expirar OK" -ForegroundColor Green } else { Write-Host "  Refresh < 5 dias FALTA" -ForegroundColor Red }
if ($token -match "onConflict") { Write-Host "  Upsert idempotente OK" -ForegroundColor Green } else { Write-Host "  Upsert FALTA" -ForegroundColor Red }

Write-Host "`n[5] Migración provider_tokens:" -ForegroundColor Yellow
$mig = Get-Content "supabase/migrations/20240105000000_phase9_instagram_tokens.sql" -Raw
if ($mig -match "create table public.provider_tokens") { Write-Host "  Tabla provider_tokens OK" -ForegroundColor Green } else { Write-Host "  provider_tokens FALTA" -ForegroundColor Red }
if ($mig -match "expires_at") { Write-Host "  Columna expires_at OK" -ForegroundColor Green } else { Write-Host "  expires_at FALTA" -ForegroundColor Red }
if ($mig -match "refresh_token") { Write-Host "  Columna refresh_token OK" -ForegroundColor Green } else { Write-Host "  refresh_token FALTA" -ForegroundColor Red }
if ($mig -match "enable row level security") { Write-Host "  RLS OK" -ForegroundColor Green } else { Write-Host "  RLS FALTA" -ForegroundColor Red }

Write-Host "`n[6] Rutas API:" -ForegroundColor Yellow
if (Test-Path "src/app/api/auth/instagram/route.ts") { Write-Host "  /api/auth/instagram route.ts OK" -ForegroundColor Green } else { Write-Host "  route.ts FALTA" -ForegroundColor Red }
if (Test-Path "src/app/api/auth/instagram/callback/route.ts") { Write-Host "  /api/auth/instagram/callback OK" -ForegroundColor Green } else { Write-Host "  callback FALTA" -ForegroundColor Red }

Write-Host "`n[7] Job cron de refresh:" -ForegroundColor Yellow
if (Test-Path "src/app/api/cron/refresh-instagram-tokens/route.ts") { Write-Host "  /api/cron/refresh-instagram-tokens OK" -ForegroundColor Green } else { Write-Host "  cron route FALTA" -ForegroundColor Red }
$cron = Get-Content "src/lib/providers/instagram/token.ts" -Raw
if ($cron -match "lte\('expires_at'") { Write-Host "  Query expires_at <= cutoff OK" -ForegroundColor Green } else { Write-Host "  Query cutoff FALTA" -ForegroundColor Red }

Write-Host "`n[8] Typecheck:" -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -eq 0) { Write-Host "`nTYPECHECK OK - Fase 9 lista para cierre" -ForegroundColor Green }
else { Write-Host "`nTYPECHECK FALLO - arregla antes de continuar" -ForegroundColor Red }

Write-Host "`n=== FIN FASE 9 ===" -ForegroundColor Cyan