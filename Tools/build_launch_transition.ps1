param(
    [string]$GameRoot = 'C:\Games\Fallout 4',
    [string]$ZigPath = '',
    [switch]$KeepControllerRuntime,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourceDir = Join-Path $projectRoot 'Source\LaunchTransition'
$buildDir = Join-Path $projectRoot '_build\launch_transition'
$compilerPath = Join-Path $GameRoot 'Papyrus Compiler\PapyrusCompiler.exe'
$assemblerPath = Join-Path $GameRoot 'Papyrus Compiler\PapyrusAssembler.exe'
$baseSource = Join-Path $GameRoot 'Data\Scripts\Source'
$flagsPath = Join-Path $baseSource 'Base\Institute_Papyrus_Flags.flg'
$imports = @($sourceDir, $baseSource, (Join-Path $baseSource 'Base'), (Join-Path $baseSource 'User')) -join ';'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
Push-Location $sourceDir
try {
    & $compilerPath FPVDroneQuestScript.psc "-i=$imports" "-f=$flagsPath" "-o=$buildDir" -keepasm
    if ($LASTEXITCODE -ne 0) { throw 'Launch fragment compilation failed' }
} finally { Pop-Location }
& node (Join-Path $PSScriptRoot 'build_launch_transition.js') --game-root $GameRoot
if ($LASTEXITCODE -ne 0) { throw 'PEX merge/structural validation failed' }
$candidateDir = Join-Path $buildDir 'candidate'
Push-Location $candidateDir
try {
    & $assemblerPath FPVDroneQuestScript -D -A
    if ($LASTEXITCODE -ne 0) { throw 'Official PEX analysis failed' }
} finally { Pop-Location }
& node (Join-Path $PSScriptRoot 'test_launch_transition.js')
if ($LASTEXITCODE -ne 0) { throw 'Launch transition behavioral checks failed' }
& node (Join-Path $PSScriptRoot 'test_controller_menu.js')
if ($LASTEXITCODE -ne 0) { throw 'Controller MCM behavioral checks failed' }
if (!$KeepControllerRuntime) {
    & (Join-Path $PSScriptRoot 'build_controllers.ps1') -ZigPath $ZigPath
} else {
    # A Papyrus-only diagnostic update must not replace the installed native DLL.
    $controllerPath = Join-Path $projectRoot 'F4SE\Plugins\FPVDroneController.dll'
    if (!(Test-Path -LiteralPath $controllerPath)) { throw 'Installed controller runtime is missing' }
    Write-Output 'Keeping the installed controller runtime unchanged.'
}
if ($Install) {
    Copy-Item -LiteralPath (Join-Path $candidateDir 'FPVDroneQuestScript.pex') -Destination (Join-Path $projectRoot 'Scripts\FPVDroneQuestScript.pex')
    Copy-Item -LiteralPath (Join-Path $candidateDir 'FPVDrone.esp') -Destination (Join-Path $projectRoot 'FPVDrone.esp')
    if (!$KeepControllerRuntime) {
        Copy-Item -LiteralPath (Join-Path $projectRoot '_build\controllers\FPVDroneController.dll') -Destination (Join-Path $projectRoot 'F4SE\Plugins\FPVDroneController.dll')
    }
    $manifestPath = Join-Path $projectRoot 'FILE_MANIFEST.sha256'
    $trackedPaths = @(Get-Content -LiteralPath $manifestPath | ForEach-Object {
        if ($_ -match '^[0-9a-f]{64}  (.+)$') { $matches[1] }
    })
    $trackedPaths += @('CHANGELOG.md', 'meta.ini', 'Source/LaunchTransition/FPVDroneQuestScript.psc',
        'Source/LaunchTransition/FPVDroneNative.psc', 'Source/LaunchTransition/README.md',
        'Tools/pex.js', 'Tools/build_launch_transition.js', 'Tools/build_operator_pose.js', 'Tools/build_launch_transition.ps1', 'Tools/test_launch_transition.js',
        'F4SE/Plugins/FPVDroneController.dll', 'Source/Controllers/controller_bridge.cpp', 'Source/Controllers/controller_math.h',
        'Source/Controllers/controller_devices.h', 'Source/Controllers/controller_devices.cpp', 'Source/Controllers/device_probe.cpp',
        'Source/Controllers/bridge_probe.cpp', 'Source/Controllers/README.md', 'Source/LaunchTransition/MCM.psc',
        'Source/LaunchTransition/F4SE.psc', 'Source/LaunchTransition/GardenOfEden2.psc',
        'Tools/build_controllers.ps1', 'Tools/test_controller_menu.js')
    $manifestLines = @($trackedPaths | Sort-Object -Unique | ForEach-Object {
        $hashValue = (Get-FileHash -LiteralPath (Join-Path $projectRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hashValue  $_"
    })
    [System.IO.File]::WriteAllText($manifestPath, (($manifestLines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Output 'Installed FPV Drone 0.1.40. Restart Fallout 4 before testing.'
}
