# Alight PC Engine - Friction SDK Download Script
# Autor: Senior Developer
# Fecha: 2026-05-04

param(
    [string]$OutputDir = "C:\AlightPC\deps",
    [switch]$SkipFFmpeg
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Alight PC - Dependency Downloader" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$SDK_VERSION = "1.0.0r4"
$SDK_URL = "https://github.com/friction2d/friction-sdk/releases/download/v1.0.0/friction-sdk-${SDK_VERSION}-windows-x64.7z"
$SDK_SHA256 = "87f3c5291be25fc04f6e0fc70ec901984fcf43c2dd2d86f0a63f8059b39c47ba"

$FFMPEG_VERSION = "4.2.11"
$FFMPEG_URL = "https://github.com/friction2d/friction-sdk/releases/download/v1.0.0/ffmpeg-${FFMPEG_VERSION}-friction-windows-x64.zip"
$FFMPEG_SHA256 = "e784aa598aab38ab77e419b74626550745488d9dd5db0060337f0afb458588f9"

function Test-Command {
    param([string]$cmd)
    Get-Command $cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
}

function Get-FileWithChecksum {
    param(
        [string]$Url,
        [string]$OutputPath,
        [string]$ExpectedHash,
        [string]$Algorithm = "SHA256"
    )

    Write-Host "  Downloading: $([System.IO.Path]::GetFileName($OutputPath))" -ForegroundColor Yellow

    try {
        Invoke-WebRequest -Uri $Url -OutFile $OutputPath -UseBasicParsing
    } catch {
        Write-Host "  Error downloading: $_" -ForegroundColor Red
        return $false
    }

    if ($ExpectedHash) {
        Write-Host "  Verifying checksum..." -ForegroundColor Yellow
        $actualHash = (Get-FileHash -Path $OutputPath -Algorithm $Algorithm).Hash.ToLower()

        if ($actualHash -ne $ExpectedHash.ToLower()) {
            Write-Host "  ERROR: Checksum mismatch!" -ForegroundColor Red
            Write-Host "    Expected: $ExpectedHash" -ForegroundColor Red
            Write-Host "    Got:      $actualHash" -ForegroundColor Red
            return $false
        }
        Write-Host "  Checksum OK" -ForegroundColor Green
    }

    return $true
}

function Expand-7ZipArchive {
    param([string]$Path, [string]$Destination)

    Write-Host "  Extracting..." -ForegroundColor Yellow

    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        7z x -y -o"$Destination" "$Path" | Out-Null
    } elseif (Get-Command 7za -ErrorAction SilentlyContinue) {
        7za x -y -o"$Destination" "$Path" | Out-Null
    } else {
        Write-Host "  ERROR: 7-Zip not found. Install 7-Zip or add to PATH." -ForegroundColor Red
        Write-Host "  Download from: https://www.7-zip.org/" -ForegroundColor Yellow
        return $false
    }

    return $true
}

function Expand-ZipArchive {
    param([string]$Path, [string]$Destination)

    Write-Host "  Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $Path -DestinationPath $Destination -Force
    return $true
}

Write-Host "[1/4] Validating environment..." -ForegroundColor Green

if (-not (Test-Command "git")) {
    Write-Host "  ERROR: git not found. Install Git for Windows." -ForegroundColor Red
    Write-Host "  Download from: https://git-scm.com/" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Command "cmake")) {
    Write-Host "  WARNING: cmake not found. Build may fail." -ForegroundColor Yellow
    Write-Host "  Download from: https://cmake.org/download/" -ForegroundColor Yellow
}

Write-Host "  Environment OK" -ForegroundColor Green

Write-Host "[2/4] Creating directories..." -ForegroundColor Green

if (Test-Path $OutputDir) {
    Write-Host "  Cleaning existing directory..." -ForegroundColor Yellow
    Remove-Item -Path "$OutputDir\*" -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\sdk" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\ffmpeg" -Force | Out-Null

Write-Host "  Created: $OutputDir" -ForegroundColor Green

Write-Host "[3/4] Downloading SDK..." -ForegroundColor Green

$sdkFile = "$OutputDir\sdk.7z"
if (-not (Get-FileWithChecksum -Url $SDK_URL -OutputPath $sdkFile -ExpectedHash $SDK_SHA256)) {
    Write-Host "  Falling back to download without checksum..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $SDK_URL -OutFile $sdkFile -UseBasicParsing
}

Write-Host "  Extracting SDK..." -ForegroundColor Green
Expand-7ZipArchive -Path $sdkFile -Destination "$OutputDir\sdk"

Move-Item -Path "$OutputDir\sdk\sdk\*" -Destination "$OutputDir\sdk\" -Force -ErrorAction SilentlyContinue

if (-not (Test-Path "$OutputDir\sdk\bin")) {
    Write-Host "  ERROR: SDK extraction failed. bin folder not found." -ForegroundColor Red
    exit 1
}

Write-Host "  SDK ready at: $OutputDir\sdk" -ForegroundColor Green

if (-not $SkipFFmpeg) {
    Write-Host "[4/4] Downloading FFmpeg..." -ForegroundColor Green

    $ffmpegFile = "$OutputDir\ffmpeg.zip"
    if (-not (Get-FileWithChecksum -Url $FFMPEG_URL -OutputPath $ffmpegFile -ExpectedHash $FFMPEG_SHA256)) {
        Write-Host "  Falling back to download without checksum..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $FFMPEG_URL -OutFile $ffmpegFile -UseBasicParsing
    }

    Write-Host "  Extracting FFmpeg..." -ForegroundColor Green
    Expand-ZipArchive -Path $ffmpegFile -Destination "$OutputDir\ffmpeg"

    Write-Host "  FFmpeg ready at: $OutputDir\ffmpeg" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Download Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " SDK Location:     $OutputDir\sdk" -ForegroundColor Green
if (-not $SkipFFmpeg) {
    Write-Host " FFmpeg Location:  $OutputDir\ffmpeg" -ForegroundColor Green
}
Write-Host ""
Write-Host " Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy 'sdk' folder to friction source root" -ForegroundColor White
Write-Host "  2. Open VS Developer Command Prompt" -ForegroundColor White
Write-Host "  3. Run: cmake -G 'Visual Studio 17 2022' -A x64 -DCMAKE_PREFIX_PATH=%cd%\sdk .." -ForegroundColor White
Write-Host "  4. Run: cmake --build . --config Release" -ForegroundColor White
Write-Host ""