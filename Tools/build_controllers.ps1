param(
    [string]$ZigPath = '',
    [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$ZigPath) { $ZigPath = Join-Path $projectRoot '_build\toolchain\zig-windows-x86_64-0.13.0\zig.exe' }
if (!(Test-Path -LiteralPath $ZigPath)) { throw 'Zig 0.13.0 not found. Pass -ZigPath to a local Zig 0.13.0 installation.' }
$version = & $ZigPath version
if ($LASTEXITCODE -ne 0 -or $version -ne '0.13.0') { throw 'This build requires Zig 0.13.0.' }
$buildDir = Join-Path $projectRoot '_build\controllers'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
$oldGlobalCache = $env:ZIG_GLOBAL_CACHE_DIR
$oldLocalCache = $env:ZIG_LOCAL_CACHE_DIR
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $buildDir 'zig-global'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $buildDir 'zig-local'
$options = @('c++', '-target', 'x86_64-windows-gnu', '-std=c++17', '-O2', '-fno-exceptions', '-fno-rtti', '-nostdlib++', '-Wall', '-Wextra', '-Werror')
$sourceDir = Join-Path $projectRoot 'Source\Controllers'
$devicesSource = Join-Path $sourceDir 'controller_devices.cpp'
$libraries = @('-ldinput8', '-ldxguid', '-luser32', '-lbcrypt')
try {
    & $ZigPath @options -shared (Join-Path $sourceDir 'controller_bridge.cpp') $devicesSource -o (Join-Path $buildDir 'FPVDroneController.dll') @libraries
    if ($LASTEXITCODE -ne 0) { throw 'Controller DLL compilation failed' }
    if (!$SkipTests) {
        & $ZigPath @options (Join-Path $sourceDir 'device_probe.cpp') $devicesSource -o (Join-Path $buildDir 'device_probe.exe') @libraries
        if ($LASTEXITCODE -ne 0) { throw 'Device probe compilation failed' }
        & $ZigPath @options (Join-Path $sourceDir 'bridge_probe.cpp') $devicesSource -o (Join-Path $buildDir 'bridge_probe.exe') @libraries
        if ($LASTEXITCODE -ne 0) { throw 'Bridge probe compilation failed' }
        $deviceResults = & (Join-Path $buildDir 'device_probe.exe') --self-test
        if ($LASTEXITCODE -ne 0) { throw 'Controller device checks failed' }
        $bridgeResults = & (Join-Path $buildDir 'bridge_probe.exe') (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll') (Join-Path $buildDir 'FPVDroneController.dll')
        if ($LASTEXITCODE -ne 0) { throw 'Controller bridge checks failed' }
        $inventory = & (Join-Path $buildDir 'device_probe.exe')
        if ($LASTEXITCODE -ne 0) { throw 'Controller inventory API initialization failed' }
        $report = [ordered]@{
            runtimeVersion = 136
            device = ($deviceResults | ConvertFrom-Json)
            bridge = ($bridgeResults | ConvertFrom-Json)
            inventory = ($inventory | ConvertFrom-Json)
            dllSHA256 = (Get-FileHash -LiteralPath (Join-Path $buildDir 'FPVDroneController.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
            originalNativeSHA256 = (Get-FileHash -LiteralPath (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        $reportText = $report | ConvertTo-Json -Depth 8
        [System.IO.File]::WriteAllText((Join-Path $buildDir 'test_report.json'), $reportText, [System.Text.UTF8Encoding]::new($false))
        Write-Output $reportText
    }
} finally {
    $env:ZIG_GLOBAL_CACHE_DIR = $oldGlobalCache
    $env:ZIG_LOCAL_CACHE_DIR = $oldLocalCache
}
