# Optional 3D FPV viewmodel — experimental runtime 4

This addon decorates the FPV camera with two motor housings, two counterrotating
propellers and the RPG charge from the credited drone model. The core mod does
not require it. Runtime 4 has passed the offline checks below; its rendering has
not been confirmed in Fallout 4. Core launch confirmation does not verify this
optional renderer.

The addon contains only:

- `F4SE/Plugins/FPVDroneViewmodel.dll`
- `Meshes/FPVDrone/drone_fpv.nif`

It uses the core's original 118-byte `Interface/FPVDroneOverlay.swf` host and the
existing drone material/textures. The retired sprite/vector overlay is not part
of the build or installation workflow.

## Build and check

Requirements: Python 3, Capstone, the official PyNifly 29.1.0 Python/DLL layer,
Zig 0.13.0 and a local Fallout 4 1.10.163 installation for executable-signature
checks. Third-party build tools and game files are not included in the addon.

From the repository root:

```powershell
python Tools/build_fpv_viewmodel.py --pynifly-root 'D:\Tools\PyNifly'
./Tools/build_fpv_viewmodel.ps1 -ZigPath 'D:\Tools\Zig\zig.exe'
python Tools/check_fpv_viewmodel.py --game-root 'D:\Games\Fallout 4' --pynifly-root 'D:\Tools\PyNifly'
```

`--pynifly-root` points to the directory containing the `pyn` package and its
native layer. `FPV_PYNIFLY_ROOT` is its environment-variable alternative; the
local development fallback is `_build/deps/pynifly`. The checker accepts
`FALLOUT4_ROOT` instead of `--game-root`. Capstone must be importable by Python;
`_build/deps/python` is an optional local-development fallback. Zig defaults to
`_build/toolchain/zig-windows-x86_64-0.13.0/zig.exe` when `-ZigPath` is omitted.

Outputs and validation reports go to `_build/visuals3d`. The mesh builder accepts
`--output-dir`; the checker accepts the corresponding `--build-dir`.

The mesh builder reads `Source/Viewmodel/model/drone.obj` and the existing
`Meshes/FPVDrone/drone_static.nif`. `Tools/model_geometry.py` supplies the OBJ and
component helpers without image-rendering dependencies. The binary checker uses
`Tools/pe_image.py`; no `_analysis` files are required.

The native probe passes 297 assertions covering camera-relative placement,
pause/exit, load/reference failure, stale cleanup and hook installation against a
mapped copy of the original flight DLL. The independent checker passes 41
binary/mesh/public-ABI assertions. It checks installed executable signatures,
model structure/materials and the runtime-4 Query export without executing game
code. Mesh round trips preserve all 3,324 selected triangles and verify every
selected vertex's UV, normal and position error. These checks do not establish
in-game visibility.

## Optional local installation

For a mod-manager release, install this addon separately after the core mod.
For a local source build, fully close Fallout 4, then run:

```powershell
./Tools/install_fpv_viewmodel.ps1
```

The script requires matching successful candidate reports and the original core
overlay hash. It copies only the optional DLL and mesh. To disable that local
installation, close the game and run:

```powershell
./Tools/install_fpv_viewmodel.ps1 -Disable
```

The DLL is preserved under `_build/visuals3d/disabled`; the overlay is not changed.
When using MO2 or Vortex, disable the separate addon in the mod manager instead.

## Runtime design

Only Fallout 4 1.10.163 and the exact original flight DLL are accepted. Its
SHA-256 is `5ae7afd93592faa14494ce22f4f9491e2e57d6bc2ce22696ba77948b6a5af6c9`.
Complete prologues are validated before wrapping the original camera callback
and flight-end entry. Controller integrator/IAT hooks are untouched.

The five private BSTriShapes retain original UVs/normals and the core BGSM/DDS
maps. The engine's model-demand path supplies a cached prototype. Runtime 4 uses
the complete engine Clone wrapper, retains an independent instance and prepares
all five materials with engine-constructed BSShaderData and ApplyMaterialData.
Resource entry signatures are checked before hooks are installed. Failure hides
only the decoration, and no per-frame resource-load retry occurs.

The model is attached below ShadowSceneNode/WorldRoot when available, separately
from the deliberately invisible drone actor. The optical camera's transform,
frustum slopes and near plane determine camera-relative placement. Rotor speed
follows throttle. Pause hides/freezes the decoration; flight end and pre-load
queue main-thread detachment. Parent references and generation checks protect
actor unload and rapid relaunch. No addon state is serialized into saves.

Runtime diagnostics: `Data/F4SE/FPVDroneViewmodel.log`, normally MO2 overwrite.
They include signature/resource failures, scene ancestry and bounded render
snapshots; no per-frame file writes are performed. Live testing must still cover
visibility/materials, the user's FOV, rotor motion, signal loss and repeated
launch/exit. Nearby world surfaces may occlude this camera decoration.

Model and texture attribution: [../../CREDITS.md](../../CREDITS.md).

Primary ABI references:

- [F4SE 0.6.23 material declarations](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/NiMaterials.h)
- [F4SE BGSM loader](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/NiMaterials.cpp)
- [F4EE material application](https://github.com/expired6978/F4SEPlugins/blob/master/f4ee/OverlayInterface.cpp#L148)
- [NiObject clone ABI](https://github.com/Ryan-rsm-McKenzie/CommonLibF4/blob/master/CommonLibF4/include/RE/NetImmerse/NiObject.h)
