[CmdletBinding()]
param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$rawRoot = Join-Path $repositoryRoot "data\rag\raw"
$archiveRoot = Join-Path $rawRoot "_archives"

$morphhbCommit = "3d15126fb1ef74867fc1434be1942e837932691f"
$nestle1904Commit = "713f28a3b7d4d66132f5aa809fa223fe79762e5d"
$stepBibleCommit = "02843f07cbb5009e00999a7c0efead6430dbb6e7"

function Ensure-Directory {
  param([Parameter(Mandatory)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Assert-SafeRawPath {
  param([Parameter(Mandatory)][string]$Path)

  $resolvedRawRoot = [System.IO.Path]::GetFullPath($rawRoot).TrimEnd('\')
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $requiredPrefix = $resolvedRawRoot + [System.IO.Path]::DirectorySeparatorChar

  if (-not $resolvedPath.StartsWith($requiredPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the RAG raw-data directory: $resolvedPath"
  }
}

function Remove-RawDirectory {
  param([Parameter(Mandatory)][string]$Path)

  Assert-SafeRawPath -Path $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Download-File {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][string]$Destination
  )

  Ensure-Directory -Path (Split-Path -Parent $Destination)

  if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    Write-Host "Using existing download: $Destination"
    return
  }

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Force
  }

  Write-Host "Downloading $Uri"
  Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
}

function Expand-DataArchive {
  param(
    [Parameter(Mandatory)][string]$Archive,
    [Parameter(Mandatory)][string]$Destination
  )

  if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    Write-Host "Using existing extracted data: $Destination"
    return
  }

  if (Test-Path -LiteralPath $Destination) {
    Remove-RawDirectory -Path $Destination
  }

  Ensure-Directory -Path $Destination
  Write-Host "Extracting $Archive"
  Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}

function Get-Sha256Hash {
  param([Parameter(Mandatory)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()

  try {
    $hashBytes = $sha256.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

Ensure-Directory -Path $archiveRoot

$otArchive = Join-Path $archiveRoot "oshb-morphhb-$($morphhbCommit.Substring(0, 12)).zip"
$otDestination = Join-Path $rawRoot "original\ot-hebrew-oshb"
Download-File `
  -Uri "https://codeload.github.com/openscriptures/morphhb/zip/$morphhbCommit" `
  -Destination $otArchive
Expand-DataArchive -Archive $otArchive -Destination $otDestination

$ntDestination = Join-Path $rawRoot "original\nt-greek-nestle1904"
Ensure-Directory -Path $ntDestination
$ntCsv = Join-Path $ntDestination "Nestle1904.csv"
$ntReadme = Join-Path $ntDestination "README.md"
Download-File `
  -Uri "https://raw.githubusercontent.com/biblicalhumanities/Nestle1904/$nestle1904Commit/morph/Nestle1904.csv" `
  -Destination $ntCsv
Download-File `
  -Uri "https://raw.githubusercontent.com/biblicalhumanities/Nestle1904/$nestle1904Commit/morph/README.md" `
  -Destination $ntReadme

$stepBibleArchive = Join-Path $archiveRoot "stepbible-data-$($stepBibleCommit.Substring(0, 12)).zip"
$stepBibleDestination = Join-Path $rawRoot "stepbible"
Download-File `
  -Uri "https://codeload.github.com/STEPBible/STEPBible-Data/zip/$stepBibleCommit" `
  -Destination $stepBibleArchive
Expand-DataArchive -Archive $stepBibleArchive -Destination $stepBibleDestination

$crossReferenceArchive = Join-Path $archiveRoot "openbible-cross-references.zip"
$crossReferenceDestination = Join-Path $rawRoot "cross-references\openbible"
Download-File `
  -Uri "https://a.openbible.info/data/cross-references.zip" `
  -Destination $crossReferenceArchive
Expand-DataArchive -Archive $crossReferenceArchive -Destination $crossReferenceDestination

$otBookFiles = @(
  Get-ChildItem -LiteralPath $otDestination -Recurse -Filter "*.xml" |
    Where-Object { $_.DirectoryName -match '[\\/]wlc$' -and $_.Name -ne "VerseMap.xml" }
)
if ($otBookFiles.Count -ne 39) {
  throw "OSHB validation failed: expected 39 book XML files, found $($otBookFiles.Count)."
}

$ntTokenRows = (Get-Content -LiteralPath $ntCsv | Measure-Object -Line).Lines
if ($ntTokenRows -lt 100000) {
  throw "Nestle 1904 validation failed: expected more than 100,000 token rows, found $ntTokenRows."
}

$stepBibleFiles = @(Get-ChildItem -LiteralPath $stepBibleDestination -Recurse -File)
$stepTagntFiles = @($stepBibleFiles | Where-Object { $_.Name -like "TAGNT*" })
$stepTahotFiles = @($stepBibleFiles | Where-Object { $_.Name -like "TAHOT*" })
if ($stepTagntFiles.Count -lt 2 -or $stepTahotFiles.Count -lt 4) {
  throw "STEPBible validation failed: required TAGNT or TAHOT files are missing."
}

$crossReferenceFile = Join-Path $crossReferenceDestination "cross_references.txt"
if (-not (Test-Path -LiteralPath $crossReferenceFile)) {
  throw "OpenBible validation failed: cross_references.txt was not extracted."
}
$crossReferenceHeader = Get-Content -LiteralPath $crossReferenceFile -TotalCount 1
if ($crossReferenceHeader -notmatch "^From Verse\tTo Verse\tVotes") {
  throw "OpenBible validation failed: the cross-reference header is not recognized."
}
$crossReferenceRows = (Get-Content -LiteralPath $crossReferenceFile | Measure-Object -Line).Lines - 1
if ($crossReferenceRows -lt 300000) {
  throw "OpenBible validation failed: expected more than 300,000 relationships, found $crossReferenceRows."
}

$artifacts = @(
  $otArchive,
  $ntCsv,
  $ntReadme,
  $stepBibleArchive,
  $crossReferenceArchive
) | ForEach-Object {
  $file = Get-Item -LiteralPath $_
  [ordered]@{
    path = $file.FullName.Substring($repositoryRoot.Length + 1).Replace('\', '/')
    bytes = $file.Length
    sha256 = Get-Sha256Hash -Path $_
  }
}

$manifest = [ordered]@{
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  sources = @(
    [ordered]@{
      id = "oshb"
      commit = $morphhbCommit
      source = "https://github.com/openscriptures/morphhb"
      license = "WLC text: Public Domain; lemma and morphology: CC BY 4.0"
    },
    [ordered]@{
      id = "nestle1904"
      commit = $nestle1904Commit
      source = "https://github.com/biblicalhumanities/Nestle1904"
      license = "Nestle 1904 morphology dataset: CC0"
    },
    [ordered]@{
      id = "stepbible-data"
      commit = $stepBibleCommit
      source = "https://github.com/STEPBible/STEPBible-Data"
      license = "CC BY 4.0; inspect dataset-specific notices before production use"
    },
    [ordered]@{
      id = "openbible-cross-references"
      source = "https://www.openbible.info/labs/cross-references/"
      license = "CC BY 4.0"
    }
  )
  validation = [ordered]@{
    oshbBookXmlFiles = $otBookFiles.Count
    nestle1904TokenRows = $ntTokenRows
    stepBibleFiles = $stepBibleFiles.Count
    stepBibleTagntFiles = $stepTagntFiles.Count
    stepBibleTahotFiles = $stepTahotFiles.Count
    openBibleCrossReferenceRows = $crossReferenceRows
  }
  artifacts = $artifacts
}

$manifestPath = Join-Path $rawRoot "download-manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "RAG source data is ready in $rawRoot"
Write-Host "Download manifest: $manifestPath"
