<#
.SYNOPSIS
  Fetches Pal's local inference runtime into backend/lib and backend/weights.

.DESCRIPTION
  These payloads are deliberately untracked (see .gitignore) because they are
  large, prebuilt, and versioned independently of this repo. This script pins an
  exact llama.cpp release and verifies checksums so every machine gets a runtime
  identical to the one the app was tested against.

  The CUDA build is used because it is the only backend that performs acceptably
  on the target hardware. Measured on an RTX 4070 Laptop with gemma-3-4b-it-q4_0:

      CUDA    ~50 tok/s
      CPU      ~9.6 tok/s
      Vulkan   ~0.8 tok/s   (pathological; buffers land in host-visible memory)

  The CUDA DLLs coexist with the CPU backends in the same folder, so a machine
  without an NVIDIA GPU still runs -- llama.cpp falls back to CPU on its own.

.PARAMETER SkipWeights
  Only fetch the runtime, not the ~3 GB of GGUF weights.

.EXAMPLE
  pwsh -File scripts/fetch-backend.ps1
#>
[CmdletBinding()]
param(
    [switch] $SkipWeights
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$LlamaRelease   = 'b10293'
$WhisperRelease = 'v1.9.2'

$Archives = @(
    @{
        Name   = "llama-$LlamaRelease-bin-win-cuda-12.4-x64.zip"
        Sha256 = '3df85670b0c69f8e1aede808e1dcf9fe503932e0345218b0725b7166058de567'
    },
    @{
        # CUDA runtime redistributables; llama.cpp ships these separately.
        Name   = 'cudart-llama-bin-win-cuda-12.4-x64.zip'
        Sha256 = '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'
    }
)

# Only the llama-server dependency closure; the release also ships a dozen other
# CLI tools Pal never invokes.
$RuntimeFiles = @(
    'llama-server.exe', 'llama-server-impl.dll', 'llama-common.dll',
    'llama.dll', 'mtmd.dll',
    'ggml.dll', 'ggml-base.dll', 'ggml-cuda.dll', 'ggml-rpc.dll',
    'libomp140.x86_64.dll',
    'cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll'
)
# CPU backend variants; ggml picks one at runtime from CPU features.
$RuntimeGlobs = @('ggml-cpu-*.dll')

# whisper.cpp ships its own ggml build (incompatible with llama.cpp's), so it
# gets its own folder. Its cudart/cublas are byte-identical to llama.cpp's,
# though, so those are NOT duplicated -- stt.rs puts backend/lib on the PATH.
$WhisperArchive = @{
    Name   = "whisper-cublas-12.4.0-bin-x64.zip"
    Sha256 = '443110ddaad70d4290ab2e77179e31cf712035bbc4fad56bb4519a90c917b39c'
}
$WhisperFiles = @(
    'whisper-server.exe', 'whisper.dll',
    'ggml.dll', 'ggml-base.dll', 'ggml-cuda.dll',
    'nvrtc64_120_0.dll', 'nvrtc-builtins64_124.dll'
)
$WhisperModel = @{
    File   = 'ggml-large-v3-turbo-q5_0.bin'
    Url    = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
    Sha256 = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'
}

$Weights = @(
    @{
        File = 'gemma-3-4b-it-q4_0.gguf'
        Url  = 'https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf/resolve/main/gemma-3-4b-it-q4_0.gguf'
    },
    @{
        File = 'gemma-3-1b-it-q4_0.gguf'
        Url  = 'https://huggingface.co/google/gemma-3-1b-it-qat-q4_0-gguf/resolve/main/gemma-3-1b-it-q4_0.gguf'
    }
)

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $RepoRoot 'backend'
$LibDir      = Join-Path $BackendDir 'lib'
$WeightsDir  = Join-Path $BackendDir 'weights'
$WhisperDir  = Join-Path $BackendDir 'whisper'
$WhisperMdl  = Join-Path $WhisperDir 'models'
$CacheDir    = Join-Path $env:TEMP 'pal-backend-cache'

foreach ($dir in @($LibDir, $WeightsDir, $WhisperDir, $WhisperMdl, $CacheDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

function Get-Archive {
    param(
        [string] $Name,
        [string] $Sha256,
        [string] $Repo    = 'ggml-org/llama.cpp',
        [string] $Release = $LlamaRelease
    )

    $target = Join-Path $CacheDir $Name

    if (Test-Path $target) {
        $have = (Get-FileHash -Path $target -Algorithm SHA256).Hash
        if ($have -eq $Sha256.ToUpperInvariant()) {
            Write-Host "  cached  $Name"
            return $target
        }
        Write-Warning "  checksum mismatch on cached $Name; re-downloading"
        Remove-Item $target -Force
    }

    $url = "https://github.com/$Repo/releases/download/$Release/$Name"
    Write-Host "  fetching $Name"
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing

    $have = (Get-FileHash -Path $target -Algorithm SHA256).Hash
    if ($have -ne $Sha256.ToUpperInvariant()) {
        Remove-Item $target -Force
        throw "Checksum mismatch for $Name. Expected $Sha256, got $have."
    }

    return $target
}

Write-Host "llama.cpp runtime ($LlamaRelease, CUDA 12.4)" -ForegroundColor Cyan

$staging = Join-Path $CacheDir "extract-$LlamaRelease"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

foreach ($archive in $Archives) {
    $zip = Get-Archive -Name $archive.Name -Sha256 $archive.Sha256
    Expand-Archive -Path $zip -DestinationPath $staging -Force
}

$copied = 0
foreach ($file in $RuntimeFiles) {
    $src = Join-Path $staging $file
    if (-not (Test-Path $src)) {
        throw "Expected '$file' in the llama.cpp release but it was not found."
    }
    Copy-Item $src -Destination $LibDir -Force
    $copied++
}
foreach ($glob in $RuntimeGlobs) {
    Get-ChildItem -Path $staging -Filter $glob -File | ForEach-Object {
        Copy-Item $_.FullName -Destination $LibDir -Force
        $copied++
    }
}
Remove-Item $staging -Recurse -Force
Write-Host "  installed $copied files into backend/lib" -ForegroundColor Green

Write-Host "`nwhisper.cpp runtime ($WhisperRelease, cuBLAS 12.4)" -ForegroundColor Cyan

$wStaging = Join-Path $CacheDir "extract-whisper-$WhisperRelease"
if (Test-Path $wStaging) { Remove-Item $wStaging -Recurse -Force }
New-Item -ItemType Directory -Path $wStaging -Force | Out-Null

$wZip = Get-Archive -Name $WhisperArchive.Name -Sha256 $WhisperArchive.Sha256 `
    -Repo 'ggml-org/whisper.cpp' -Release $WhisperRelease
Expand-Archive -Path $wZip -DestinationPath $wStaging -Force

# The archive nests everything under Release/.
$wSource = Join-Path $wStaging 'Release'
if (-not (Test-Path $wSource)) { $wSource = $wStaging }

$wCopied = 0
foreach ($file in $WhisperFiles) {
    $src = Join-Path $wSource $file
    if (-not (Test-Path $src)) {
        throw "Expected '$file' in the whisper.cpp release but it was not found."
    }
    Copy-Item $src -Destination $WhisperDir -Force
    $wCopied++
}
Get-ChildItem -Path $wSource -Filter 'ggml-cpu-*.dll' -File | ForEach-Object {
    Copy-Item $_.FullName -Destination $WhisperDir -Force
    $wCopied++
}
Remove-Item $wStaging -Recurse -Force
Write-Host "  installed $wCopied files into backend/whisper" -ForegroundColor Green

$sttModel = Join-Path $WhisperMdl $WhisperModel.File
if (Test-Path $sttModel) {
    Write-Host "  present  $($WhisperModel.File)"
} else {
    Write-Host "  fetching $($WhisperModel.File) (~574 MB)"
    Invoke-WebRequest -Uri $WhisperModel.Url -OutFile $sttModel -UseBasicParsing
    $have = (Get-FileHash -Path $sttModel -Algorithm SHA256).Hash
    if ($have -ne $WhisperModel.Sha256.ToUpperInvariant()) {
        Remove-Item $sttModel -Force
        throw "Checksum mismatch for $($WhisperModel.File)."
    }
}

if ($SkipWeights) {
    Write-Host "`nSkipping weights (-SkipWeights)." -ForegroundColor Yellow
} else {
    Write-Host "`nGemma 3 weights" -ForegroundColor Cyan
    foreach ($weight in $Weights) {
        $dest = Join-Path $WeightsDir $weight.File
        if (Test-Path $dest) {
            Write-Host "  present  $($weight.File)"
            continue
        }
        Write-Host "  fetching $($weight.File) (this is several GB)"
        Invoke-WebRequest -Uri $weight.Url -OutFile $dest -UseBasicParsing
    }
}

Write-Host "`nVerifying runtime..." -ForegroundColor Cyan
$server = Join-Path $LibDir 'llama-server.exe'
$devices = & $server --list-devices 2>&1 | Out-String
Write-Host $devices.Trim()

if ($devices -notmatch 'CUDA\d') {
    Write-Warning 'No CUDA device detected. Pal will fall back to CPU inference, which is roughly 5x slower.'
}

Write-Host "`nDone." -ForegroundColor Green
