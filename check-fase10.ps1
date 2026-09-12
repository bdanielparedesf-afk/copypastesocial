# check-fase10.ps1 - FASE 10 check: Publishing real de Instagram
Write-Host "=== FASE 10 CHECK ===" -ForegroundColor Cyan

Write-Host "`n[1] Node/npm:" -ForegroundColor Yellow
node -v
npm -v

Write-Host "`n[2] Exports de src/lib/publishing/publisher.ts (7):" -ForegroundColor Yellow
$pub = Get-Content "src/lib/publishing/publisher.ts" -Raw
$required = @(
  "validateCaption",
  "getAccessToken",
  "getSignedProcessedUrl",
  "createContainer",
  "getContainerStatus",
  "publishContainer",
  "publishToInstagram"
)
$okCount = 0
foreach ($fn in $required) {
  if ($pub -match ("export (async )?function $fn")) {
    Write-Host "  $fn  OK" -ForegroundColor Green
    $okCount++
  } else {
    Write-Host "  $fn  FALTA" -ForegroundColor Red
  }
}

Write-Host "`n[3] Flujo de publicación real:" -ForegroundColor Yellow
if ($pub -match "media_type") { Write-Host "  createContainer (media_type REELS) OK" -ForegroundColor Green } else { Write-Host "  createContainer FALTA" -ForegroundColor Red }
if ($pub -match "status_code") { Write-Host "  getContainerStatus OK" -ForegroundColor Green } else { Write-Host "  getContainerStatus FALTA" -ForegroundColor Red }
if ($pub -match "media_publish") { Write-Host "  publishContainer (/media_publish) OK" -ForegroundColor Green } else { Write-Host "  publishContainer FALTA" -ForegroundColor Red }
if ($pub -match "getSignedUrl") { Write-Host "  Signed URL bucket processed OK" -ForegroundColor Green } else { Write-Host "  Signed URL FALTA" -ForegroundColor Red }
if ($pub -match "MAX_CONTAINER_ATTEMPTS = 3") { Write-Host "  Retry 3 intentos OK" -ForegroundColor Green } else { Write-Host "  Retry 3 FALTA" -ForegroundColor Red }
if ($pub -match "mock_") { Write-Host "  Fallback MOCK OK" -ForegroundColor Green } else { Write-Host "  Fallback MOCK FALTA" -ForegroundColor Red }
if ($pub -match "2200") { Write-Host "  Caption max 2200 OK" -ForegroundColor Green } else { Write-Host "  Caption 2200 FALTA" -ForegroundColor Red }

Write-Host "`n[4] Cola (publish_queue):" -ForegroundColor Yellow
$q = Get-Content "src/lib/publishing/queue.ts" -Raw
foreach ($fn in @("enqueuePost","getQueue","getDueItems","cancelScheduled","retryFailed","processPost")) {
  if ($q -match ("export async function $fn")) { Write-Host "  $fn OK" -ForegroundColor Green } else { Write-Host "  $fn FALTA" -ForegroundColor Red }
}
if ($q -match "CONTAINER_POLL_INTERVAL_MS = 5_000") { Write-Host "  Polling 5s OK" -ForegroundColor Green } else { Write-Host "  Polling 5s FALTA" -ForegroundColor Red }
if ($q -match "'PUBLISHED'") { Write-Host "  Status PUBLISHED OK" -ForegroundColor Green } else { Write-Host "  Status PUBLISHED FALTA" -ForegroundColor Red }

Write-Host "`n[5] Migración publish_queue:" -ForegroundColor Yellow
$mig = Get-Content "supabase/migrations/20240106000000_phase10_publish_queue.sql" -Raw
if ($mig -match "create table public.publish_queue") { Write-Host "  Tabla publish_queue OK" -ForegroundColor Green } else { Write-Host "  publish_queue FALTA" -ForegroundColor Red }
foreach ($st in @("PENDING","SCHEDULED","PUBLISHING","PUBLISHED","FAILED")) {
  if ($mig -match $st) { Write-Host "  status $st OK" -ForegroundColor Green } else { Write-Host "  status $st FALTA" -ForegroundColor Red }
}
if ($mig -match "enable row level security") { Write-Host "  RLS OK" -ForegroundColor Green } else { Write-Host "  RLS FALTA" -ForegroundColor Red }

Write-Host "`n[6] Rutas API:" -ForegroundColor Yellow
if (Test-Path "src/app/api/publish/route.ts") { Write-Host "  POST /api/publish OK" -ForegroundColor Green } else { Write-Host "  /api/publish FALTA" -ForegroundColor Red }
if (Test-Path "src/app/api/cron/publish-scheduled/route.ts") { Write-Host "  POST /api/cron/publish-scheduled OK" -ForegroundColor Green } else { Write-Host "  cron FALTA" -ForegroundColor Red }

Write-Host "`n[7] Typecheck:" -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -eq 0) { Write-Host "`nTYPECHECK OK - Fase 10 lista para cierre" -ForegroundColor Green }
else { Write-Host "`nTYPECHECK FALLO - arregla antes de continuar" -ForegroundColor Red }

Write-Host "`n=== FIN FASE 10 ===" -ForegroundColor Cyan