# FPV Drone development repository

This is a snapshot of the active **FPV Drone** mod folder in Mod Organizer 2,
taken on **2026-11-06**. Its base version is **0.1.40**, with the experimental
3D viewmodel work described in [CHANGELOG.md](CHANGELOG.md) and
[Source/Viewmodel/README.md](Source/Viewmodel/README.md).

The original working folder was left unchanged. The publication snapshot
contains the runtime files, available sources, tools, documentation, original
model assets and the small baseline inputs needed by the build/regression tools.
Downloaded dependencies, toolchains, caches, generated research reports, logs
and personal MCM settings are excluded.

## Build and use

- Installation and requirements: [English](README.md), [Russian](README_RU.md).
- Controller input: [Source/Controllers/README.md](Source/Controllers/README.md).
- Papyrus fragment and merge: [Source/LaunchTransition/README.md](Source/LaunchTransition/README.md).
- FPV visuals: [Source/Visuals/README.md](Source/Visuals/README.md).
- Experimental native 3D viewmodel: [Source/Viewmodel/README.md](Source/Viewmodel/README.md).
- In-game scenarios and limitations: [TESTING.md](TESTING.md).

Build prerequisites such as Zig, Python libraries, PyNifly, Ruffle and the
official Fallout 4 Papyrus compiler must be installed separately as described
by the relevant tools and source documentation. The native flight DLL's full
original source is unavailable; the Papyrus fragment is merged with preserved
original bytecode. This repository does not claim a complete source rebuild of
every original binary.

The GitHub source archive includes development files. Install only the runtime
folders and FPVDrone.esp according to the mod instructions. This snapshot does
not create a separately tested release.

## Credits

Keep [CREDITS.md](CREDITS.md), including the model/texture CC BY 4.0 attribution.
No additional whole-project license has been selected. Game files and external
runtime dependencies are not bundled.

## Publication checks

On 2026-11-06, checks of the snapshotted installed quest PEX passed 178 launch
scenarios and 93 controller-menu scenarios. All four installed PEX files also
passed byte-identical parse/write round trips. Every entry in the supplied
SHA-256 manifest matched the publication snapshot. These checks simulate
Papyrus calls; they do not verify in-game rendering or physical controllers.
