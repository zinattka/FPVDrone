# Testing and bug reports — 0.1.40

Target: Fallout 4 1.10.163 x64, F4SE 0.6.23, Garden of Eden 23.4+;
MCM 1.39 Old-Gen for controller setup. Use a separate test save and fully restart
the game after updating binaries or scripts.

## Confirmed in game

- The user confirmed the previously failing launch with Fallout 4's global
  gamepad controls in the main setup.
- In the lightweight setup, issuing/equipping the real consumable enabled the
  Pip-Boy and FPV sequence. The earlier failure used the service prop.

The correct consumable is `FPVDroneWeapon`, local FormID `00080E`.
`FPVDroneLaunchProp`, local `000807`, shares the name and mine animation but
does not launch FPV. Full FormIDs depend on load order; prefer Chemistry/Mines crafting.

## Automated checks

Run from the repository root:

```powershell
.\Tools\build_launch_transition.ps1 -GameRoot 'D:\Games\Fallout 4' -ZigPath 'D:\Tools\zig-0.13.0\zig.exe'
.\Tools\build_controllers.ps1 -ZigPath 'D:\Tools\zig-0.13.0\zig.exe'
```

The Papyrus suite executes the merged PEX against deterministic engine/MCM
stubs. It covers transition cleanup, operator pose, key/controller ownership,
throw payment, actual base animation-event names, delayed completion, stale
callbacks, device list coherence and configuration preservation. Structural
checks verify saved-state definitions, branch relocation and expected original
instructions. The official assembler analyzes the candidate PEX.

Native probes check device mapping, input math, configuration, expected hashes,
entry bytes and trampoline/IAT behavior. Hardware-independent tests do not
validate physical USB channels, rendering or in-game timing. See the output
from the current build for its results; do not treat an old report as a new run.

The core validation set contains 271 Papyrus/MCM checks and 120 controller
checks. The optional viewmodel has a separate set of 297 native assertions
and 41 binary/mesh/ABI checks. Those viewmodel results do not confirm rendering
in Fallout 4. The release-preparation report records the actual build results.

## Manual release checklist

1. Test global keyboard/mouse and global gamepad mode, each with drone MCM input set to keyboard/mouse and to the connected controller.
2. Launch from first/third person, standing and sneaking. Verify throw → Pip-Boy → blackout → FPV, then camera/stance restoration.
3. With stocks of 1 and 3, verify exactly one drone is consumed. Ordinary fire, a short bash and an interrupted gesture must not create a flight or duplicate item charge.
4. Test F10, mapped cancel/detonate, collision, signal loss, battery depletion, death and loading a save; repeat launches immediately after cleanup.
5. Test preconnected controller startup, hot-plug, unplug during flight, focus loss/return and pause/MCM. Verify no silent fallback to another device.
6. Check all axes, inversion, dead zone/rates, button edges and direct throttle returning to 50% at center. Confirm saved manual assignments survive restart.
7. Test furniture, Power Armor and camera/Pip-Boy/animation mods separately; their full matrix remains unverified.

The optional experimental viewmodel needs its own visual/game test and does
not change the status of core-flight validation.

## Reporting an issue

Include the mod version, exact game/F4SE/dependency versions, steps to reproduce,
global game input mode, drone MCM input choice, camera/stance, inventory count
and relevant mod/load order. State whether it reproduces in a lightweight profile.

Run **MCM → Diagnostics** or `cqf FPVDroneQuest Diagnose` after the attempt.
Useful files under `Data` (usually MO2 `overwrite`) are:

- `F4SE/FPVDrone.launch.ini` — stages and throw/payment snapshots.
- `F4SE/Plugins/FPVDroneNative.log` — native flight/camera state.
- `F4SE/Plugins/FPVDroneController.log` — controller polling and cancellation.
- `F4SE/FPVDrone.controllers.ini` — device inventory and bridge readiness.
- `F4SE/FPVDrone.runtime.ini.ini` — manual diagnostic report.
- Crash log and Papyrus log, when available.

`Spend.Gate` and `Spend.Events` preserve payment conditions and the last eight
Papyrus animation events before reset. Throw/Spend sections record the last
failure and may remain after a later success: check build, token and time.

Emergency return: `cqf FPVDroneQuest AbortFlight`.
