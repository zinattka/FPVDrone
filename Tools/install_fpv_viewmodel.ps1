param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$buildDir = Join-Path $projectRoot '_build\visuals3d'
if (Get-Process Fallout4 -ErrorAction SilentlyContinue) { throw 'Close Fallout 4 completely before changing the viewmodel runtime.' }
$runtime = Join-Path $projectRoot 'F4SE\Plugins\FPVDroneViewmodel.dll'
$overlay = Join-Path $projectRoot 'Interface\FPVDroneOverlay.swf'
function Sync-RuntimeManifest {
    $manifestPath = Join-Path $projectRoot 'FILE_MANIFEST.sha256'
    $entries = @{}
    foreach ($line in (Get-Content -LiteralPath $manifestPath)) {
        if ($line -match '^([0-9a-f]{64})  (.+)$') { $entries[$matches[2]] = $matches[1] }
    }
    foreach ($name in @('F4SE/Plugins/FPVDroneViewmodel.dll', 'Meshes/FPVDrone/drone_fpv.nif')) {
        $target = Join-Path $projectRoot $name
        if (Test-Path -LiteralPath $target) { $entries[$name] = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
        else { $entries.Remove($name) }
    }
    $text = (($entries.Keys | Sort-Object -CaseSensitive | ForEach-Object { "$($entries[$_])  $_" }) -join "`n") + "`n"
    [IO.File]::WriteAllText($manifestPath, $text, [Text.UTF8Encoding]::new($false))
}
if ($Disable) {
    if (Test-Path -LiteralPath $runtime) {
        $rootPath = (Resolve-Path -LiteralPath $projectRoot).Path
        $sourcePath = (Resolve-Path -LiteralPath $runtime).Path
        $hash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $disabledDir = Join-Path $buildDir 'disabled'
        New-Item -ItemType Directory -Path $disabledDir -Force | Out-Null
        $targetPath = [IO.Path]::GetFullPath((Join-Path $disabledDir "FPVDroneViewmodel.$hash.disabled.dll"))
        $prefix = $rootPath + [IO.Path]::DirectorySeparatorChar
        if (!$sourcePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or !$targetPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Addon backup path is outside the project.' }
        if (Test-Path -LiteralPath $targetPath) {
            if ((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Existing disabled-addon backup differs.' }
            Remove-Item -LiteralPath $sourcePath
        } else {
            Move-Item -LiteralPath $sourcePath -Destination $targetPath
        }
    }
    Sync-RuntimeManifest
    Write-Output 'Disabled the experimental 3D viewmodel addon. Restart Fallout 4.'
    return
}
if ((Get-FileHash -LiteralPath $overlay -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'd90dd66783c85445b4aed7912faf575972eb00b35b1ca7fabf367fc39bc4a26b') { throw 'Install the core mod with its original overlay host before enabling the addon.' }
$native = Get-Content (Join-Path $buildDir 'native_report.json') -Raw | ConvertFrom-Json
$binary = Get-Content (Join-Path $buildDir 'binary_report.json') -Raw | ConvertFrom-Json
$candidate = Join-Path $buildDir 'FPVDroneViewmodel.dll'
$mesh = Join-Path $buildDir 'drone_fpv.nif'
$dllHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
if ($native.native.result -ne 'pass' -or $binary.result -ne 'pass' -or $dllHash -ne $native.dllSHA256 -or $dllHash -ne $binary.dllSHA256) { throw 'Viewmodel DLL does not match passing validation reports.' }
if ((Get-FileHash -LiteralPath $mesh -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binary.meshSHA256) { throw 'Viewmodel NIF does not match validation report.' }
if ((Get-FileHash -LiteralPath (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $native.originalNativeSHA256) { throw 'Flight DLL has changed since validation.' }
Copy-Item -LiteralPath $mesh -Destination (Join-Path $projectRoot 'Meshes\FPVDrone\drone_fpv.nif') -Force
Copy-Item -LiteralPath $candidate -Destination $runtime -Force
Sync-RuntimeManifest
Write-Output 'Installed the experimental 3D viewmodel addon. Restart Fallout 4 before testing.'
