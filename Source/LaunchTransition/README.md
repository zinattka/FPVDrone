# Launch transition, operator pose and controller menu fragment — 0.1.40

`FPVDroneQuestScript.psc` is **not the complete original controller**. The original
source was lost. This fragment is compiled with the official Fallout 4 Papyrus
compiler, then its `FPVTransition*` functions and state variables are merged into
the preserved 0.1.28 controller bytecode. Do not install the fragment's compiled
PEX on its own: the fragment contains compile-time stubs for old functions.

`FPVDroneNative.psc` declares only the two native functions needed to compile this
fragment. `MCM.psc`, `F4SE.psc` and `GardenOfEden2.psc` are also compile-time
declarations. None is a replacement for a dependency's shipped PEX or DLL.

From the mod root in PowerShell:

```powershell
.\Tools\build_launch_transition.ps1
# After compile, structural/official analysis and behavioral checks:
.\Tools\build_launch_transition.ps1 -Install
# Papyrus-only update, preserving the installed controller DLL:
.\Tools\build_launch_transition.ps1 -KeepControllerRuntime -Install
```

Use `-GameRoot 'D:\Your Fallout 4'` for another installation. Node.js must be on
PATH; the official compiler/assembler and base Papyrus sources must be installed.
The complete build now also builds/checks FPVDroneController.dll using local
Zig 0.13.0; its default path is
`_build/toolchain/zig-windows-x86_64-0.13.0/zig.exe`. Use `-ZigPath` for another
local installation. See [../Controllers/README.md](../Controllers/README.md)
for the standalone native build.
Close Fallout 4 before installing the result. Build output is under
`_build/launch_transition`; the unmodified original PEX and ESP are under
`Source/Legacy/0.1.28`. Their hashes are listed in
`Tests/Fixtures/FILE_MANIFEST.sha256` using repository-relative paths.

The merger checks the original SHA-256, preserves all existing saved variables,
properties and unrelated functions, and relocates relative branches at hook
points. It also builds two private IDLE records into the preserved 0.1.28 ESP;
all original non-header records stay byte-identical. The build reads the
installed Fallout4.esm to resolve the vanilla idle clips. The original 0.1.28 DLL
remains byte-identical. The separate controller bridge feeds analog input to
that DLL at runtime; see [../Controllers/README.md](../Controllers/README.md).

Sequence: completed/paid mine throw → save view → first-person vanilla
`pipboyOpen` IDLE 00022D05 (`g_pipboyOpen`, pipboyUp.hkx, 0.8667 s) → completion
event and minimum clip duration → 0.12 s fade to held black → lower/close Pip-Boy
under black → original FPV setup → reveal after running status and two native
frame callbacks. Closing IDLE: 00022CF8. A missing/rejected animation or timeout
aborts preparation; it does not silently skip the requested animation.

The operator's third-person body gets a separate, continuously looping pose
after mode=2, before the FPV screen is revealed. Private local forms 810/811
reuse vanilla IdlePipboyExamineMale/Female (001C776B/001C776C), with the event
`dyn_ActivationAllowMovement` and looping seconds 255/255. The MTBehavior graph
selects its standing/sneak branch using iIsInSneak; the crouched branch combines
UpperBodyFeatheredSpine with LowerBodyFeatheredSpine/SneakIdle. No sneak setter,
forced stand, furniture entry or graph replacement is used. `pipboyUp` and the
single-bone PipboyOffset asset are deliberately not treated as a body pose.

Pose ownership is separate from the short visual transition, so Reset on Reveal
does not lower the operator's arms. Cleanup and load recovery stop the owned
idle with vanilla IdleStop 000E9855 (graph idleStop fallback), before camera
restoration. Dead/unloaded bodies are not forced into a replacement idle. No
timer restarts the animation; the idle itself loops until explicitly stopped.

Opening waits at most 2.5 s. Native readiness waits at most 10 s, while ordinary
flight timers also remain active. Cleanup lowers the Pip-Boy before restoring
the player view, then releases this transition's input layer and fade. Load
recovery releases persisted transition resources after original camera recovery.
Fallout 4's keyboard event IDs match the VK-style values in the official F4SE
[CustomControlMap](https://github.com/ianpatt/f4se/blob/master/CustomControlMap.txt):
W/S/A/D=87/83/65/68; F10=121. Hooks_Input passes the keyboard keyMask unchanged.
The 0.1.29/0.1.30 conversion to 68 was incorrect and made D cancel a flight.
On registration, 0.1.31 migrates an erroneous AbortKey=68 back to 121 and removes
the stale saved D registration. Native input and custom safe bindings are retained.

Automated checks exercise compiled bytecode with simulated engine calls; they
cannot prove animation rendering, camera timing, furniture or power armor
behavior in Fallout 4. Follow TESTING.md for live validation.

0.1.37 adds `FPVTransitionThrowRejected` only on negative ArmWeaponThrow returns
and cancelled FinishWeaponThrow branches. Captured Arm locals identify the
selected/expected weapon, inventory count and interaction without re-reading
equipment. Calls follow existing resets; accepted arming/completion performs no
added diagnostic I/O. The `Throw` section in FPVDrone.launch.ini is the last
rejection, with epoch/time, not a successful-throw history. Compiled tests strip
the diagnostic calls and verify every original instruction and branch against
0.1.36; SpendWeaponThrow remains bytecode-identical. Controller runtime 136 is
retained for this diagnostic update. The lightweight-profile failure still
requires an in-game attempt to capture its exact rejection.

0.1.38 adds a timer-10 fallback for **Fallout 4's global gamepad mode**, not the
MCM flight-device setting. The original [F4SE 0.6.23 input hook](https://raw.githubusercontent.com/ianpatt/f4se/v0.6.23/f4se/Hooks_Input.cpp)
rejects unknown gamepad masks before sending even OnControlDown/Up. This is a
plausible explanation of the observed keyboard-success/gamepad-failure split;
the controller's actual ButtonEvent mask has not been traced.

The watcher requires two quiet bIsThrowing=false samples outside interactions
before arming on a new active state. It uses the original Arm, preserves item
and stock checks, and consumes the edge before native calls. Reset invalidates
quiet/ownership before CancelTimer; a cancelled or failed still-active gesture
cannot be armed repeatedly. Shutdown/load stop the old chain, and input
configuration restarts it with a new watch epoch. Polling uses 0.05 s in idle
gamepad mode and 0.25 s during flight or keyboard mode.

0.1.39 fixes the engine-paid-only restriction introduced in 0.1.38: the user's
failed gamepad throw leaves inventory unchanged. Two matching quiet snapshots
now capture the equipped FPV drone and stock N. A second bIsThrowing=false read
prevents publication of an active/post-release read as a quiet baseline. A new
edge transfers that snapshot to one pending owner. ResolveWatchBaseline runs
before Arm's existing token/menu checks; only actual N or N-1 with matching
identity can restore the PRE-throw stock. Last paid item zero/auto-equip is
accepted only from the trusted positive pre-count.

0.1.40 corrects the interpretation of the clip audit: text `weaponFire.2` in
an HKX annotation is NOT proof that Papyrus receives that literal event name.
The installed 1.10.163 parser (VA 1417055B4–1417056C8) splits at the dot when
only the base event exists in the graph, producing tag `weaponFire` and string
payload `2`. OnAnimationEvent only exposes the name. This also matches the
[separate native tag/payload fields](https://raw.githubusercontent.com/libxse/commonlibf4/main/include/RE/B/BSAnimationGraphEvent.h)
and the mod author's [annotation-format description](https://www.nexusmods.com/fallout4/articles/6689).
The previous literal-only proof was therefore incorrect.

The watcher now records the owned base weaponFire followed by its independent
throwEnd trigger. Pending proof is bound to source/source+1; committed proof
requires the current throw token. End before Fire, another actor or an old
owner cannot authorize manual payment. Vanilla first-person mine behavior
triggers throwEnd at clip end−0.2 s, third-person at end−0.76667 s; it is present
in the behavior graph rather than in the animation annotation array. The
normal completed-animation and quiet-sample checks still follow these events.

Spend accepts engine-paid N-1 without extra removal. Watcher manual payment at
unchanged N requires the committed pre-count and its owned Fire→End proof;
weaponFire alone cannot authorize it. Missing unpaid release can be restored
with both events after the animation ends, followed by the original quiet checks
and RemoveItem(1)/final-count verification. Pending arming still blocks manual
payment. Proof commit is restricted to sourceToken+1; a delayed normal Down
keeps that gesture's baseline. Cancelled/stale callbacks cannot lend their proof
to a later normal throw. Finish/Spend recheck tokens after new helpers.
Queued completion waits on timer8 with the original poll bound; engine-paid
decrements, interactions, pending cancellation and primary interruption do not
wait. Tests drive actual OnTimer callbacks and require an emitted timer to
continue; missing End safely rejects rather than leaving an armed gesture.

The eight-event memory ring records exact Papyrus names and state without native
calls or file writes on the event path. Spend captures the gate and ring in two
local Strings before its current-token guard and reset. The separate Spend
diagnostic section writes those captured strings and its local Int baseline
after failure cleanup. A later callback cannot replace the failure's snapshot.

Identity resolution uses GetEquippedWeapon(2) normally. Only None in gamepad
mode permits the additional exact-form IsEquipped(droneWeapon) check; another
weapon is never replaced during normal resolution. The trusted last-paid-drone
case is handled separately by ResolveWatchBaseline. The native controller DLL
remains 136. On 2026-11-05 the user confirmed the previously failing global-gamepad
launch works in 0.1.40. Additional combinations remain listed in TESTING.md.

Controller menu helpers register MCM's menu-open event and expose the real
`String[] FPVTransitionControllerDevices` and string status properties. A refresh
asks the bridge to rescan through a separate request INI, reads a coherent
versioned snapshot, then publishes paired names/IDs/layout hints. The selected ID is mapped
back to its current list index. An absent saved ID becomes a disconnected entry
without changing the selection. Refresh epochs prevent an older latent refresh
from publishing after shutdown or a newer request.

Automatic layout writes the actual axis/inversion/throttle-mode MCM settings
for known Xbox or DualShock 4 devices. DS4 uses Y/X/Z/Rz for
throttle/yaw/roll/pitch; Xbox uses Y/X/Rx/Ry. An applied-layout stamp avoids
reapplying it at every menu refresh. Existing custom assignments migrate to
manual, and manual edits stay manual. The explicit apply-layout action can
restore a known automatic layout; buttons, dead zone and rates are preserved.
Automatic Xbox/DS4 layouts select direct throttle (mode 1): down 0%, center 50%,
up 100%. The migration check accepts the old and new default throttle modes so
the changed default does not turn a fresh automatic layout into a manual one.
Refreshing an existing applied layout keeps its axes; author default mode 1 is
used when no throttle override was saved. Explicit saved mode 0 can be switched
to direct throttle in MCM. Keyboard W/S behavior is unchanged.

`FPVTransitionCaptureController` snapshots controller input ownership and the
current generation immediately before the original native Start call. The
legacy OnKeyDown(256) branch is suppressed only for that controller flight,
after the F10 handling. This closes the Papyrus Detonate path that bypassed the
native mouse hook. Changing MCM selection midflight does not change this guard.
The snapshot is independent of visual Reset/Reveal and is cleared by flight
completion, load recovery or idle abort. Genuine impact/native detonation paths
and keyboard-mode mouse detonation are preserved.

MCM handles display and persistence. The bridge reads the chosen stable ID and
axis profile from MCM's settings INI; the Papyrus fragment does not synthesize
input, poll axes or move the drone. Missing MCM or bridge support leaves
keyboard/mouse available. The merge preserves the original properties and adds
only the two prefixed menu properties.

Launch diagnostics do not depend on Debug.Trace or enabled Papyrus logging.
`FPVTransitionBeginDiagnostics` resets the per-launch notification flag and old
abort/finish values. Hooks in RecordStatus, AbortWithReason and FinishFlight
write `Data/F4SE/FPVDrone.launch.ini`, section `Latest`: Stage, Context,
AbortReason, FinishReason and Native (status/frames). Finish diagnostics run
after the original mode=3 cleanup guard and before native stop. A recorded abort
reason survives finish cleanup. Launch aborts notify once; a non-explosive exit
under blackout also notifies if no earlier abort message was shown. Ordinary
visible flight completion does not add that launch-cancellation notification.
These records expose the actual next failure; they do not establish which
timeout caused the previously reported approximately five-second black screen.
