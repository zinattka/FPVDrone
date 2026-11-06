# Building FPV Drone

## What can be rebuilt

The repository contains sources for the controller bridge, Papyrus additions,
merge tools and tests. The original flight DLL's C++ source and complete original
Papyrus source were lost. `FPVDroneNative.dll` version 128 remains a pinned binary input;
this repository does not provide a complete source rebuild of that module.

`Source/LaunchTransition/FPVDroneQuestScript.psc` is a **build fragment**, not a
replacement for the full quest script. Its compiled functions are merged into
the preserved release PEX. Compile-time dependency declarations and compatibility
callbacks must not be removed merely because they appear empty.

## Prerequisites

- Windows x64 and PowerShell.
- Node.js for the PEX tools and compiled-bytecode tests.
- Zig **0.13.0** for the controller bridge and native probes.
- A local Fallout 4 **1.10.163** installation, official Papyrus compiler/assembler,
  and base Papyrus sources/flags supplied with the game's development tools.
- The preserved inputs in `Source/Legacy/0.1.28` and comparison fixtures in
  `Tests/Fixtures`. Their hashes/structure are verified by the build.

Game executables, masters, animation archives, compiler tools and third-party
runtime dependencies are local prerequisites; they are not release contents.

## Build the core

From the repository root:

```powershell
# Compile, merge, analyze and test; does not install.
.\Tools\build_launch_transition.ps1 -GameRoot 'D:\Games\Fallout 4' -ZigPath 'D:\Tools\zig-0.13.0\zig.exe'

# Papyrus/ESP build and checks while retaining the installed controller DLL.
.\Tools\build_launch_transition.ps1 -GameRoot 'D:\Games\Fallout 4' -KeepControllerRuntime

# Controller bridge and native checks only.
.\Tools\build_controllers.ps1 -ZigPath 'D:\Tools\zig-0.13.0\zig.exe'
```

The controller build uses Zig's Windows GNU target; the scripts validate the
Zig version. If `-ZigPath` is omitted, the current script looks under
`_build/toolchain/zig-windows-x86_64-0.13.0/zig.exe`. Build outputs are under `_build`.

The Papyrus build compiles the fragment, merges it into the exact baseline,
relocates branches and runs the official assembler's analysis. It preserves
original saved-variable definitions and verifies unrelated functions. ESP
generation reads the installed vanilla IDLE records without copying game
animation assets into the release.

`Source/Legacy/0.1.28` contains the original mod's ESP and quest PEX required
by the patcher. `Tests/Fixtures/0.1.35` and `Tests/Fixtures/0.1.36` hold the
comparison inputs used by the regression suite. These are preserved mod inputs,
not generated caches. Do not remove them as unused output.

The controller bridge targets only game 1.10.163 and the original flight DLL:

```text
5ae7afd93592faa14494ce22f4f9491e2e57d6bc2ce22696ba77948b6a5af6c9  FPVDroneNative.dll
```

## Install a local build

Close Fallout 4 first. Add `-Install` to the full build command to copy its
tested PEX, ESP and controller DLL into this mod directory. With
`-KeepControllerRuntime -Install`, the controller DLL is retained.

Do not install the fragment's compiled PEX by itself. It contains compile-time
stubs in place of original functions; only the merged candidate is runnable.

## Validation and release contents

See [TESTING.md](TESTING.md). Automated probes validate compiled logic, ABI and
hook structure; they do not substitute for a physical-controller game test.

Check a clean checkout using only Python and Node.js (no game install needed):

```powershell
python Tools/prepare_release.py --check
```

This verifies both manifests, round-trips the shipped PEX and runs its 271
behavior/MCM checks. It seeds disposable candidates under `_build` from the
shipped runtime; it does not claim to compile Papyrus without the game SDK.

After intentional source/documentation changes, refresh the repository manifest
and create the three deterministic ZIP files and their checksums:

```powershell
python Tools/prepare_release.py --refresh-manifest --output dist
```

Use a new `--output` directory for another export; the packager refuses to
overwrite an existing prepared repository. Each ZIP has its own manifest and
fixed entry timestamps. See [PUBLICATION.md](PUBLICATION.md) for GitHub steps.

The release preserves the confirmed installed DLLs and PEX. Source cleanups
were rebuilt and tested separately; recompiling can produce different metadata
or linker layout, so byte-identical reconstruction is not promised. No newly
rebuilt native DLL is substituted merely to prepare an archive.

Publish the curated runtime archive as the installable mod. Development source,
tests and documentation belong in the repository/source archive. Exclude build
caches, local toolchains, probe executables, logs, device caches, user MCM
settings, saves and reverse-engineering scratch output from release packages.

The prepared artifacts are:

| Artifact | Purpose |
| --- | --- |
| `dist/FPVDrone-0.1.40.zip` | Core mod for players |
| `dist/FPVDrone-Viewmodel-0.1.40-experimental.zip` | Optional 3D-viewmodel add-on |
| `dist/FPVDrone-0.1.40-source.zip` | Curated source/repository snapshot |
| `dist/FPVDrone-GitHub` | Repository-ready directory |

## Optional experimental viewmodel

The viewmodel has its own instructions under `Source/Viewmodel/README.md`.
Its C++ plugin is built separately:

```powershell
.\Tools\build_fpv_viewmodel.ps1 -ZigPath 'D:\Tools\zig-0.13.0\zig.exe'
```

Mesh generation and independent binary/mesh checks additionally require Python,
Capstone and the official PyNifly 29.1.0 Python/DLL layer. See the component
instructions for its dependency layout and commands. The preserved source OBJ
is `Source/Viewmodel/model/drone.obj`; model geometry and PE helpers are in
`Tools/model_geometry.py` and `Tools/pe_image.py`. No `_analysis` scratch files
are required. This component is not needed for the core build or flight.

The project's code uses the MIT License, copyright 2026 FPV Drone contributors.
Model and texture adaptations retain CC BY 4.0 attribution. See
[CREDITS.md](CREDITS.md) for asset origins and dependency ownership.
