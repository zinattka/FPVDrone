# Changes

## FPV 3D runtime 3 — renderer visibility and scene diagnostics

- Runtime-2 live logs confirm NIF load and scene attachment, despite the user
  still seeing no hardware. The model-name fix worked; visibility remains open.
- Match the engine's scene-change notification when changing app-cull state;
  mark attachment/detachment changes for the renderer. The previous raw flag
  writes omitted ancestor bit29 notification.
- Prefer ShadowSceneNode/WorldRoot over actor-owned intermediate branches.
  Ignore ordinary distance fade only for the private model.
- Record the ancestor chain and two bounded render snapshots per attachment,
  including flags/fade, per-part scale, depth, projection and bound radius.

250 native and 36 binary/mesh/ABI assertions pass. Rendering of runtime 3
has not yet been confirmed in-game; loading/attachment alone is not proof.

## FPV 3D runtime 2 — decode engine node names correctly

- Correct NiObjectNET names from raw C-string interpretation to the actual
  F4SE 0.6.23 BSFixedString/StringCache::Entry layout. Decode inline text and
  bounded external references; reject wide, cyclic and unreadable entries.
- Replace the probe's incorrect raw-string node-name fixtures with real cache
  entry headers. Add inline/external/error regression cases.
- Split model rejection diagnostics into loader result, decoded root/child
  names, child count and parent-link checks. Runtime version/log marker is 2.

The user observed no 3D hardware. The live log confirmed plugin installation
and the combined model-load/structure rejection; the cached-name bug would
reject a loaded model. 239 native and 36 binary/mesh/ABI assertions pass.
The revised runtime still requires a complete restart and in-game retest.

## Unreleased 3D FPV viewmodel — original geometry and materials

- Replace the flat vector hardware overlay with five actual NIF parts from
  the installed drone mesh: two motor housings, two props and RPG charge.
  Retain all 3,324 selected triangles, original UVs/normals and BGSM/DDS maps.
- Add FPVDroneViewmodel.dll for the pinned 1.10.163/native-128 runtime. It
  follows the optical camera independently of actor orientation/scale,
  counterrotates the props with throttle and uses scene material lighting.
- Hide on pause/exit, detach on the game thread and protect rapid relaunch
  from stale cleanup. The existing native HUD/bar/interference layer remains.
- Restore the empty overlay host to remove duplicate flat hardware. Flight
  and controller DLL files, ESP, Papyrus and original meshes/textures are unchanged.

The user confirmed the vector build was visible but wanted game-model quality.
231 native assertions and 36 independent binary/mesh/ABI assertions pass;
the revised 3D rendering still needs an in-game test after a full restart.
Build and rollback: `Source/Viewmodel/README.md`.

## Unreleased visual prototype — FPV camera hardware

- Add shaded front propellers/motor housings at the sides of the FPV image
  and the RPG nose below the centre, using the credited source model.
- Supply an opposite-direction, blurred 24-frame propeller cycle in the SWF;
  no existing model animation is required. Animation is independent of throttle.
- Attach beneath the native signal veil/noise/OSD, inheriting the existing
  4:3 view transform and panel visibility. The native canvas path is retained.
- Change only the runtime overlay SWF. DLLs, ESP, scripts and NIFs are unchanged.

The first embedded-bitmap version passed Ruffle but the user observed a green
rectangle over the lower FPV image in Fallout 4. Replace all bitmap resources
with solid RGBA vector contours derived from the same model renders. The
precise engine image failure remains untraced; the revised SWF has no bitmap
or external texture dependency. 951 structural/raster assertions and five
actual AVM2 playback hosts pass in Ruffle 0.7.1. The vector correction still
requires an in-game retest.
See `Source/Visuals/README.md` for build, limitations and rollback.

## 0.1.40 — use the animation events Papyrus actually receives

- Correct the 0.1.39 release-proof assumption. The installed Fallout 4
  annotation parser splits `weaponFire.2` into event tag `weaponFire` and string
  payload `2` when the behavior graph contains only the base event. Papyrus
  OnAnimationEvent exposes the tag, not that payload. Waiting for the literal
  `.2` tag therefore denied watcher manual payment despite correct equipment
  and unchanged inventory. The latest failed Spend recorded baseline=13,
  stock=13, paidByEngine=false and payHere=false.
- Watcher manual payment now requires its owned `weaponFire` followed by the
  independent `throwEnd` trigger, trusted pre-throw inventory and the ordinary
  completed-animation/quiet checks. A fire event alone cannot authorize it.
  Literal `.2` remains accepted for compatibility, but is not required.
- Wait for queued completion on the original timer chain, bounded by the
  original poll limit. Interactions, pending cancellation and primary attack
  do not wait. Engine-paid N-1 still bypasses manual payment and does not
  require a second removal.
- Add an eight-event memory ring and a pre-reset manual-gate snapshot. No
  engine calls or file writes are added to the event trace. Failed Spend saves
  captured Gate/Events strings after Reset, so the rejection remains readable.
- Correct the test input model: HKX annotations are separated into tag/payload
  before dispatching the Papyrus fixture. Exercise real base-fire/end events,
  actual scheduled timer callbacks, cancellation and stale diagnostic data.

271 checks pass (178 launch/throw/pose and 93 MCM/diagnostics); the official PEX
analyzer reports zero errors/warnings. DLLs 136/128 and ESP are unchanged.
On 2026-11-05 the user confirmed that the previously failing launch with
Fallout 4's global gamepad controls works in 0.1.40. The previous synthetic
literal-event tests did not establish actual engine delivery; the updated
fixtures model the base event separately from its payload.

## 0.1.39 — pay for completed gamepad throws when the engine does not

- Fix the 0.1.38 watcher payment restriction. The user reports unchanged drone
  inventory after failed gamepad attempts, and the fresh log records an
  inventory-settlement rejection. An unchanged count must allow the original
  one-item script payment after a confirmed throw, rather than requiring an
  engine-paid decrement for every watcher launch.
- Capture a trusted equipped-drone/count baseline in two matching quiet
  samples, with a second bIsThrowing check before publication. Bind it to the
  pending throw and accept only current count N or N-1. Arm retains this PRE-
  throw baseline even if the first active observation follows engine payment,
  including the last already-consumed drone and auto-selected next grenade.
- Require the player's own weaponFire.2 event for watcher manual payment.
  Vanilla animation annotations confirm this event in mine/grenade throws,
  including first/third person, sneak and PowerArmor; ordinary player gun-fire
  clips do not use it. A generic weaponFire cannot authorize manual payment.
- Recover an unpaid release only with the current trusted baseline and that
  throw-specific proof. The original completed-animation/quiet, interaction,
  cancellation and final-inventory checks still apply. Engine-paid throws use
  no extra RemoveItem; unpaid completed throws use exactly one.
- Prevent stale pending proof from transferring to a later throw token and
  prevent overlapping pending owners. Capture payment failure inputs in a
  local before reset and persist them in the separate Spend diagnostic section.

The 0.1.38 regression and its failed payment branch are confirmed. This fix is
verified with compiled-bytecode scenarios; the physical-controller launch still
needs an in-game retest. Native controller runtime 136 and flight runtime 128
remain unchanged.

## 0.1.38 — launch while Fallout 4 uses a gamepad

- Add an engine-state fallback for missing gamepad control events. After two
  idle samples outside interactions, a new bIsThrowing transition can arm the
  existing throw pipeline without OnControlDown. It uses Fallout 4's global
  Game.UsingGamepad state, independently of the drone input choice in MCM.
- Recover a missing release only for an already started/completed throw with
  an exact engine-paid one-drone inventory decrement and current throw token.
  Keep the ordinary menu cancellation, settling and launch checks.
- Watcher-owned throws require engine payment; disable manual charging for
  their epoch, including the pending-arm window. A delayed normal button event
  cannot replace that gesture's inventory baseline. Late polling may safely
  reject a throw; it cannot charge a second drone.
- In gamepad mode only, a missing grenade-slot weapon can be confirmed with
  Actor.IsEquipped(droneWeapon). A different nonempty weapon is still rejected.
- Stop/restart the watcher on shutdown/load/input configuration; invalidate its
  gesture state before Reset's native timer cancellation. Recheck throw tokens
  after new helpers before modifying completion/payment state.

The user confirmed 0.1.37 launches with global keyboard/mouse controls, but global
gamepad mode fails with either drone input choice. A fresh retest produced a
keyboard flight and no new Arm rejection for the preceding gamepad attempts.
F4SE 0.6.23 rejects unrecognized gamepad masks before dispatching control events;
this is a plausible explanation, not a captured trace of this controller's
button. This compatibility fix needs a physical-controller in-game retest.
Controller runtime 136 and the original native flight DLL remain unchanged.

## 0.1.37 — diagnostics before the Pip-Boy transition

- Record rejected throw entry in the `Throw` section of FPVDrone.launch.ini:
  equipped and expected weapon, captured inventory count, interaction state,
  animation/control origin, epoch and time. Distinguish the item checks from
  state changes during asynchronous calls.
- Explain silent throw-completion cancellations: missing release event,
  interaction before/after release, timeout and rejected inventory settlement.
  Log after the original reset; successful arming/completion has no added I/O.
- Preserve every original ArmWeaponThrow/FinishWeaponThrow instruction and
  relocated branch, including the original consumption transaction. Add 22
  compiled-bytecode checks; 184 Papyrus/MCM checks pass.
- Add `-KeepControllerRuntime` for Papyrus-only builds. This installed update
  retains controller runtime 136 and the original native flight DLL unchanged.

The lightweight profile performs a throw without raising the Pip-Boy. Its latest
log has no launch entry, so the failure occurs before the transition. The exact
rejection has not yet been captured; this is a diagnostic update, not a confirmed
fix for that failure. A complete restart and one new throw are needed.

## 0.1.36 — controller startup order and launch diagnostics

- Pass the controller DLL's own module handle to DirectInput8Create.
- Defer the worker, DirectInput/XInput initialization and native hooks until a
  successful save load or new game. Remove early startup polling and the 0.1.35
  reuse of runtime 133; build controller runtime 136.
- Distinguish a missing device from a temporary failure to open a present one.
  Allow up to one second for the first valid sample; a later confirmed loss
  still cancels safely without detonation or selection of another device.
- Log controller-open HRESULT values and native input-abort reasons. Persist
  launch stage and abort/finish reason in FPVDrone.launch.ini independently of
  Papyrus logging, and notify when launch is interrupted.

The user reports a crash only when the controller is attached before startup;
startup without it and connection after startup work. The wrong DirectInput
module handle and early initialization are confirmed code defects, but their
causal role in the crash still requires an in-game test. The first two logged
controller flights began with a disconnected sample; the exact reason for each
old black-screen cancellation was not recorded. Collision handling remains
enabled. Direct throttle, DS4/manual layouts, button bindings and ordinary
keyboard/mouse controls are retained.

## 0.1.35 — reuse validated controller runtime after startup failure

- Restore the exact controller DLL (version 133) confirmed working in 0.1.33.
  Reuse it in local builds only while all four native source files match that
  release and the DLL matches its recorded SHA256.
- Keep direct throttle through MCM author defaults and automatic layouts.
  Runtime 133 already implements absolute throttle, including center = 50%.
- Keep the 0.1.34 runtime and sources in a separate baseline for investigation.

The fresh crash log contains an access violation at 0x0000FFFF0E8B without a
stack trace. Its cause is not established; this is a targeted recovery and
requires another startup test with the user's game profile.

## 0.1.34 — direct controller throttle by default

- Make controller throttle follow stick position continuously: down 0%, center
  50%, up 100%. Returning to center restores 50% regardless of the previous level.
- Set author defaults, native fallback and automatic Xbox/DS4 layouts to the
  existing absolute mode (1). Preserve the old accumulated mode (0) as an
  explicit MCM option. Keyboard W/S retain their existing accumulated behavior.
- Preserve current axes, button bindings and sensitivity. Updating the user's
  current profile needs only a full restart because no throttle-mode override
  was saved; an explicitly saved old mode can be changed in MCM.

The user confirmed 0.1.33 works. Bridge version 134 retains the unchanged original
flight DLL 0.1.28; direct throttle still needs a physical-controller game test.

## 0.1.33 — DualShock 4 axes and controller-flight mouse isolation

- Identify known Sony DualShock 4 DirectInput products separately from XInput.
  Add automatic/manual axis layout selection in MCM and an apply-layout button.
  Automatic Mode 2 uses Y/X for throttle/yaw, Z/Rz for DS4 roll/pitch, and Rx/Ry
  for Xbox roll/pitch. Display the actual assignments; retain raw axis ordering.
- Preserve manual channel choices and leave button bindings, dead zone and
  rate settings untouched, including detonate button 0.
- Block the legacy Papyrus OnKeyDown(256) detonation path during a controller
  flight as well as the native mouse path. Freeze the input mode for the flight;
  preserve mouse detonation in keyboard mode and F10 emergency abort in both.
- Keep the rest of the game on its existing keyboard/mouse input. No global
  gamepad setting change is required.

The reported rapid explosions are recorded as ground impacts at frames 31/32.
The identified Sony VID 054C/PID 09CC controller exposes its right stick on Z/Rz;
the prior Xbox Rx/Ry defaults instead read its resting triggers. The independent
Papyrus mouse path was also a real input-isolation bug. Collision handling
remains active. The original flight DLL stays byte-identical at 0.1.28; the
controller bridge is version 133. The user subsequently confirmed that it works.

## 0.1.32 — selectable gamepad and USB FPV controls (hardware validation pending)

- Add FPVDroneController.dll (F4SE plugin version 132), supporting Fallout 4
  1.10.163 and the exact original FPVDroneNative 0.1.28 binary.
- Enumerate connected XInput gamepads and DirectInput controllers in MCM.
  Preserve DirectInput selection by GUID; XInput uses the Windows slot.
  Keep missing saved devices explicit instead of silently selecting another one.
- Add axis assignment/inversion, dead zone, separate yaw/roll/pitch rate
  multipliers, centered-stick and absolute FPV throttle modes, and configurable
  detonate/abort button numbers. Freeze this profile for each flight.
- Feed analog values into the original flight integrator without generating
  operating-system keyboard or mouse events. Preserve keyboard/mouse mode and
  F10 emergency abort.
- Suppress held/menu button presses; cancel without an explosion on confirmed
  controller loss. Ignore physical left mouse detonation in controller mode.
- Add Papyrus properties and MCM helpers for the dynamic device list and status.
- Show a flight-control hint matching the selected input mode; restore the
  controller menu listener after explicitly re-enabling the mod.

The original flight DLL stays byte-identical at 0.1.28. The previous launch,
operator pose and D-key cancellation fixes are retained. No controllers were
connected during development; actual hardware and live-game tests are pending.

## 0.1.31 — fix unintended cancellation with D

- Correct the mistaken 0.1.29/0.1.30 hotkey conversion: Fallout 4 keyboard events
  use D=68 (0x44) and F10=121 (0x79), as shown in F4SE's own control map.
- Restore F10 as cancel and remove the stale D registration on load/hotkey
  registration, including saves made with AbortKey=68.
- Add regression checks that execute the actual OnKeyDown bytecode with the
  game's W/S/A/D/F10 key values. Previous tests used the wrong key-code model.

The launch transition, operator pose, native DLL and collision/range behavior
are unchanged from 0.1.30. The user subsequently confirmed that the fix works.

## 0.1.30 — operator Pip-Boy pose (game validation pending)

- Keep the player's third-person body using the Pip-Boy throughout FPV flight.
- Add private male/female IDLE records reusing vanilla PipboyIdle clips, with
  `dyn_ActivationAllowMovement` and continuous looping. The vanilla graph keeps
  the standing/sneak branch and masks the upper body while crouched.
- Stop the owned idle on flight completion, cancellation, player death and load
  recovery, before restoring the player's view. Visual transition reset leaves
  the flight pose running.
- Preserve the existing throw → Pip-Boy opening → black → FPV transition.

Native DLL remains 0.1.28. Animation rendering still requires in-game validation.

## 0.1.29 — launch transition (game validation pending)

- After the completed mine throw, play the vanilla Pip-Boy opening animation.
- Hold a black screen over Pip-Boy lowering and the existing FPV camera setup.
- Reveal FPV after the native controller reports running and two frame callbacks.
- Restore the original view and release transition input/fade state on failed
  setup, cancellation, death and load recovery.
- Introduced an erroneous conversion of F10=121 to 68 (actually D in Fallout 4).
  This regression is corrected in 0.1.31; it was not a valid F4SE key fix.
- Preserve the original controller bytecode as the build baseline; add the new
  source fragment and a reproducible compile/merge/validation pipeline.

Native DLL remains 0.1.28. No ESP, flight physics, recipe or NPC changes.
