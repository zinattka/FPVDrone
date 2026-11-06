# FPV camera hardware — visual prototype, 2026-11-05

**Superseded by [the actual 3D viewmodel](../Viewmodel/README.md).** The user
confirmed this vector version was visible in Fallout 4 but its flat shading
was insufficient. It is preserved as a rollback; the installed 3D version uses
the original empty overlay host and renders hardware as NIF scene geometry.

Adds two front propellers/motor housings at the edges of the FPV picture and
the RPG nose below the centre. This is a camera-space decoration, implemented
entirely in `Interface/FPVDroneOverlay.swf`. World/hand NIFs, ESP, Papyrus and
both native DLLs are unchanged. The model has no propeller animation; this
layer supplies its own 24-frame, 60 FPS cycle with opposite directions and
45-degree exposure blur. Its visual cycle is independent of throttle.

The geometry and texture in `model/` come from the already-used **FPV kamikaze
drone Low-poly by Kvasovich**, CC BY 4.0. See [../../CREDITS.md](../../CREDITS.md).
`frames/` contains intermediate textured renders, including premultiplied
motion blur. The builder traces their quantized RGBA regions into solid-colour
vector paths. No image characters, bitmap fills, gradient fills or external
texture references are present in the installed SWF. The shading is baked;
these camera decorations do not receive the game's scene lighting.
The camera projection is arranged for this FPV view, not for world geometry.

The anonymous, empty `root1.FPVDroneCanvas` timeline and native HUD contract
are retained. A separate `FPVDroneVisual` timeline starts hidden. Its only
ENTER_FRAME listener waits for
`FPVDroneCanvas/FPVDroneThrottle/fpvView`, inserts itself at child index 0,
then removes the listener. It inherits the native view's 4:3 position/scale
and panel visibility. The existing signal veil, noise and OSD remain above
the new art. Until the hierarchy exists the decoration remains invisible.
Closing the overlay movie releases the visual timeline with its parent.

## Build and validate

Requires Python 3 with Pillow. The current workspace has a Python/Pillow
runtime available through the desktop workspace dependencies. The build
emits standard SWF15 and ABC46.16 directly; Flash/Animate is unnecessary.

```powershell
python Tools/render_fpv_parts.py       # only after changing geometry/projection
python Tools/build_fpv_visuals.py      # builds from checked-in frames
# Test-only: extract @ruffle-rs/ruffle 0.7.1 into _build/visuals/package;
# make the Playwright Node package and Chromium available.
node Tools/preview_fpv_visuals.cjs
python Tools/test_fpv_visuals.py
python Tools/build_fpv_visuals.py --install
```

Installation checks that the validation report's SHA-256 matches the current
build. Close Fallout 4 before installing. The original 118-byte SWF is kept
in `_build/visuals/FPVDroneOverlay.original.swf`; copy it back to
`Interface/FPVDroneOverlay.swf` to undo only this visual change.

`_build/visuals/test_report.json` records 951 structural/raster assertions. Ruffle
executes the actual attachment bytecode and timeline in five independent
hosts: native hierarchy present, hierarchy absent, parent transparency, opaque
signal veil and inherited half scale/offset. Two captured playback frames
prove motion is confined to the rotor strip. This is **not** a Fallout 4
Scaleform or flight test. The revised vector build must still be checked for menu transitions,
4:3/16:9/ultrawide placement and signal-loss rendering.

The test renderer and its downloaded dependencies stay under `_build` and
are not game dependencies. The revised SWF has 25 vector shapes, no bitmap
allocations, and is about 259 KiB.

## Green-fill regression and correction

The user tested the first embedded-bitmap build in Fallout 4 and reported a
light-green texture covering the lower half of the FPV view instead of the
parts. Its Ruffle pass did not establish compatibility with the game's image
renderer. The exact engine-side failure was not traced; the affected area
matches the authored image rectangle at y=400..768.

The failed build is preserved as
`_build/visuals/FPVDroneOverlay.bitmap-failed.swf`. The correction removes the
bitmap rendering path entirely, while retaining the same component placement
and timeline. New checks inspect every fill style and reject any bitmap or
external image tag, then render the five Ruffle hosts again. This resolves
the unsupported-image dependency, but the visual result in Fallout still
requires the user's repeat test after fully restarting the game.

Format references: [Adobe SWF specification](https://www.flashrealtime.com/content/dam/Adobe/en/devnet/swf/pdf/swf_file_format_spec_v10.pdf),
[Adobe AVM2 source/specification](https://github.com/adobe-flash/avmplus/blob/master/doc/abcFormat-46-16.txt).
