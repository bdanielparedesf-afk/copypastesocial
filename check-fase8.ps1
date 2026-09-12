Write-Host "=== FASE 8 CHECK ===" -ForegroundColor Cyan

Write-Host "`n[1] Node y NPM:" -ForegroundColor Yellow
node -v
npm -v
if (Test-Path "package-lock.json") { Write-Host "package-lock.json: EXISTE -> usar npm" -ForegroundColor Green } else { Write-Host "package-lock.json: NO" -ForegroundColor Red }

Write-Host "`n[2] Next.js version:" -ForegroundColor Yellow
$pkg = Get-Content "package.json" -Raw
if ($pkg -match '"next"\s*:\s*"([^"]+)"') {
  $nextVer = $Matches[1]
  Write-Host "Next: $nextVer" -ForegroundColor Green
} else { Write-Host "No se encontro next en package.json" -ForegroundColor Red }

Write-Host "`n[3] FFmpeg:" -ForegroundColor Yellow
 try {
  $ffmpeg = Get-Command ffmpeg -ErrorAction Stop
  Write-Host "FFMPEG en PATH: $($ffmpeg.Source)" -ForegroundColor Green
  Write-Host "FFmpeg REAL OK" -ForegroundColor Green
}
catch {
  Write-Host "FFMPEG NO en PATH -> fallback MOCK de copia (OK segun spec)" -ForegroundColor Yellow
}

Write-Host "`n[4] Exports reales src/lib/media/ffmpeg.ts:" -ForegroundColor Yellow
$content = Get-Content "src/lib/media/ffmpeg.ts" -Raw
if ($content -match "export async function probeVideo") { Write-Host "  probeVideo          OK" -ForegroundColor Green } else { Write-Host "  probeVideo          FALTA" -ForegroundColor Red }
if ($content -match "export async function generateThumbnail") { Write-Host "  generateThumbnail   OK" -ForegroundColor Green } else { Write-Host "  generateThumbnail   FALTA" -ForegroundColor Red }
if ($content -match "export async function transcodeToVertical916") { Write-Host "  transcodeToVertical916 OK" -ForegroundColor Green } else { Write-Host "  transcodeToVertical916 FALTA" -ForegroundColor Red }

Write-Host "`n[5] Pipeline processor.ts:" -ForegroundColor Yellow
$proc = Get-Content "src/lib/media/processor.ts" -Raw
if ($proc -match "processMediaItem") { Write-Host "  processMediaItem   OK" -ForegroundColor Green } else { Write-Host "  processMediaItem   FALTA" -ForegroundColor Red }
if ($proc -match "downloadFile|fetch\(sourceUrl") { Write-Host "  PASO 2 download    OK" -ForegroundColor Green } else { Write-Host "  PASO 2 download    FALTA" -ForegroundColor Red }
if ($proc -match "probeVideo\(inputPath\)") { Write-Host "  PASO 3 metadata    OK" -ForegroundColor Green } else { Write-Host "  PASO 3 metadata    FALTA" -ForegroundColor Red }
if ($proc -match "transcodeToVertical916\(inputPath") { Write-Host "  PASO 4 transcode   OK" -ForegroundColor Green } else { Write-Host "  PASO 4 transcode   FALTA" -ForegroundColor Red }
if ($proc -match "uploadFile\(\s*'processed'") { Write-Host "  PASO 6 upload      OK" -ForegroundColor Green } else { Write-Host "  PASO 6 upload      FALTA" -ForegroundColor Red }
if ($proc -match "generateThumbnail\(inputPath") { Write-Host "  PASO 5 thumbnail   OK" -ForegroundColor Green } else { Write-Host "  PASO 5 thumbnail   FALTA" -ForegroundColor Red }
if ($proc -match "status: 'READY'") { Write-Host "  PASO 7 DB READY    OK" -ForegroundColor Green } else { Write-Host "  PASO 7 DB READY    FALTA" -ForegroundColor Red }

Write-Host "`n[6] Typecheck:" -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -eq 0) { Write-Host "`nTYPECHECK OK - Fase 8 COMPLETADA" -ForegroundColor Green }
else { Write-Host "`nTYPECHECK FALLO - arregla antes de continuar" -ForegroundColor Red }

Write-Host "`n=== FIN FASE 8 ===" -ForegroundColor Cyan
