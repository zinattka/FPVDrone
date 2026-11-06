# FPV Drone 0.1.40 — external alpha test

A craftable, consumable FPV drone for **Fallout 4 1.10.163 (Old-Gen), Windows x64**.
Next-Gen, Anniversary and VR are not supported by this build. No DLC required.
Russian instructions: [README_RU.md](README_RU.md).

This working copy includes an experimental 3D FPV viewmodel: propellers,
motor housings and RPG charge extracted from the game NIF with original
textures/material. A separate FPVDroneViewmodel.dll follows the optical camera
and counterrotates the props according to throttle. It replaces the flat SWF
hardware imitation. Build/geometry/attachment/cleanup checks pass; the 3D build
needs an in-game test after a complete restart. Build/rollback details:
[Source/Viewmodel/README.md](Source/Viewmodel/README.md).

## Requirements

- [F4SE 0.6.23](https://f4se.silverlock.org/), the complete package including scripts, for game 1.10.163.
- [Garden of Eden Papyrus Script Extender 23.4 or newer](https://www.nexusmods.com/fallout4/mods/74160?tab=files), the modern main package including its DLL and Scripts. Legacy OG/NG 19.7 is too old.
- [Mod Configuration Menu 1.39](https://www.nexusmods.com/fallout4/mods/21497?tab=files), the file specifically for 1.10.163, is required to select and configure a controller. Without MCM, flight and the FPV HUD use keyboard/mouse with default sensitivity.

This mod does not require Address Library, HUDFramework, FallUI or MCM Helper.
Its own DLL, scripts, model, textures, HUD and motor sound are included.

## Installation and use

1. Exit Fallout 4 completely before installing or updating.
2. Install this ZIP using MO2 or Vortex and enable **FPVDrone.esp**. For manual installation, the archive contents belong in Data.
3. Start the game through **f4se_loader.exe**; when using MO2, run F4SE from MO2.
4. Craft **FPV Drone** at a Chemistry Station, under **Mines**. No perk required.
5. Select it under **Weapons**, in the grenade slot. Hold and release your assigned grenade control. After the mine throw, the player raises the Pip-Boy. A black screen covers the remaining camera setup, then reveals FPV when the native controller is ready.

The Pip-Boy animation temporarily uses first-person view; flight cleanup or
cancellation restores the original view. An unavailable/timed-out animation
cancels preparation. This transition still needs in-game validation, especially
with power armor, furniture and Pip-Boy/camera mods.

0.1.31 fixes the accidental D-to-cancel binding introduced in 0.1.29/0.1.30.
Fully restart the game and load your save: the erroneous saved binding is
removed automatically and F10 cancels again. D remains the yaw-right control.

During FPV flight, the operator's body uses a looping raised Pip-Boy pose. The
vanilla graph selects standing or sneaking, masking the upper body while crouched
and preserving the legs' stance. Male/female variants reuse the game's clips.
Flight completion, cancellation and load recovery stop the owned pose. Its
visual behavior still requires in-game validation.

One drone requires Aluminum ×3, Circuitry ×2, Copper ×2, Adhesive ×1, Fertilizer ×2,
and Oil ×1. Each completed throw spends one drone. Cancellation after release and
subsequent flight termination do not refund it. **F8 no longer launches a drone.**

## Controls

| Input | Action |
| --- | --- |
| Assigned grenade control, hold/release | Throw the selected drone |
| W / S | Increase / decrease throttle |
| A / D | Yaw left / right |
| Mouse | Roll and pitch |
| Left mouse button | Detonate |
| F10 | Abort preparation or flight without an explosion |

Throttle holds its setting. There is no automatic leveling. At level attitude,
50% throttle is the hover reference; tilted flight needs additional thrust.
The HUD displays km/h, throttle, hover reference, signal and distance.
MCM → FPV Drone adjusts yaw and mouse sensitivity (defaults: 55% and 100%).
The throw follows the game's control remapping. This table describes the
keyboard/mouse mode; controller bindings are configured below. F10 works in both modes.
Some MCM labels are currently in Russian.

## Gamepad and USB FPV controller

1. Connect the controller, then open **MCM → FPV Drone → Устройство управления полётом**.
2. Use **Обновить список устройств** (refresh devices), then select your device. The list contains keyboard/mouse and controllers detected by Windows through XInput or DirectInput. An FPV radio must expose a USB joystick; a serial port or radio link alone is not a game controller.
3. For Xbox/XInput or DualShock 4, select **Раскладка осей → Автоматически** (automatic axis layout). Use **Применить раскладку осей** to apply it again if needed. Mode 2 uses the left stick for throttle/yaw and the right stick for roll/pitch. Xbox uses Y/X and Rx/Ry respectively; DualShock 4 uses Y/X and Z/Rz. On DualShock 4, Rx/Ry are triggers, not the right stick. MCM shows the actual assigned axes.
4. The default is **Положение стика — прямой газ** (stick position — direct throttle): down is 0%, center is 50%, up is 100%. Throttle continuously follows the stick; releasing it to center returns to 50% without accumulating. Throttle inversion is enabled by default; check direction before launching. The old throttle-change mode remains an optional MCM selection.
5. Assign detonate and abort buttons. Numbers start at 1; 0 disables the binding. Xbox defaults are A (1) to detonate and B (2) to abort without an explosion. Keyboard F10 remains an emergency abort.

The rest of the game can remain on keyboard/mouse. The controller selected in
MCM controls drone flight only. For an FPV radio, another DirectInput device or
custom assignments, choose **Вручную** (manual), then assign axes and inversion.
FPV channel order depends on the radio's firmware and USB profile; calibrate it
in Windows if needed. Existing custom assignments are preserved. Automatic
layout leaves buttons, dead zone and rate settings intact, including a disabled
detonate binding set to 0.

Available axes are X, Y, Z, Rx, Ry, Rz and two sliders. Dead zone is a percentage
from 0 to 30 (default 5%); absolute throttle bypasses it. Separate yaw, roll and
pitch sliders scale maximum angular rates: 100% is the original rate, 200% is
double. All controller settings apply to the **next flight**.

Fully restart after updating. If throttle mode was not saved separately, direct
throttle becomes the new default. If the old mode was explicitly saved, select
**Положение стика — прямой газ** in MCM. Keyboard W/S still increase/decrease
throttle and retain the resulting level.

DirectInput selection is saved by device GUID and survives list reordering.
XInput selection uses slots #1–4; Windows may assign another gamepad to a saved
slot after reconnection. A missing saved controller stays listed as disconnected;
the mod does not silently select another device. Disconnecting the selected
controller during flight ends it without an explosion. In controller mode,
left mouse does not detonate; use the assigned controller button.

## Test status and limitations

This is an external alpha test, not a confirmed stable release. The user confirmed
that 0.1.31 fixed unintended cancellation and that MCM 0.1.32 detects the
controller. Logs record ground collisions during the rapid explosions; 0.1.33
corrects the right-stick layout for the identified DualShock 4. It also closes
a separate legacy Papyrus left-mouse detonation path in controller mode. These
fixes were confirmed working by the user. The new 0.1.34 direct-throttle default
still needs an in-game test with the physical controller. Automated checks do not
validate hardware behavior or animation rendering.
The original FPVDroneNative.dll remains 0.1.28. The new
FPVDroneController.dll (136) supports only runtime 1.10.163 and that exact original
DLL. See [TESTING.md](TESTING.md) for the test checklist and report details.

Version 0.1.36 fixes the DLL module handle passed to DirectInput and defers the
controller worker, device initialization and native hooks until a successful
save load or new game. No controller polling runs before the main menu; hot-plug
and MCM refresh remain available after entering the game. A temporary failure to
open a present controller is distinguished from a confirmed disconnection, with
up to one second allowed for its first valid sample. Direct throttle remains
enabled. The effect on the reported preconnected-controller startup crash and
black-screen launch cancellation still requires in-game verification; the old
logs do not establish every cancellation's exact cause.

Drone and operator share one loaded world area, which limits flight range.
Zero signal ends flight. Launching from furniture depends on whether its normal
animation graph permits throwing. Compatibility with other gameplay mods has
not been established beyond the stated dependencies.

Troubleshooting: confirm dependency versions, ESP activation and selection of the drone.
Console item grants must use `FPVDroneWeapon`, FormID `xx00080E`.
Legacy `FPVDroneLaunchProp`, `xx000807`, shares the displayed name and mine
animation but does not launch FPV. The prefix depends on load order. Chemistry
station Mines crafting produces the usable item. Compare equipped/expected
weapon and stock in the log's `Throw.Item` entry when diagnosing this symptom.
Use MCM → Diagnostics or `cqf FPVDroneQuest Diagnose` for diagnostics;
`cqf FPVDroneQuest AbortFlight` is an emergency camera return.
The main log is `Data/F4SE/Plugins/FPVDroneNative.log` (usually MO2 overwrite).
Controller log: `Data/F4SE/Plugins/FPVDroneController.log`; detected devices and
bridge readiness: `Data/F4SE/FPVDrone.controllers.ini`.
Additional diagnostics use `Data/F4SE/FPVDrone.runtime.ini.ini`.
Launch stage and cancellation reason are automatically written to
`Data/F4SE/FPVDrone.launch.ini` even when Papyrus logging is disabled. Aborted
launches display a notification; controller-open HRESULT values and input-abort
reasons are recorded in `FPVDroneController.log`.
Version 0.1.37 also records pre-Pip-Boy throw rejections in its `Throw` section,
including captured equipment/count, interaction and cancellation stage. It is
the last rejection, not a log of successful throws; check the Snapshot time.
The user confirmed 0.1.37 works when Fallout 4 uses keyboard/mouse controls.
Version 0.1.38 added an engine-throw fallback for global gamepad mode, separately
from the drone input choice in MCM, but incorrectly required engine payment.
The user's failed throw leaves inventory unchanged. Version 0.1.39 captured
the pre-throw count but wrongly expected the literal weaponFire.2 Papyrus tag.
The engine splits that annotation into tag weaponFire and payload 2; Papyrus
does not receive the payload. Version 0.1.40 requires the owned base fire then
throwEnd, followed by normal animation completion, to allow one script payment.
An engine-paid decrement is accepted without a second removal. The Spend
section captures payment inputs, Gate state and the last eight Events before
reset. Fully restart after updating. On 2026-11-05 the user confirmed that the
previously failing launch with Fallout 4's global gamepad controls works in 0.1.40.
Keep the camera backup while flight is active.

To disable: end flight, run `cqf FPVDroneQuest Shutdown`, save, exit the game,
then disable the mod and ESP. To enable again in that save, run
`cqf FPVDroneQuest EnableMod`.

Asset information: [CREDITS.md](CREDITS.md).
