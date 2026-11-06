# FPV Drone 0.1.40

A consumable FPV drone for Fallout 4. Throw the selected drone, raise the
Pip-Boy, then enter the drone camera for manual flight and detonation.
Keyboard/mouse, XInput gamepads and DirectInput USB joystick controllers are supported.

[Русский](README_RU.md) · [Building](BUILDING.md) · [Testing and bug reports](TESTING.md)

## Requirements

- Fallout 4 **1.10.163**, Windows x64. Next-Gen and VR are unsupported; DLC is not required.
- [F4SE 0.6.23](https://f4se.silverlock.org/), including its scripts.
- [Garden of Eden Papyrus Script Extender 23.4+](https://www.nexusmods.com/fallout4/mods/74160), the main DLL/scripts package. Legacy 19.7 is unsuitable.
- [Mod Configuration Menu 1.39 for Old-Gen](https://www.nexusmods.com/fallout4/mods/21497) for controller selection and configuration. Keyboard/mouse flight with default sensitivity is available without MCM.

Install dependencies separately. The core mod does not require Address Library,
HUDFramework, FallUI or MCM Helper.

## Installation and first flight

Use `FPVDrone-0.1.40.zip` from the release assets. It contains the runnable mod;
do not copy the entire GitHub source tree into `Data`.

1. Close Fallout 4 and install the core archive using MO2 or Vortex. For a manual install, put its contents in `Data`.
2. Enable `FPVDrone.esp` and launch through F4SE. With MO2, launch F4SE through MO2.
3. Craft **FPV Drone** at a Chemistry station under **Mines** and equip it in the grenade slot.
4. Hold and release the game's grenade control. The sequence is throw → Pip-Boy → blackout → FPV.

The opening temporarily uses first person; cleanup restores the original view
and controls. Each completed throw spends one drone. Cancellation after release,
signal loss or ending flight does not refund the item.

Recipe: Aluminum ×3, Circuitry ×2, Copper ×2, Adhesive ×1, Fertilizer ×2, Oil ×1.
No perk is required.

## Controls

| Input | Action |
| --- | --- |
| Assigned grenade control | Launch the equipped drone |
| W / S | Increase / decrease throttle |
| A / D | Yaw |
| Mouse | Roll and pitch |
| Left mouse button | Detonate |
| F10 | Cancel without detonation |

Keyboard throttle retains its level when the key is released. There is no
automatic levelling. The HUD shows speed, throttle, hover reference, signal and distance.
Sensitivity is adjustable in MCM.

### Gamepads and FPV radios

1. Connect the device and open **MCM → FPV Drone → flight input device**.
2. Refresh the list and select the device. This controls drone flight independently of the game's global input mode.
3. Use the automatic layout for Xbox/XInput or DualShock 4. For another USB radio/controller, choose manual layout and assign axes, inversion, dead zone and buttons.
4. Default throttle follows the stick: down 0%, center 50%, up 100%. The optional accumulated-throttle mode remains available. Settings apply to the next flight.

Mode 2 uses the left stick for throttle/yaw and the right for roll/pitch.
MCM button numbers start at 1; 0 disables an action. Xbox defaults are A for
detonation and B for cancellation. F10 remains an emergency cancel key.
Mouse detonation is suppressed during controller flight.

The radio must expose a Windows XInput or DirectInput joystick. The mod does
not silently select another device when the saved one is missing. Disconnecting
the selected controller ends flight without detonation. Hot-plug after loading is supported.

## Scope and limitations

Core launch has been confirmed in the main and lightweight game setups.
Global gamepad-mode launch was also confirmed in the main setup. The full compatibility matrix for
camera, Pip-Boy and animation mods, furniture and Power Armor remains unverified.
Drone and operator share the loaded world area; zero signal ends flight.

The optional `FPVDrone-Viewmodel-0.1.40-experimental.zip` installs over the core
mod. Runtime 4 rendering still requires an in-game test. The core archive omits
`FPVDroneViewmodel.dll` and `drone_fpv.nif` and works without this add-on.

## Throw animation but no Pip-Boy

Use the consumable `FPVDroneWeapon`, FormID `xx00080E`. Legacy service item
`FPVDroneLaunchProp`, `xx000807`, has the same displayed name and mine animation
but cannot launch FPV. The prefix depends on load order. Chemistry crafting produces the correct item.

Diagnostics: **MCM → Diagnostics** or `cqf FPVDroneQuest Diagnose`.
Emergency camera return: `cqf FPVDroneQuest AbortFlight`.
See [TESTING.md](TESTING.md) for logs and report details.

To uninstall: finish flight, run `cqf FPVDroneQuest Shutdown`, save, exit, then
disable the mod. To enable it again in that save: `cqf FPVDroneQuest EnableMod`.

Code is provided under the [MIT License](LICENSE). The model and its texture
adaptations retain separate CC BY 4.0 attribution. Asset origins and authors:
[CREDITS.md](CREDITS.md).
