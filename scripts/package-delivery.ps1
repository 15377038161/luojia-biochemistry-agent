param(
  [string]$OutputDirectory = 'release',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = Join-Path $root $OutputDirectory
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $releaseRoot "delivery-stage-$stamp"
$archive = Join-Path $releaseRoot "luojia-biochemistry-agent-complete-delivery-$stamp.zip"

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if (-not $stage.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The staging directory is outside the release directory.'
}

if (-not $SkipBuild) {
  Push-Location $root
  try {
    pnpm validate
    if ($LASTEXITCODE -ne 0) { throw 'pnpm validate failed' }
    pnpm test
    if ($LASTEXITCODE -ne 0) { throw 'pnpm test failed' }
    pnpm export:knowledge
    if ($LASTEXITCODE -ne 0) { throw 'Knowledge export failed' }
    pnpm exec next build
    if ($LASTEXITCODE -ne 0) { throw 'Next.js production build failed' }
  }
  finally { Pop-Location }
}

$buildId = Join-Path $root '.next\BUILD_ID'
if (-not (Test-Path -LiteralPath $buildId)) {
  throw 'Missing .next/BUILD_ID. Run the production build first.'
}
$compiledServer = Join-Path $root 'dist\server.js'
if (-not (Test-Path -LiteralPath $compiledServer)) {
  Push-Location $root
  try {
    pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
    if ($LASTEXITCODE -ne 0) { throw 'Server compilation failed' }
  }
  finally { Pop-Location }
}

try {
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $projectStage = Join-Path $stage 'project'
  New-Item -ItemType Directory -Path $projectStage -Force | Out-Null

  $excludeDirs = @('node_modules','.git','.next','release','output','.playwright-cli')
  # Exclude every environment file during the bulk copy, then restore only the
  # documented, secret-free template. This also covers non-standard local names
  # such as .env.staging or .env.backup.
  $excludeFiles = @('.env','.env.*','tsconfig.tsbuildinfo')
  $robocopyArgs = @($root,$projectStage,'/E','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD') + ($excludeDirs | ForEach-Object { Join-Path $root $_ }) + @('/XF') + $excludeFiles
  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
  Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $projectStage '.env.example') -Force

  $compiledArchive = Join-Path $stage 'compiled-build.tar.gz'
  Push-Location $root
  try {
    & tar -c -z -f $compiledArchive --exclude='.next/cache' --exclude='.next/dev' --exclude='.next/node_modules' .next dist
    if ($LASTEXITCODE -ne 0) { throw 'Compiled build archive creation failed' }
  }
  finally { Pop-Location }

  $quickStart = @'
Luojia Biochemistry Text Experiment Agent Delivery

1. Main guide: project/docs/Coze platform delivery and follow-up guide (Chinese filename).
2. Configuration template: project/.env.example
3. Source install: run pnpm install --frozen-lockfile in project.
4. Compiled artifact: compiled-build.tar.gz (.next and dist/server.js).
5. Production start: install locked dependencies in project, extract compiled-build.tar.gz into project, then run pnpm start.
6. Database migrations: project/supabase/migrations/
7. Coze workflows: project/docs/coze/
8. Teacher materials: project/knowledge-base/raw-teacher-materials/

No real secret is included. Chaoxing OAuth and form writes still require formal credentials and permissions.
'@
  Set-Content -LiteralPath (Join-Path $stage 'QUICK-START.txt') -Value $quickStart -Encoding UTF8

  $files = Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Name -notin @('DELIVERY-MANIFEST.json','SHA256SUMS.txt') }
  $entries = foreach ($file in $files) {
    [pscustomobject]@{
      path = $file.FullName.Substring($stage.Length + 1).Replace('\','/')
      bytes = $file.Length
      sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  $manifest = [pscustomobject]@{
    project = 'Luojia Biochemistry Text Experiment Agent'
    version = '1.0.0'
    generatedAt = (Get-Date).ToString('o')
    fileCount = $entries.Count
    totalBytes = ($entries | Measure-Object bytes -Sum).Sum
    files = $entries
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'DELIVERY-MANIFEST.json') -Encoding UTF8
  $entries | ForEach-Object { "$($_.sha256)  $($_.path)" } | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding UTF8

  Push-Location $stage
  try {
    & tar -a -c -f $archive .
    if ($LASTEXITCODE -ne 0) { throw 'bsdtar ZIP creation failed' }
  }
  finally { Pop-Location }
  & (Join-Path $PSScriptRoot 'verify-delivery.ps1') -Archive $archive | Format-Table -AutoSize
  Get-FileHash -LiteralPath $archive -Algorithm SHA256 | Select-Object Path,Hash
}
finally {
  if ((Test-Path -LiteralPath $stage) -and $stage.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
