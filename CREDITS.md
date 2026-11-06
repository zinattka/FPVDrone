# Credits and licenses / авторы и лицензии

## Drone model and textures

**[FPV kamikaze drone Low-poly](https://sketchfab.com/3d-models/fpv-kamikaze-drone-low-poly-87f5bbb5b08641b782bc084ddd4082a7)** by
**[Kvasovich](https://sketchfab.com/Kvasovich)**, licensed under
**[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)**.

Changes for FPV Drone: converted the supplied OBJ to Fallout 4 NIF meshes;
scaled and oriented the drone; prepared flight, camera, static and hand variants;
converted the supplied texture maps to 2048-pixel DDS textures with mipmaps;
adapted material channels and created a Fallout 4 BGSM material.
FPV camera visual prototype: isolated and rendered the source propellers,
front motor housings and RPG nose into intermediate textured renders, then
traced those into shaded vector HUD shapes; supplied a separate propeller
motion-blur cycle in the overlay SWF. These derived sprites
retain the model's CC BY 4.0 attribution and permissions.
The current 3D FPV viewmodel extracts the original motor/propeller/charge
geometry from the converted game NIF, retains its UVs/normals and original
BGSM/DDS material, and separates the parts around individual rotation pivots.
The camera placement and native propeller animation are adaptations; model
geometry retains the same CC BY 4.0 attribution and permissions.
No endorsement by the original creator is implied.

CC BY 4.0 permits sharing and adaptation, including commercial use, with proper
credit, a license link and an indication of changes. The model and its texture
adaptations retain these permissions; this notice does not relicense the entire
mod, runtime dependencies or underlying Fallout 4 game assets.

Исходная модель и текстуры: **Kvasovich**, **CC BY 4.0**, ссылки выше.
Для Fallout 4 изменены формат, масштаб и ориентация модели, подготовлены варианты
для полёта/камеры/руки, игровые текстуры с mipmaps и материал BGSM.
При распространении сохраняйте эту атрибуцию, ссылку на лицензию и указание изменений.

## Mod implementation

Native flight/controller, Papyrus logic, FPV HUD, integration and procedural
motor audio developed for FPV Drone with substantial AI-generated code.

## Runtime dependencies (installed separately)

- [Fallout 4 Script Extender / F4SE](https://f4se.silverlock.org/).
- [Garden of Eden Papyrus Script Extender](https://www.nexusmods.com/fallout4/mods/74160).
- Optional: [Mod Configuration Menu](https://www.nexusmods.com/fallout4/mods/21497).

Their authors retain their respective rights. Dependency binaries and scripts
are not bundled in this package.
