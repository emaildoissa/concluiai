#Requires -Version 5.1
<#
.SYNOPSIS
  Publica uma atualização do app mobile (Concluí Operador) via EAS Update.

.DESCRIPTION
  Envia apenas o bundle JS do app para o canal 'preview' — sem rebuild de APK.
  O app já instalado baixa a atualização automaticamente na próxima abertura.

  Pré-requisito: já ter gerado e instalado o APK uma vez (ele embute o canal
  'preview' e as credenciais de update). Depois disso, toda mudança de código
  JS/TS é publicada com este script (~1–2 min).

  USE ESTE SCRIPT para qualquer mudança de telas/lógica/API/login.
  SÓ faça novo build de APK quando houver mudança NATIVA (novo plugin, lib
  nativa, ícone/splash, ou versão do app).

.EXAMPLE
  $env:EXPO_TOKEN = "seu-token-aqui"
  .\scripts\update-preview.ps1 -Message "corrige cálculo de tarefas por setor"

.EXAMPLE
  .\scripts\update-preview.ps1 -Message "ajuste visual ranking" -Commit
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Message,
  [switch]$Commit
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root 'apps\mobile'

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
  $local = Join-Path $mobile 'node_modules\eas-cli\bin\run'
  if (Test-Path $local) { return $local }

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

  return 'npx eas-cli'
}

$eas = Resolve-EasCli

# ---------------------------------------------------------------------------
# 3. Commit opcional (recomendado: o EAS Update referencia o hash do git)
# ---------------------------------------------------------------------------
if ($Commit) {
  Push-Location $root
  try {
    git add -A
    git -c user.name="expo-ci" -c user.email="expo-ci@local" commit -m "chore(mobile): $Message"
  } finally {
    Pop-Location
  }
}

# ---------------------------------------------------------------------------
# 4. Publica o EAS Update no canal 'preview'
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '=== Publicando EAS Update no canal preview ===' -ForegroundColor Cyan
Push-Location $mobile
try {
  & $eas update --channel preview --message $Message --non-interactive
  if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host '=== Publicado ===' -ForegroundColor Green
Write-Host 'O app instalado baixa a atualização sozinho na próxima abertura.'
Write-Host 'PARA TESTAR: feche e reabra o app no celular (ou puxe para recarregar).'