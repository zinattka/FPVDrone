# FPVDroneController — 0.1.36

This is the source of the separate controller-input F4SE plugin, version **136**.
It targets **Fallout 4 1.10.163 x64 / F4SE 0.6.23**. The original flight plugin
was recovered from its release binary; it is not rebuilt or replaced here.

The bridge accepts only FPVDroneNative.dll 0.1.28 with SHA-256
`5ae7afd93592faa14494ce22f4f9491e2e57d6bc2ce22696ba77948b6a5af6c9`.
It checks the file hash and integrator entry bytes before installing its runtime
hooks. Unsupported runtimes are rejected; a missing or incompatible native
plugin leaves the bridge unavailable rather than applying guessed offsets.

## Files

- `controller_devices.h/.cpp`: Windows XInput and DirectInput 8 enumeration,
  explicit device selection and normalized polling.
- `controller_math.h`: recovered input/state layout, axis normalization, dead
  zone, throttle mapping and controller angular-rate multipliers.
- `controller_bridge.cpp`: F4SE entry points, worker, configuration and device
  cache, per-flight input snapshot, scoped native hooks and button handling.
- `device_probe.cpp`: standalone enumeration and hardware-independent mapping
  checks; it does not load Fallout 4 or install hooks.
- `bridge_probe.cpp`: input/configuration and hook-installation checks against
  a mapped original DLL, without executing its DllMain or game code.

## Build and automated checks

From the mod root in PowerShell:

```powershell
# Complete Papyrus/ESP/native build and checks, without installing:
.\Tools\build_launch_transition.ps1
# Run the same checks, then install the quest, ESP and new controller DLL:
.\Tools\build_launch_transition.ps1 -Install
# Build and check the controller DLL on its own:
.\Tools\build_controllers.ps1
```

The native build requires local **Zig 0.13.0**. Its default location is
`_build/toolchain/zig-windows-x86_64-0.13.0/zig.exe`. Pass
`-ZigPath 'C:\Tools\zig-0.13.0\zig.exe'` to either build script for another
location. The complete build also needs Node.js on PATH, the official Papyrus
compiler/assembler, base sources and Fallout4.esm; use
`-GameRoot 'D:\Your Fallout 4'` for another game directory. Neither script
downloads a compiler. Close Fallout 4 before using `-Install`.

Native output and `test_report.json` are under `_build/controllers`. The build
runs both probes and records current Windows inventory. The hook test checks
the original hash/prologue, trampoline and scoped IAT replacement after mapping
the original DLL with `DONT_RESOLVE_DLL_REFERENCES`; it does not start Fallout 4
or execute the recovered flight code. The DLL is compiled with warnings treated
as errors. A successful build is not a hardware flight test.

The device manager is owned by one worker thread. DirectInput uses foreground,
nonexclusive acquisition and the module handle of the controller DLL itself,
resolved from an address in the module. The standalone probes resolve their own
EXE instead, following the module-handle contract in
[DirectInput8Create](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee416756(v=vs.85)).
Failed polls clear the sample. A GUID absent from the inventory is
disconnected; a present GUID that cannot yet be opened is unavailable, with the
HRESULT retained for diagnostics. Selection never falls
back to another controller: DirectInput IDs use instance GUIDs, while XInput IDs
refer to Windows slots 0–3 (displayed as #1–4), not unique physical gamepads.
XInput interfaces are filtered from DirectInput enumeration to avoid duplicates.

Axes are X, Y, Z, Rx, Ry, Rz, Slider 0 and Slider 1, normalized to [-1,1]; positive
Y points down. XInput maps the left stick to X/Y, left trigger to Z, right stick
to Rx/Ry and right trigger to Rz. DirectInput retains the device's channel order.
Enumeration also publishes a layout hint: `xinput`, `dualshock4` or `manual`.
Known Sony VID 054C products 05C4, 09CC and 0BA0 use the DS4 hint. This is metadata,
not a hidden raw-axis remap. DS4 exposes right-stick X/Y on Z/Rz, while Rx/Ry are
its triggers. Papyrus applies the automatic layout to the real MCM axis settings
so that displayed selections match the native configuration. Unknown DirectInput
devices retain manual channel assignment. The reported device is Sony 054C:09CC;
see the [SDL DirectInput mapping](https://raw.githubusercontent.com/libsdl-org/SDL/release-2.0.10/src/joystick/SDL_gamecontrollerdb.h)
for the DS4 right-stick/trigger channel distinction.
Button numbers shown in MCM are one-based, with 0 disabling a binding. Xbox order
is A, B, X, Y, LB, RB, Back, Start, left-stick click, right-stick click, and D-pad
up/down/left/right. DirectInput retains device button order, up to 128 buttons.

## Runtime integration

F4SEPlugin_Load registers the listener and publishes a waiting, keyboard-only
cache. It creates no controller worker and performs no DirectInput/XInput
initialization or native patching. A successful PostLoadGame (message 3) or
NewGame (message 8) starts the bridge once. This keeps polling out of the initial
startup/main-menu path. The worker retains periodic inventory refresh and
hot-plug support after entering a game. Runtime 136 is built from source; the
0.1.35 pin to the old runtime 133 is removed.

The validated bridge then intercepts the original physics-step entry. It
supplies normalized analog roll/pitch/yaw, updates continuous throttle,
and passes a local copy of the rate settings to the original integrator. The
original integrator continues to handle flight. There is no operating-system
keyboard/mouse event injection and no controller vibration or global calibration
change.

A separate IAT hook is scoped to FPVDroneNative's GetAsyncKeyState calls. In
controller mode it supplies mapped detonation/abort edges and disconnect aborts;
physical F10 remains available, and physical left mouse is ignored for detonation.
Keyboard/mouse mode passes the native input through. Buttons held at launch or
used in pause menus must be released before becoming a new flight command.
The quest also guards its original Papyrus OnKeyDown(256) path, which otherwise
bypasses the native IAT hook and calls Detonate directly. That guard snapshots
the input mode and generation before starting native flight. Reveal does not
clear it; flight completion/load recovery does. Collision and other genuine
flight-ending paths remain active. The controller affects drone flight only;
the game can continue to use keyboard/mouse without changing a global setting.

The selected device and all controller settings are snapshotted at flight start.
MCM changes apply to the next flight. A confirmed missing device, invalid axis
profile or persistently unavailable input cancels without an explosion. Losing
focus supplies neutral rotation while holding throttle instead of inventing a
disconnect. Before the first valid sample, a bounded one-second grace period
allows acquisition to finish; it never masks F10, the controller abort button or
invalid axis assignments. Once valid input has been received, confirmed loss
uses the normal safe-abort path. Readiness, poll HRESULT changes and input-abort
reasons are written to the controller log/cache.

## MCM and files

MCM settings are stored in `Data/MCM/Settings/FPVDrone.ini`, under `[Controllers]`.
The shipped defaults live in `MCM/Config/FPVDrone/settings.ini`. Without a loaded
MCM plugin, effective input is keyboard/mouse even if an older saved controller
selection exists.

- `sSelectedDevice` is the native ID; `sSelectedDeviceName` is its saved label.
  `iDeviceChoice` is only the current menu index.
- `iControllerLayout=0` enables automatic Xbox/DS4 layouts; `1` keeps manual
  assignments for FPV radios and other controllers. `sAppliedControllerLayout`
  records the applied device/layout so ordinary refreshes do not overwrite
  assignments. Existing custom channels are retained as manual on migration.
  Manual axis/inversion/throttle-mode changes select manual layout. The MCM
  apply-layout button can reapply automatic assignments when automatic mode is
  selected. Buttons, dead zone and rates are separate and are never reset by it.
- Axis values 0–7 select the channels above. Four inversion switches are separate.
- `fDeadZone` is 0–30 **percent**, default 5. Absolute throttle bypasses dead zone.
- `iThrottleMode=1` is the default and maps the whole axis directly to 0–100%
  throttle: down 0%, center 50%, up 100% with the default inversion. Releasing
  the stick to center restores 50%; neither the previous throttle nor frame
  duration accumulates a change. Author defaults and automatic Xbox/DS4 layouts
  use 1. The native emergency fallback remains 0 when the author
  defaults file is missing. Mode 0 is an optional centered-stick rate control, integrating
  throttle at up to 0.75 per second. Keyboard input remains native passthrough.
- `fYawRate`, `fRollRate`, `fPitchRate` are 10–300 **percent**, default 100.
- `iDetonateButton` and `iAbortButton` are 0–128; defaults are 1 and 2.

The worker publishes `Data/F4SE/FPVDrone.controllers.ini` through a temporary file
and replacement. `[Bridge] Ready` describes whether the validated hooks are
installed; `[Devices]` contains a versioned list, including keyboard at index 0.
Each device's `LayoutN` belongs to the same versioned ID/name snapshot.
Papyrus requests a scan through a separate
`Data/F4SE/FPVDrone.controllers.request.ini`, then reads the coherent cache. MCM
uses real Papyrus string-array/string properties for the list and status.
Do not ship generated device caches or one machine's saved MCM preferences as
author defaults.

Log: `Data/F4SE/Plugins/FPVDroneController.log` (normally MO2 overwrite). Fully
restart Fallout 4 after changing the DLL. See [../../TESTING.md](../../TESTING.md)
for hardware and in-game scenarios. The user confirmed 0.1.33 works. The new
0.1.36 startup/acquisition changes still need a physical-controller game test.
Standalone checks cannot establish that a particular radio's
USB channels are correctly assigned.
