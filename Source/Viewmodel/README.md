# Actual 3D FPV viewmodel — experimental, 2026-11-05

Current runtime **4** fixes the missing live-instance/material initialization
steps. The user's runtime-3 test still showed no hardware. Its live log proves
that all five parts load, attach below ShadowSceneNode and have correct world
bounds and camera-relative positions (charge screen01 = 0.500, 0.830; props at
x = 0.116 / 0.884). Positioning and branch visibility changes alone did not
resolve the rendering failure.

Runtime 4 obtains an independent instance through the engine's complete Clone
wrapper (RVA 1B94B00), including ProcessClone and context-map cleanup, and drops
the acquired cached-prototype reference. It retains one reference on the raw
clone. After attachment it loads the existing drone BGSM into a real engine-
constructed BSShaderData, applies it separately to all five private shapes and
destroys the temporary shader data. ApplyMaterialData calls texture loading,
MakeValidForRendering and the shader's geometry-binding callback. Private
shader LOD fade is set to 1 because this camera decoration has no ordinary
world-reference fade update. No source texture or original drone model changes.
The exact in-game cause remains unconfirmed until this version is tested.

The loader, clone, material constructor/destructor, BGSM load and material-apply
entry signatures are checked against the installed 1.10.163 executable before
any hook is installed. Invalid clone/material results hide the decoration and
leave flight running. No per-frame resource loads or retries occur.

The bounded diagnostics record cached, cloned and prepared geometry, then
frames 1 and 12: root RTTI, triangle/vertex counts, shader/material presence,
alpha, shader LOD fade, diffuse texture presence, GPU-buffer presence and the
engine Registered field. Buffer/Registered values are diagnostics, not an
assumption that GPU allocation must already have happened before first draw.
Runtime-3 ancestor/flags/bounds/frustum diagnostics remain enabled.

API references (primary sources, not linked or copied as a runtime dependency):
- [F4SE 0.6.23 material ABI and entry points](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/NiMaterials.h)
- [F4SE BGSM loader address](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/NiMaterials.cpp)
- [F4EE overlay material application example](https://github.com/expired6978/F4SEPlugins/blob/master/f4ee/OverlayInterface.cpp#L148)
- [NiObject CreateClone/ProcessClone virtual ABI](https://github.com/Ryan-rsm-McKenzie/CommonLibF4/blob/master/CommonLibF4/include/RE/NetImmerse/NiObject.h)

Runtime **2** corrects an engine-string ABI bug in runtime 1. The user saw no
hardware; the live log confirmed plugin installation followed by the generic
model-load/structure rejection. `NiObjectNET::m_name` stores a pointer to a
`StringCache::Entry`, not a raw C string. Runtime 1 therefore could not match
the model/part names even when loaded. Runtime 2 reads inline entry text at
+0x18, follows bounded external entries and rejects wide/unreadable/cyclic
entries. The probe now uses actual entry headers instead of the incorrect
raw-string fixture. A failure also records the loader result, decoded root
and child names, child count and parent-link checks. The precise v1 rejection
stage was not logged separately; runtime 2 still needs an in-game retest.

The FPV picture now uses real NIF geometry extracted from the installed
`drone_static.nif`: two motor housings, two propellers and the RPG charge.
The five independently transformable BSTriShapes retain all 3,324 original
triangles in those parts, original UVs/normals, and regenerated tangent space.
They use the existing `Materials/FPVDrone/drone.bgsm` and the same diffuse,
normal and specular DDS textures as the game drone. Lighting/material shading
comes from Fallout's 3D renderer rather than a flat, colour-quantized SWF.

`FPVDroneViewmodel.dll` is a separate F4SE plugin for Fallout 4 **1.10.163**.
It accepts only the original flight DLL's pinned SHA-256. It verifies and
wraps the original camera callback and flight-end entry with complete,
position-independent prologue trampolines. Controller integrator/IAT hooks
are untouched. No existing DLL is rewritten on disk, no ESP/Papyrus change
or additional dependency is required. Address Library was read at build time
to resolve BSModelDB; it is not a runtime requirement.

The game's normal `BSModelDB::Demand` path loads/processes the private mesh
and its materials. One retained independent model instance is attached to the world
rendering branch found above the drone actor's loaded root. This avoids the
actor's deliberate SetAlpha(0) and provides its own scene lighting/fade data.
If no recognized world branch is available, it retains the immediate-parent
fallback and records the hierarchy for diagnosis. After each original optical-camera update, the plugin
solves that parent's inverse world transform and places only its own visual
child relative to the optical camera. Actor position/angles and collision are
not modified. Camera frustum slopes and near clip determine uniform component
scale/depth; props stay at the edges of the central 4:3 picture and the charge
stays below the reticle. The original game FOV/near plane is not changed.

The propellers rotate independently in opposite directions. Speed follows
native throttle; pause freezes/hides them. No original NIF animation is needed.
The model's own rotations are cleared from the engine's identity-inheritance
fast path, and the scene branch's culling bound includes the new geometry.

Stopping/detonating first hides the visual root, then queues main-thread
detachment. A retained scene-parent reference protects against actor unload before
the task runs. A native flight-generation check prevents old cleanup from
detaching a rapid relaunch. Pre-load also queues cleanup. No viewmodel state
is serialized into the save. Missing/unsupported resources disable only the
decoration and log the reason; flight continues.

The flat SWF hardware decoration is disabled by restoring the original
118-byte overlay container. Existing native telemetry, bars and interference
continue to cover the 3D world and the viewmodel.

## Build, validation and installation

```powershell
# Python + official PyNifly 29.1.0 Python/DLL layer under _build/deps/pynifly:
python Tools/build_fpv_viewmodel.py
./Tools/build_fpv_viewmodel.ps1
python Tools/check_fpv_viewmodel.py
# Close Fallout 4 first; installer requires matching passing report hashes:
./Tools/install_fpv_viewmodel.ps1
```

Build/check output is under `_build/visuals3d`. The native probe passes 297
assertions, including camera-relative rotation/scale, pause, stop/detonation,
actor unload, rapid relaunch/stale cleanup, resource failure, reference balance
and installing hooks against a mapped original DLL without executing its game
code. The independent binary/mesh/public-DLL-ABI checker passes 41 assertions.
Mesh round trips additionally check every selected vertex's UV, normal and
position error. These are **not** an in-game rendering test.

The user confirmed the preceding vector prototype was visible, but its
quality was insufficient. Runtime 1 of this 3D replacement failed its model
contract in-game; runtime 2 loaded and attached it but the user still saw no
hardware. Runtime 3 had correct poses/bounds but remained invisible. Runtime 4
includes the clone/material initialization above and needs a complete game
restart and a live check of material appearance, placement at the user's FOV,
rotation, weak/no signal and repeated launch/exit. As scene geometry placed in
front of the lens, it can be occluded by nearby world surfaces; its visual
depth/scale are fitted for the camera, not a replacement physical drone body.

Runtime diagnostics: `Data/F4SE/FPVDroneViewmodel.log` (typically MO2 overwrite).
It records hook rejection, model loading, actual frustum/near/depth/scale and
attachment failures. No per-frame file writes are performed.

To return to the confirmed visible vector prototype, close the game and run:

```powershell
./Tools/install_fpv_viewmodel.ps1 -RestoreVector
```

This moves the new plugin out of `F4SE/Plugins` and restores the preserved
vector overlay. The original drone meshes/materials/textures are unchanged.

Model attribution and CC BY 4.0 adaptation notice: [../../CREDITS.md](../../CREDITS.md).
Engine ABI references: [F4SE 0.6.23 NiObjects](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/NiObjects.h),
[F4SE tasks](https://github.com/ianpatt/f4se/blob/v0.6.23/f4se/Hooks_Threads.cpp),
[BSModelDB](https://github.com/alandtse/CommonLibF4/blob/master/CommonLibF4/include/RE/Bethesda/BSModelDB.h).
