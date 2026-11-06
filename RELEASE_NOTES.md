# FPV Drone 0.1.40 — release notes

This core package retains the confirmed 0.1.40 launch behavior.

- Consumable drone launch: mine throw → Pip-Boy → blackout → ready FPV camera.
- Operator Pip-Boy pose and restoration of camera/controls on cleanup.
- MCM selection of keyboard/mouse, XInput gamepad or DirectInput USB radio.
- Automatic Xbox/DualShock 4 layouts and manual axis/button configuration.
- Direct stick throttle: 0% down, 50% center, 100% up; keyboard W/S retain their level.
- Corrected gamepad-mode launch confirmation using the events Papyrus receives.
- Scoped cancellation, exact one-item payment checks and launch diagnostics.

## Compatibility

Fallout 4 1.10.163 x64, F4SE 0.6.23, Garden of Eden 23.4+.
MCM 1.39 Old-Gen is required for controller configuration. DLC is not required.
Next-Gen and VR are unsupported. Install dependencies separately.

## Validation

The user confirmed launch with global gamepad controls in the main setup and
Pip-Boy/FPV launch in the lightweight setup after selecting the correct item.
These confirmations do not establish every pose, device, mod combination or
complete long-session stability. Current automated results and the manual
checklist are documented in [TESTING.md](TESTING.md).

The core package retains the original flight DLL version 128 and controller
bridge version 136. The separate experimental 3D viewmodel runtime 4 is not part
of the confirmed core-launch result; its rendering remains unverified in game.

## Release assets

- `FPVDrone-0.1.40.zip` — installable core mod.
- `FPVDrone-Viewmodel-0.1.40-experimental.zip` — optional add-on installed after the core.
- `FPVDrone-0.1.40-source.zip` — curated source snapshot.

The core archive omits the experimental DLL and private viewmodel mesh.
Obsolete flat-visual prototype files, build caches, local logs and toolchains
are excluded from the prepared repository and release packages.

Code uses the MIT License, copyright 2026 FPV Drone contributors. The credited
model/texture adaptations retain their separate CC BY 4.0 license.

## Updating

End flight and close Fallout 4 before replacing files. Install the complete
runtime archive, retain `FPVDrone.esp` activation and launch through F4SE.
Existing controller assignments are preserved. Confirm the selected device and
axis directions before the next flight.

For console testing, use the consumable `xx00080E`, not service prop `xx000807`.
Both items have the displayed name FPV Drone; `xx` is the current load-order prefix.
