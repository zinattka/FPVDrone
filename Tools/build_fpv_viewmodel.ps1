param([string]$ZigPath = '', [switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$ZigPath) { $ZigPath = Join-Path $projectRoot '_build\toolchain\zig-windows-x86_64-0.13.0\zig.exe' }
$buildDir = Join-Path $projectRoot '_build\visuals3d'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
$oldGlobalCache = $env:ZIG_GLOBAL_CACHE_DIR
$oldLocalCache = $env:ZIG_LOCAL_CACHE_DIR
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $buildDir 'zig-global'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $buildDir 'zig-local'
$options = @('c++', '-target', 'x86_64-windows-gnu', '-std=c++17', '-O2', '-fno-exceptions', '-fno-rtti', '-nostdlib++', '-Wall', '-Wextra', '-Werror')
try {
    & $ZigPath @options -shared (Join-Path $projectRoot 'Source\Viewmodel\viewmodel.cpp') -o (Join-Path $buildDir 'FPVDroneViewmodel.dll') -lbcrypt -luser32
    if ($LASTEXITCODE -ne 0) { throw 'Viewmodel DLL compilation failed' }
    if (!$SkipTests) {
        & $ZigPath @options (Join-Path $projectRoot 'Source\Viewmodel\viewmodel_probe.cpp') -o (Join-Path $buildDir 'viewmodel_probe.exe') -lbcrypt -luser32
        if ($LASTEXITCODE -ne 0) { throw 'Viewmodel probe compilation failed' }
        $probeText = & (Join-Path $buildDir 'viewmodel_probe.exe') (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll')
        if ($LASTEXITCODE -ne 0) { throw 'Viewmodel checks failed' }
        $report = [ordered]@{
            native = ($probeText | ConvertFrom-Json)
            dllSHA256 = (Get-FileHash -LiteralPath (Join-Path $buildDir 'FPVDroneViewmodel.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
            originalNativeSHA256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
            inGameTested = $false
        }
        $reportText = $report | ConvertTo-Json -Depth 6
        [IO.File]::WriteAllText((Join-Path $buildDir 'native_report.json'), $reportText, [Text.UTF8Encoding]::new($false))
        Write-Output $reportText
    }
} finally { $env:ZIG_GLOBAL_CACHE_DIR = $oldGlobalCache; $env:ZIG_LOCAL_CACHE_DIR = $oldLocalCache }
