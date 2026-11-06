param([switch]$RestoreVector)
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
    foreach ($name in @('F4SE/Plugins/FPVDroneViewmodel.dll', 'Meshes/FPVDrone/drone_fpv.nif', 'Interface/FPVDroneOverlay.swf')) {
        $target = Join-Path $projectRoot $name
        if (Test-Path -LiteralPath $target) { $entries[$name] = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
        else { $entries.Remove($name) }
    }
    $text = (($entries.Keys | Sort-Object -CaseSensitive | ForEach-Object { "$($entries[$_])  $_" }) -join "`n") + "`n"
    [IO.File]::WriteAllText($manifestPath, $text, [Text.UTF8Encoding]::new($false))
}
if ($RestoreVector) {
    $vector = Join-Path $buildDir 'baseline\FPVDroneOverlay.vector.swf'
    if ((Get-FileHash -LiteralPath $vector -Algorithm SHA256).Hash.ToLowerInvariant() -ne '83237bacd46fe45eb396dd5dd4c99fe41400d2bbc5cbb8e766aac8f775f75ffe') { throw 'Vector rollback SHA-256 differs.' }
    if (Test-Path -LiteralPath $runtime) { Move-Item -LiteralPath $runtime -Destination (Join-Path $buildDir 'FPVDroneViewmodel.disabled.dll') -Force }
    Copy-Item -LiteralPath $vector -Destination $overlay -Force
    Sync-RuntimeManifest
    Write-Output 'Restored the confirmed visible vector prototype; the 3D plugin is disabled.'
    return
}
$native = Get-Content (Join-Path $buildDir 'native_report.json') -Raw | ConvertFrom-Json
$binary = Get-Content (Join-Path $buildDir 'binary_report.json') -Raw | ConvertFrom-Json
$candidate = Join-Path $buildDir 'FPVDroneViewmodel.dll'
$mesh = Join-Path $buildDir 'drone_fpv.nif'
$dllHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
if ($native.native.result -ne 'pass' -or $binary.result -ne 'pass' -or $dllHash -ne $native.dllSHA256 -or $dllHash -ne $binary.dllSHA256) { throw 'Viewmodel DLL does not match passing validation reports.' }
if ((Get-FileHash -LiteralPath $mesh -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binary.meshSHA256) { throw 'Viewmodel NIF does not match validation report.' }
if ((Get-FileHash -LiteralPath (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneNative.dll') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $native.originalNativeSHA256) { throw 'Flight DLL has changed since validation.' }
$empty = Join-Path $projectRoot '_build\visuals\FPVDroneOverlay.original.swf'
if ((Get-FileHash -LiteralPath $empty -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'd90dd66783c85445b4aed7912faf575972eb00b35b1ca7fabf367fc39bc4a26b') { throw 'Original overlay rollback SHA-256 differs.' }
Copy-Item -LiteralPath $mesh -Destination (Join-Path $projectRoot 'Meshes\FPVDrone\drone_fpv.nif') -Force
Copy-Item -LiteralPath $candidate -Destination $runtime -Force
Copy-Item -LiteralPath $empty -Destination $overlay -Force
Sync-RuntimeManifest
Write-Output 'Installed the actual 3D FPV viewmodel and removed the flat hardware decoration from the overlay.'
