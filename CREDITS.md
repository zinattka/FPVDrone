# Credits and licenses

## Code

FPV Drone contributors, 2026. Project code, build tools and documentation are
licensed under MIT; see LICENSE. The implementation includes substantial
AI-generated code. The original flight DLL's C++ source and complete original
Papyrus source were lost; the preserved binaries and available additions are documented in
BUILDING.md. A complete native-flight source rebuild is not available.

## Drone model and textures

[FPV kamikaze drone Low-poly](https://sketchfab.com/3d-models/fpv-kamikaze-drone-low-poly-87f5bbb5b08641b782bc084ddd4082a7)
by [Kvasovich](https://sketchfab.com/Kvasovich),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Adaptations: OBJ conversion to Fallout 4 NIF, orientation and scale changes,
flight/camera/static/hand variants, DDS conversion with mipmaps, BGSM material
mapping, and separate optional viewmodel components with rotation pivots.
Original UVs and normal data are retained for those components. See
ASSET_LICENSE.md for covered files. No endorsement by Kvasovich is implied.

## Dependencies installed separately

- [Fallout 4 Script Extender](https://f4se.silverlock.org/)
- [Garden of Eden Papyrus Script Extender](https://www.nexusmods.com/fallout4/mods/74160)
- [Mod Configuration Menu](https://www.nexusmods.com/fallout4/mods/21497)

Their authors retain their rights. Dependency DLLs/scripts, Bethesda game
files, compiler tools and third-party build libraries are not bundled. Source
builds use developer-installed tools described in BUILDING.md. Mesh extraction
uses PyNifly; executable-signature checks use Capstone. Neither is a runtime
requirement or included in these release archives.
