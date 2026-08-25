param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

$ErrorActionPreference = 'Stop'
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$releaseRoot = Split-Path -Parent $archivePath
$verifyRoot = Join-Path $releaseRoot ('verify-' + [Guid]::NewGuid().ToString('N'))

if (-not $verifyRoot.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The verification directory is outside the release directory.'
}

try {
  New-Item -ItemType Directory -Path $verifyRoot -Force | Out-Null
  Push-Location $verifyRoot
  try {
    & tar -x -f $archivePath
    if ($LASTEXITCODE -ne 0) { throw 'bsdtar ZIP extraction failed' }
  }
  finally { Pop-Location }
  $manifestPath = Join-Path $verifyRoot 'DELIVERY-MANIFEST.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'DELIVERY-MANIFEST.json is missing.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $failures = @()
  $forbiddenDirectories = @('/.git/','/node_modules/','/.next/cache/','/.next/dev/','/output/','/.playwright-cli/')
  foreach ($entry in $manifest.files) {
    $normalizedPath = '/' + $entry.path.Replace('\\','/')
    if ($normalizedPath -match '/\.env(?:\.|$)' -and $normalizedPath -ne '/project/.env.example') {
      $failures += "Forbidden environment file: $($entry.path)"
    }
    foreach ($directory in $forbiddenDirectories) {
      if ($normalizedPath.Contains($directory, [StringComparison]::OrdinalIgnoreCase)) {
        $failures += "Forbidden directory content: $($entry.path)"
        break
      }
    }
    $filePath = Join-Path $verifyRoot $entry.path
    if (-not (Test-Path -LiteralPath $filePath)) {
      $failures += "Missing file: $($entry.path)"
      continue
    }
    $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $entry.sha256) { $failures += "Checksum mismatch: $($entry.path)" }
  }
  $compiledArchive = Join-Path $verifyRoot 'compiled-build.tar.gz'
  if (Test-Path -LiteralPath $compiledArchive) {
    $compiledEntries = & tar -tf $compiledArchive
    if ($LASTEXITCODE -ne 0) {
      $failures += 'compiled-build.tar.gz cannot be listed.'
    } elseif ($compiledEntries | Where-Object { $_ -match '^\.next/(cache|dev|node_modules)(/|$)' }) {
      $failures += 'compiled-build.tar.gz contains forbidden Next.js development or cache content.'
    }
  } else {
    $failures += 'compiled-build.tar.gz is missing.'
  }
  if ($failures.Count -gt 0) { throw ($failures -join [Environment]::NewLine) }
  [pscustomobject]@{
    Archive = $archivePath
    Files = $manifest.files.Count
    Status = 'SHA256_ALL_MATCH'
    VerificationDirectory = $verifyRoot
  }
}
finally {
  # Keep the extracted directory as audit evidence. Windows PowerShell 5 cannot
  # reliably remove pnpm link trees with long paths after ZIP verification.
}
