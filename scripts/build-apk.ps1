#Requires -Version 5.1
<#
.SYNOPSIS
  Gera o APK de teste do app mobile (Concluí Operador) em um único comando.

.DESCRIPTION
  Resolve o eas-cli automaticamente (monorepo / cache npx), exige EXPO_TOKEN
  como variável de ambiente (nunca grava token em arquivo) e dispara o build:

    .\scripts\build-apk.ps1            # build local via Docker (recomendado)
    .\scripts\build-apk.ps1 -Cloud     # build na nuvem do EAS

  Ao final, lista o APK mais recente em apps/mobile/dist/build com data/hora,
  tamanho e instrução de instalação no celular.

.EXAMPLE
  $env:EXPO_TOKEN = "seu-token-aqui"
  .\scripts\build-apk.ps1

.EXAMPLE
  .\scripts\build-apk.ps1 -Cloud
#>

[CmdletBinding()]
param(
  [switch]$Cloud
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root 'apps\mobile'
$outDir = Join-Path $mobile 'dist\build'

# ---------------------------------------------------------------------------
# 1. Valida EXPO_TOKEN (segurança: nunca grava o token em arquivo)
# ---------------------------------------------------------------------------
if (-not $env:EXPO_TOKEN) {
  Write-Host ''
  Write-Host 'FALTA o token do Expo.' -ForegroundColor Red
  Write-Host 'Defina a variável de ambiente EXPO_TOKEN antes de rodar:' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  $env:EXPO_TOKEN = "..."' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  Gere o token em: https://expo.dev/settings/access-tokens' -ForegroundColor Cyan
  exit 1
}

# ---------------------------------------------------------------------------
# 2. Resolve o eas-cli (cascata: monorepo -> npx cache -> npx)
# ---------------------------------------------------------------------------
function Resolve-EasCli {
  # a) dentro do monorepo (se instalado localmente em apps/mobile)
  $local = Join-Path $mobile 'node_modules\eas-cli\bin\run'
  if (Test-Path $local) { return $local }

  # b) cache do npx (resolver o hash que contém eas-cli)
  $npxCache = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
  if (Test-Path $npxCache) {
    $candidate = Get-ChildItem $npxCache -Directory -ErrorAction SilentlyContinue |
      ForEach-Object {
        $p = Join-Path $_.FullName 'node_modules\eas-cli\bin\run'
        if (Test-Path $p) { $p }
      } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }

  # c) on-the-fly via npx
  return 'npx'
}

$eas = Resolve-EasCli
if ($eas -eq 'npx') {
  Write-Host 'eas-cli não encontrado em cache; instalando via npx...' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3. Monta e dispara o build
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

if ($Cloud) {
  Write-Host ''
  Write-Host '=== Build na NUVEM (EAS) ===' -ForegroundColor Cyan
  Write-Host 'A fila gratuita pode levar de minutos a horas.' -ForegroundColor Yellow
  Push-Location $mobile
  try {
    & $eas build --profile preview --platform android --non-interactive
  } finally {
    Pop-Location
  }
} else {
  Write-Host ''
  Write-Host '=== Build LOCAL via Docker ===' -ForegroundColor Cyan
  Write-Host 'Requere Docker Desktop rodando. Primeiro build é pesado; o resto usa cache.' -ForegroundColor Yellow

  $dockerArgs = @(
    'run', '--rm',
    '--name', 'eas-build',
    '--mount', "type=bind,source=$root,target=/workspace",
    '-w', '/workspace/apps/mobile',
    '-e', "EXPO_TOKEN=$env:EXPO_TOKEN",
    '-e', 'EAS_LOCAL_BUILD_ARTIFACTS_DIR=/workspace/apps/mobile/dist/build',
    '-e', 'EAS_LOCAL_BUILD_WORKINGDIR=/tmp/eas-work',
    'erayalakese/eas-like-local-builder:latest',
    'eas', 'build', '--local', '--platform', 'android', '--profile', 'preview', '--non-interactive'
  )
  & docker $dockerArgs
}

if ($LASTEXITCODE -ne 0) {
  Write-Host ("Build falhou (exit {0}).") -ArgumentList $LASTEXITCODE -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------------------
# 4. Lista o APK mais recente + instrução de instalação
# ---------------------------------------------------------------------------
Start-Sleep -Seconds 2
$apk = Get-ChildItem $outDir -Filter '*.apk' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $apk) {
  Write-Host 'Não encontrei .apk gerado em:' -ForegroundColor Yellow
  Write-Host "  $outDir" -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host '=== APK gerado ===' -ForegroundColor Green
Write-Host ('  Arquivo : {0}' -f $apk.FullName)
Write-Host ('  Data    : {0}' -f $apk.LastWriteTime)
Write-Host ('  Tamanho : {0:N1} MB' -f ($apk.Length / 1MB))
Write-Host ''
Write-Host 'Para instalar no celular:' -ForegroundColor Yellow
Write-Host '  1. Copie o APK para o aparelho (Drive, e-mail, cabo).'
Write-Host '  2. No Android, permita "Instalar aplicativos de fontes desconhecidas" quando pedir.'
Write-Host '  3. Abra o app e entre com as credenciais do operador.'