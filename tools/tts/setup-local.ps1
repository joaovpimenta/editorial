param(
    [switch]$AddToPath,
    [switch]$CpuOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ($env:KOKORO_DORA_HOME) {
    $runtimeHome = $env:KOKORO_DORA_HOME
} elseif ($env:LOCALAPPDATA) {
    $runtimeHome = Join-Path $env:LOCALAPPDATA "Editorial\KokoroDora"
} else {
    $runtimeHome = Join-Path $repoRoot ".local\kokoro"
}
$venvPython = Join-Path $runtimeHome ".venv\Scripts\python.exe"
$modelsDir = Join-Path $runtimeHome "models"
$repoModelsDir = Join-Path $repoRoot ".local\kokoro\models"

if (-not (Test-Path $venvPython)) {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if (-not $pythonLauncher) {
        throw "Python 3.11 x64 e o launcher 'py' sao necessarios para criar o ambiente local."
    }
    New-Item -ItemType Directory -Path $runtimeHome -Force | Out-Null
    & $pythonLauncher.Source -3.11 -m venv (Join-Path $runtimeHome ".venv")
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente virtual Python 3.11." }
}

$pythonVersion = & $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($LASTEXITCODE -ne 0 -or $pythonVersion.Trim() -ne "3.11") {
    throw "O ambiente em $venvPython precisa usar Python 3.11; encontrado: $pythonVersion"
}

New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar pip." }

# Install the workflow pins except Kokoro, whose CPU-only runtime dependency is
# selected separately so each environment contains just one ONNX Runtime variant.
& $venvPython -m pip install `
    "misaki-fork==0.9.6" `
    "phonemizer-fork==3.3.2" `
    "espeakng-loader==0.2.4" `
    "soundfile==0.13.1" `
    "phonemizer>=3.4.0" `
    "numpy>=2.0.2"

if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependencias Kokoro do workflow." }

$installedRuntimePackages = & $venvPython -m pip list --format=json | ConvertFrom-Json
$hasCpuRuntime = @($installedRuntimePackages | Where-Object { $_.name -eq "onnxruntime" }).Count -gt 0
$hasGpuRuntime = @($installedRuntimePackages | Where-Object { $_.name -eq "onnxruntime-gpu" }).Count -gt 0
if ($CpuOnly) {
    if ($hasGpuRuntime) {
        $packagesToRemove = @("onnxruntime-gpu")
        if ($hasCpuRuntime) { $packagesToRemove += "onnxruntime" }
        & $venvPython -m pip uninstall -y @packagesToRemove
        if ($LASTEXITCODE -ne 0) { throw "Falha ao remover a instalação anterior do ONNX Runtime." }
    }
    & $venvPython -m pip install "onnxruntime==1.26.0" "imageio-ffmpeg==0.6.0"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar ONNX Runtime CPU e FFmpeg local." }
    & $venvPython -m pip install "kokoro-onnx==0.6.1"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar Kokoro ONNX." }
} else {
    if ($hasCpuRuntime) {
        $packagesToRemove = @("onnxruntime")
        if ($hasGpuRuntime) { $packagesToRemove += "onnxruntime-gpu" }
        & $venvPython -m pip uninstall -y @packagesToRemove
        if ($LASTEXITCODE -ne 0) { throw "Falha ao remover a instalação anterior do ONNX Runtime." }
    }
    # This package provides its CUDA 12.x/cuDNN 9 runtime wheels as optional dependencies.
    & $venvPython -m pip install "onnxruntime-gpu[cuda,cudnn]==1.26.0" "imageio-ffmpeg==0.6.0"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar ONNX Runtime GPU e FFmpeg local." }
    # The package metadata requests CPU ONNX Runtime, but the GPU wheel exposes
    # the same Python module and must remain the only installed runtime variant.
    & $venvPython -m pip install --no-deps "kokoro-onnx==0.6.1"
}
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar ONNX Runtime e FFmpeg local." }

$assets = @(
    @{ Name = "kokoro-v1.0.onnx"; Url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx"; MinimumBytes = 250000000 },
    @{ Name = "voices-v1.0.bin"; Url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"; MinimumBytes = 20000000 }
)
foreach ($asset in $assets) {
    $destination = Join-Path $modelsDir $asset.Name
    if ((Test-Path $destination) -and (Get-Item $destination).Length -gt $asset.MinimumBytes) {
        Write-Host "Cache existente: $destination"
        continue
    }

    $repoCache = Join-Path $repoModelsDir $asset.Name
    if ((Test-Path $repoCache) -and (Get-Item $repoCache).Length -gt $asset.MinimumBytes) {
        Copy-Item -LiteralPath $repoCache -Destination $destination -Force
        Write-Host "Cache local reutilizado: $repoCache"
        continue
    }

    $temporaryPath = "$destination.partial"
    $downloaded = $false
    for ($attempt = 1; $attempt -le 3 -and -not $downloaded; $attempt++) {
        try {
            Invoke-WebRequest -Uri $asset.Url -OutFile $temporaryPath -UseBasicParsing
            if ((Get-Item $temporaryPath).Length -le $asset.MinimumBytes) {
                throw "Arquivo baixado menor que o esperado."
            }
            Move-Item -LiteralPath $temporaryPath -Destination $destination -Force
            $downloaded = $true
        } catch {
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
            if ($attempt -eq 3) { throw }
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

if ($AddToPath) {
    $commandDirectory = Join-Path $repoRoot "tools\tts"
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($userPath -split ";" | Where-Object { $_.Trim() })
    $alreadyAdded = $entries | Where-Object {
        [string]::Equals($_.TrimEnd("\"), $commandDirectory.TrimEnd("\"),
            [StringComparison]::OrdinalIgnoreCase)
    }
    if (-not $alreadyAdded) {
        $newUserPath = (@($entries) + $commandDirectory) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        Write-Host "Adicionado ao PATH do usuario: $commandDirectory"
    } else {
        Write-Host "O PATH do usuario ja inclui: $commandDirectory"
    }
}

if ($CpuOnly) { $device = "cpu" } else { $device = "cuda" }
$env:KOKORO_DORA_HOME = $runtimeHome
Write-Host "Verificando o provider $device, o modelo, a voz e o FFmpeg..."
& $venvPython (Join-Path $repoRoot "tools\tts\local_cli.py") doctor --device $device --load-model
if ($LASTEXITCODE -ne 0) {
    throw "A verificacao do ONNX Runtime falhou. Veja a mensagem acima e confira driver e bibliotecas CUDA/cuDNN."
}

Write-Host "Instalacao local Kokoro Dora concluida."
Write-Host "Abra um novo terminal para usar 'kokoro-dora' globalmente."
