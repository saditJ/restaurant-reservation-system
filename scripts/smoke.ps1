param(
  [string[]] $Arguments
)

if (-not $Arguments) {
  $Arguments = @()
}

$scriptPath = Join-Path $PSScriptRoot "smoke.ts"

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  pnpm exec tsx $scriptPath @Arguments
  exit $LASTEXITCODE
}

if (Get-Command npx -ErrorAction SilentlyContinue) {
  npx --yes tsx $scriptPath @Arguments
  exit $LASTEXITCODE
}

Write-Error "smoke.ps1 requires either pnpm or npx to execute tsx."
exit 1
