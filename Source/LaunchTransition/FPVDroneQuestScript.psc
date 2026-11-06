Scriptname FPVDroneQuestScript extends Quest

; BUILD FRAGMENT, not the complete quest script. Tools/build_launch_transition.ps1
; compiles these functions and merges them into the preserved 0.1.28 PEX.
; Shared declarations below must retain their existing names and types.
Int generation = 0
Int mode = 0
Actor pilot
Weapon droneWeapon
Int weaponThrowEpoch = 0
Bool weaponThrowArmed = false
Bool weaponReleaseSeen = false
Bool weaponGestureSuppressed = false
Bool weaponThrowStarted = false
Bool weaponInputBusy = false
Bool weaponLaunchClaimed = false
Bool weaponControlHeld = false
Bool weaponPrimaryInterrupted = false
Bool weaponCancelPending = false
Int weaponThrowStock = 0
Int weaponPolls = 0
Int savedCamera = 0
Bool cameraOwned = false
Bool enabled = true
String lastStopReason = ""
Int Property AbortKey = 121 Auto

Bool fpvTransitionOwned = false
Bool fpvTransitionBlack = false
Bool fpvTransitionPipboy = false
Bool fpvTransitionOpened = false
Int fpvTransitionGeneration = -1
InputEnableLayer fpvTransitionControls

; Independent from the temporary blackout: this ownership lasts for the flight.
Bool fpvTransitionPoseOwned = false
Actor fpvTransitionPosePilot
Int fpvTransitionPoseGeneration = -1

String[] Property FPVTransitionControllerDevices Auto
String Property FPVTransitionControllerStatus = "" Auto
String[] fpvTransitionControllerIDs
String[] fpvTransitionControllerLayouts
Bool fpvTransitionControllerLayoutBusy = false
Int fpvTransitionControllerMenuEpoch = 0

; The flight input owner outlives the launch fade, like the operator pose.
; FPVTransitionReset is visual cleanup and must not clear this snapshot.
Bool fpvTransitionControllerFlight = false
Int fpvTransitionControllerFlightGeneration = -1
Bool fpvTransitionAbortNotified = false

; F4SE 0.6.23 can discard an unrecognized gamepad mask before dispatching its
; control event. Observe a fresh engine throw as a fallback in gamepad mode.
Bool fpvTransitionThrowWatchRunning = false
Int fpvTransitionThrowWatchEpoch = 0
Int fpvTransitionThrowQuietSamples = 0
Bool fpvTransitionWatchArmPending = false
Int fpvTransitionWatchPendingEpoch = -1
Int fpvTransitionWatchArmedEpoch = -1
Bool fpvTransitionWatchGamepad = false
Int fpvTransitionQuietStock = -1
Int fpvTransitionQuietSourceEpoch = -1
Actor fpvTransitionQuietPilot
Weapon fpvTransitionQuietWeapon
Int fpvTransitionPendingStock = -1
Int fpvTransitionPendingSourceEpoch = -1
Actor fpvTransitionPendingPilot
Weapon fpvTransitionPendingWeapon
Bool fpvTransitionPendingSpecificRelease = false
Int fpvTransitionWatchBaselineEpoch = -1
Int fpvTransitionWatchSpecificReleaseEpoch = -1
Bool fpvTransitionPendingThrowEnd = false
Int fpvTransitionWatchThrowEndEpoch = -1
String[] fpvTransitionEventTrace
Int fpvTransitionEventTraceIndex = 0
Int fpvTransitionEventTraceSequence = 0
String fpvTransitionChargeTrace = ""
String fpvTransitionChargeEvents = ""

; Actual Papyrus names, bounded in memory. No engine calls or file writes on
; the event path; a failing Spend captures this ring before its reset.
Function FPVTransitionTraceAnimation(ObjectReference source, String eventName)
    If source != pilot || !enabled || mode != 0
        Return
    EndIf
    If !fpvTransitionEventTrace
        fpvTransitionEventTrace = new String[8]
        fpvTransitionEventTraceIndex = 0
    EndIf
    fpvTransitionEventTraceSequence += 1
    fpvTransitionEventTrace[fpvTransitionEventTraceIndex] = "#" + fpvTransitionEventTraceSequence + ":" + eventName + "; epoch=" + weaponThrowEpoch + "; armed=" + weaponThrowArmed + "; started=" + weaponThrowStarted + "; released=" + weaponReleaseSeen + "; primary=" + weaponPrimaryInterrupted + "; suppressed=" + weaponGestureSuppressed + "; pending=" + fpvTransitionWatchArmPending + "; owner=" + fpvTransitionWatchArmedEpoch + "; baseline=" + fpvTransitionWatchBaselineEpoch + "; fire=" + fpvTransitionWatchSpecificReleaseEpoch + "; end=" + fpvTransitionWatchThrowEndEpoch
    fpvTransitionEventTraceIndex += 1
    If fpvTransitionEventTraceIndex >= 8
        fpvTransitionEventTraceIndex = 0
    EndIf
EndFunction

String Function FPVTransitionSnapshotEventTrace()
    String snapshot = ""
    If fpvTransitionEventTrace
        Int i = 0
        Int at = fpvTransitionEventTraceIndex
        While i < 8
            If fpvTransitionEventTrace[at] != ""
                snapshot += fpvTransitionEventTrace[at] + " | "
            EndIf
            i += 1
            at += 1
            If at >= 8
                at = 0
            EndIf
        EndWhile
    EndIf
    Return snapshot
EndFunction

Function FPVTransitionClearQuietThrow()
    fpvTransitionThrowQuietSamples = 0
    fpvTransitionQuietStock = -1
    fpvTransitionQuietSourceEpoch = -1
    fpvTransitionQuietPilot = None
    fpvTransitionQuietWeapon = None
EndFunction

Function FPVTransitionStartThrowWatch()
    fpvTransitionThrowWatchEpoch += 1
    fpvTransitionThrowWatchRunning = enabled
    FPVTransitionClearQuietThrow()
    fpvTransitionWatchGamepad = false
    CancelTimer(10)
    If enabled
        StartTimer(0.05, 10)
    EndIf
EndFunction

Function FPVTransitionRecoverThrowWatch()
    ; RecoverAfterLoad stops the old watch and invalidates the throw first.
    fpvTransitionWatchArmPending = false
    fpvTransitionWatchPendingEpoch = -1
    fpvTransitionPendingStock = -1
    fpvTransitionPendingSpecificRelease = false
    fpvTransitionPendingThrowEnd = false
    fpvTransitionEventTrace = new String[8]
    fpvTransitionEventTraceIndex = 0
    fpvTransitionEventTraceSequence = 0
EndFunction

Function FPVTransitionStopThrowWatch()
    fpvTransitionThrowWatchRunning = false
    fpvTransitionThrowWatchEpoch += 1
    FPVTransitionClearQuietThrow()
    CancelTimer(10)
EndFunction

Function FPVTransitionInvalidateThrowWatch()
    ; ResetWeaponThrow also runs inside Arm; keep the watch chain alive.
    FPVTransitionClearQuietThrow()
    fpvTransitionWatchArmedEpoch = -1
    fpvTransitionWatchBaselineEpoch = -1
    fpvTransitionWatchSpecificReleaseEpoch = -1
    fpvTransitionWatchThrowEndEpoch = -1
EndFunction

Bool Function FPVTransitionThrowWatchCurrent(Int expected)
    Return fpvTransitionThrowWatchRunning && enabled && fpvTransitionThrowWatchEpoch == expected
EndFunction

Bool Function FPVTransitionThrowWatchTimer(Int timerID)
    If timerID != 10
        Return false
    EndIf
    Int expected = fpvTransitionThrowWatchEpoch
    If !FPVTransitionThrowWatchCurrent(expected)
        Return true
    EndIf
    FPVTransitionCheckGamepadThrow(expected)
    If FPVTransitionThrowWatchCurrent(expected)
        If mode == 0 && fpvTransitionWatchGamepad
            StartTimer(0.05, 10)
        Else
            StartTimer(0.25, 10)
        EndIf
    EndIf
    Return true
EndFunction

Function FPVTransitionCheckGamepadThrow(Int expected)
    Actor watched = pilot
    Int token = weaponThrowEpoch
    If !FPVTransitionThrowWatchCurrent(expected)
        Return
    EndIf
    If mode != 0 || !watched
        FPVTransitionClearQuietThrow()
        Return
    EndIf
    Bool gamepad = Game.UsingGamepad()
    If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
        Return
    EndIf
    fpvTransitionWatchGamepad = gamepad
    If !gamepad
        FPVTransitionClearQuietThrow()
        Return
    EndIf
    Bool throwing = watched.GetAnimationVariableBool("bIsThrowing")
    If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
        Return
    EndIf
    Bool interacting = IsLaunchInteractionActive()
    If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
        Return
    EndIf
    If interacting
        FPVTransitionClearQuietThrow()
        Return
    EndIf
    If !throwing
        Weapon selected = FPVTransitionEquippedThrowWeapon()
        If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
            Return
        EndIf
        Int stock = watched.GetItemCount(droneWeapon)
        If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
            Return
        EndIf
        Bool becameActive = watched.GetAnimationVariableBool("bIsThrowing")
        If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
            Return
        EndIf
        If becameActive
            ; Do not publish a possibly post-release count as a quiet baseline.
            ; An already trusted earlier snapshot may still arm this new edge.
            FPVTransitionArmWatchedThrow(expected, watched, token)
            Return
        EndIf
        If selected != droneWeapon || stock <= 0
            FPVTransitionClearQuietThrow()
            Return
        EndIf
        If fpvTransitionQuietStock == stock && fpvTransitionQuietSourceEpoch == token && fpvTransitionQuietPilot == watched && fpvTransitionQuietWeapon == droneWeapon
            If fpvTransitionThrowQuietSamples < 2
                fpvTransitionThrowQuietSamples += 1
            EndIf
        Else
            fpvTransitionThrowQuietSamples = 1
        EndIf
        fpvTransitionQuietStock = stock
        fpvTransitionQuietSourceEpoch = token
        fpvTransitionQuietPilot = watched
        fpvTransitionQuietWeapon = droneWeapon
        Return
    EndIf
    FPVTransitionArmWatchedThrow(expected, watched, token)
EndFunction

Function FPVTransitionArmWatchedThrow(Int expected, Actor watched, Int token)
    If !FPVTransitionThrowWatchCurrent(expected) || mode != 0 || pilot != watched || weaponThrowEpoch != token
        Return
    EndIf
    Int quiet = fpvTransitionThrowQuietSamples
    fpvTransitionThrowQuietSamples = 0
    If quiet < 2 || fpvTransitionWatchArmPending || fpvTransitionQuietStock <= 0 || fpvTransitionQuietSourceEpoch != token || fpvTransitionQuietPilot != watched || fpvTransitionQuietWeapon != droneWeapon || weaponThrowArmed || weaponInputBusy || weaponLaunchClaimed || weaponReleaseSeen
        Return
    EndIf
    ; Claim the gesture before Arm's native calls. Even an interrupted/failed
    ; attempt cannot re-arm the same still-active engine animation.
    fpvTransitionWatchArmPending = true
    fpvTransitionWatchPendingEpoch = expected
    fpvTransitionPendingStock = fpvTransitionQuietStock
    fpvTransitionPendingSourceEpoch = token
    fpvTransitionPendingPilot = watched
    fpvTransitionPendingWeapon = droneWeapon
    fpvTransitionPendingSpecificRelease = false
    fpvTransitionPendingThrowEnd = false
    FPVTransitionClearQuietThrow()
    weaponGestureSuppressed = false
    Int armedToken = ArmWeaponThrow(true)
    If FPVTransitionThrowWatchCurrent(expected) && fpvTransitionWatchPendingEpoch == expected && fpvTransitionPendingSourceEpoch == token && weaponThrowEpoch == token + 1 && mode == 0 && enabled && weaponThrowArmed
        ; A delayed normal Down can race this Arm. Keep the whole active
        ; gesture protected even when that callback won the arm token.
        fpvTransitionWatchArmedEpoch = weaponThrowEpoch
        If fpvTransitionPendingStock > 0 && weaponThrowStock == fpvTransitionPendingStock
            fpvTransitionWatchBaselineEpoch = weaponThrowEpoch
            If fpvTransitionPendingSpecificRelease
                fpvTransitionWatchSpecificReleaseEpoch = weaponThrowEpoch
            EndIf
            If fpvTransitionPendingThrowEnd
                fpvTransitionWatchThrowEndEpoch = weaponThrowEpoch
            EndIf
        EndIf
    ElseIf armedToken == token + 1 && weaponThrowEpoch == armedToken && mode == 0 && enabled && weaponThrowArmed
        If !FPVTransitionThrowWatchCurrent(expected)
            ResetWeaponThrow()
        EndIf
    EndIf
    If armedToken < 0 && FPVTransitionThrowWatchCurrent(expected) && mode == 0 && enabled && !weaponThrowArmed
        If weaponThrowEpoch == token || weaponThrowEpoch == token + 1
            weaponGestureSuppressed = true
        EndIf
    EndIf
    If fpvTransitionWatchPendingEpoch == expected && fpvTransitionPendingSourceEpoch == token
        fpvTransitionWatchArmPending = false
        fpvTransitionWatchPendingEpoch = -1
    EndIf
EndFunction

Int Function FPVTransitionResolveWatchBaseline(Int token, Weapon selected, Int actualStock)
    If !fpvTransitionWatchArmPending
        Return -1
    EndIf
    If !FPVTransitionThrowWatchCurrent(fpvTransitionWatchPendingEpoch) || mode != 0 || weaponThrowEpoch != token || fpvTransitionPendingSourceEpoch != token || pilot != fpvTransitionPendingPilot || droneWeapon != fpvTransitionPendingWeapon || fpvTransitionPendingStock <= 0
        Return 0
    EndIf
    If actualStock == fpvTransitionPendingStock && selected == droneWeapon
        Return fpvTransitionPendingStock
    EndIf
    If actualStock == fpvTransitionPendingStock - 1
        If selected == droneWeapon || !selected || (fpvTransitionPendingStock == 1 && actualStock == 0)
            Return fpvTransitionPendingStock
        EndIf
    EndIf
    Return 0
EndFunction

Bool Function FPVTransitionKeepWatchedThrow(Bool fromAnimation)
    Return !fromAnimation && enabled && mode == 0 && pilot && droneWeapon && weaponThrowArmed && !weaponReleaseSeen && !weaponGestureSuppressed && (fpvTransitionWatchArmPending || fpvTransitionWatchArmedEpoch == weaponThrowEpoch)
EndFunction

Bool Function FPVTransitionAllowManualThrowCharge(Int token)
    Bool allowed = false
    If !fpvTransitionWatchArmPending
        If fpvTransitionWatchArmedEpoch != token
            allowed = true
        Else
            allowed = FPVTransitionHasWatchProof(token)
        EndIf
    EndIf
    fpvTransitionChargeTrace = "token=" + token + "; allowed=" + allowed + "; current=" + weaponThrowEpoch + "; pending=" + fpvTransitionWatchArmPending + "; pendingSource=" + fpvTransitionPendingSourceEpoch + "; owner=" + fpvTransitionWatchArmedEpoch + "; baseline=" + fpvTransitionWatchBaselineEpoch + "; fire=" + fpvTransitionWatchSpecificReleaseEpoch + "; end=" + fpvTransitionWatchThrowEndEpoch + "; started=" + weaponThrowStarted + "; released=" + weaponReleaseSeen + "; primary=" + weaponPrimaryInterrupted + "; mode=" + mode
    fpvTransitionChargeEvents = FPVTransitionSnapshotEventTrace()
    Return allowed
EndFunction

Bool Function FPVTransitionHasWatchProof(Int token)
    ; HKX weaponFire.2 becomes tag weaponFire + payload 2. Papyrus cannot read
    ; the payload. A watcher manual charge instead needs its owned base fire
    ; AND the separate throwEnd trigger, after a trusted fresh throw began.
    Return !fpvTransitionWatchArmPending && fpvTransitionWatchArmedEpoch == token && fpvTransitionWatchBaselineEpoch == token && fpvTransitionWatchSpecificReleaseEpoch == token && fpvTransitionWatchThrowEndEpoch == token && weaponThrowStarted && !weaponPrimaryInterrupted
EndFunction

Bool Function FPVTransitionWaitForWatchCompletion(Int token, Bool throwing, Bool interacting)
    If !IsWeaponThrowCurrent(token)
        Return true
    EndIf
    If throwing || interacting || weaponCancelPending || weaponPrimaryInterrupted || !weaponThrowStarted
        Return false
    EndIf
    Bool pending = fpvTransitionWatchArmPending && fpvTransitionPendingSourceEpoch + 1 == token
    If !pending
        If fpvTransitionWatchArmedEpoch != token || fpvTransitionWatchBaselineEpoch != token || fpvTransitionWatchSpecificReleaseEpoch != token || fpvTransitionWatchThrowEndEpoch == token
            Return false
        EndIf
        Int stock = pilot.GetItemCount(droneWeapon)
        If !IsWeaponThrowCurrent(token)
            Return true
        EndIf
        If stock != weaponThrowStock || fpvTransitionWatchThrowEndEpoch == token || weaponCancelPending || weaponPrimaryInterrupted
            Return false
        EndIf
    EndIf
    ; Do not reject a valid throw just because Papyrus queued throwEnd after
    ; the first completed-animation poll. The original poll count bounds this.
    If weaponPolls > 80
        Return false
    EndIf
    weaponInputBusy = false
    StartTimer(0.05, 8)
    Return true
EndFunction

Function FPVTransitionRecoverGamepadRelease(Int token, Bool throwing)
    If throwing || !weaponThrowStarted || weaponReleaseSeen || weaponPrimaryInterrupted || !IsWeaponThrowCurrent(token)
        Return
    EndIf
    If !Game.UsingGamepad()
        Return
    EndIf
    If !IsWeaponThrowCurrent(token) || !weaponThrowStarted || weaponReleaseSeen || weaponPrimaryInterrupted
        Return
    EndIf
    Int stock = pilot.GetItemCount(droneWeapon)
    If !IsWeaponThrowCurrent(token) || !weaponThrowStarted || weaponReleaseSeen || weaponPrimaryInterrupted
        Return
    EndIf
    Bool proof = FPVTransitionHasWatchProof(token)
    If !IsWeaponThrowCurrent(token) || !weaponThrowStarted || weaponReleaseSeen || weaponPrimaryInterrupted
        Return
    EndIf
    Bool unpaidThrow = stock == weaponThrowStock && proof
    If weaponThrowStock > 0 && (stock == weaponThrowStock - 1 || unpaidThrow)
        weaponReleaseSeen = true
        weaponControlHeld = false
    EndIf
EndFunction

Weapon Function FPVTransitionEquippedThrowWeapon()
    Actor watched = pilot
    If !watched
        Return None
    EndIf
    Weapon selected = watched.GetEquippedWeapon(2)
    If !selected && droneWeapon && Game.UsingGamepad()
        If watched.IsEquipped(droneWeapon)
            Return droneWeapon
        EndIf
    EndIf
    Return selected
EndFunction

; Called only on a rejected/cancelled throw, after any original reset. Use the
; captured ArmWeaponThrow locals instead of sampling equipment a second time.
; In particular, successful arming must reach its caller without diagnostic I/O.
Function FPVTransitionThrowRejected(String reason, Weapon selected = None, Int stock = -1, Bool interacting = false, Bool fromAnimation = false, Int token = -1, Bool throwing = false)
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") < 0
        Return
    EndIf
    If reason == "arm: item checks"
        If selected != droneWeapon
            reason = "arm: equipped grenade is not FPV Drone"
        ElseIf stock <= 0
            reason = "arm: no drones in inventory"
        ElseIf interacting
            reason = "arm: menu or interaction active"
        EndIf
    EndIf
    String snapshot = "build=0.1.40; token=" + token + "; epoch=" + weaponThrowEpoch + "; mode=" + mode + "; enabled=" + enabled + "; pilot=" + pilot
    snapshot += "; armed=" + weaponThrowArmed + "; released=" + weaponReleaseSeen + "; suppressed=" + weaponGestureSuppressed
    snapshot += "; interacting=" + interacting + "; fromAnimation=" + fromAnimation + "; throwing=" + throwing + "; time=" + Utility.GetCurrentRealTime()
    snapshot += "; watchRunning=" + fpvTransitionThrowWatchRunning + "; gamepadSample=" + fpvTransitionWatchGamepad + "; watchArmedEpoch=" + fpvTransitionWatchArmedEpoch + "; watchPending=" + fpvTransitionWatchArmPending
    GardenOfEden2.WriteIni("FPVDrone.launch", "Throw", "Reason", reason)
    GardenOfEden2.WriteIni("FPVDrone.launch", "Throw", "Snapshot", snapshot)
    GardenOfEden2.WriteIni("FPVDrone.launch", "Throw", "Item", "equipped=" + selected + "; expected=" + droneWeapon + "; stock=" + stock)
EndFunction

Function FPVTransitionRecordSpend(String reason, Int token, Int baseline, Int stock, Weapon selected, Bool paidByEngine, Bool payHere, Int remaining, String gate, String events)
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") >= 0
        GardenOfEden2.WriteIni("FPVDrone.launch", "Spend", "Reason", reason)
        GardenOfEden2.WriteIni("FPVDrone.launch", "Spend", "Snapshot", "build=0.1.40; token=" + token + "; baseline=" + baseline + "; stock=" + stock + "; remaining=" + remaining + "; paidByEngine=" + paidByEngine + "; payHere=" + payHere + "; selected=" + selected + "; time=" + Utility.GetCurrentRealTime())
        GardenOfEden2.WriteIni("FPVDrone.launch", "Spend", "Gate", gate)
        GardenOfEden2.WriteIni("FPVDrone.launch", "Spend", "Events", events)
    EndIf
EndFunction

Function FPVTransitionBeginDiagnostics()
    fpvTransitionAbortNotified = false
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") >= 0
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "AbortReason", "")
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "FinishReason", "")
    EndIf
EndFunction

Function FPVTransitionRecordStatus(String statusText)
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") >= 0
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "Stage", statusText)
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "Context", "generation=" + generation + "; mode=" + mode + "; time=" + Utility.GetCurrentRealTime())
    EndIf
EndFunction

Function FPVTransitionRecordAbort(String reason)
    If mode != 1 && mode != 2
        Return
    EndIf
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") >= 0
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "AbortReason", reason)
    EndIf
    If !fpvTransitionAbortNotified
        fpvTransitionAbortNotified = true
        String notice = "FPV: запуск или полёт прерван: " + reason
        If reason == "TC could not take drone controls"
            notice = "FPV: не удалось передать управление дрону."
        ElseIf reason == "launch transition: FPV readiness timed out"
            notice = "FPV: камера дрона не ответила. Запуск отменён."
        EndIf
        Debug.Notification(notice)
    EndIf
EndFunction

Function FPVTransitionRecordFinish(Bool explode)
    If F4SE.GetPluginVersion("GardenOfEdenPapyrusScriptExtender") >= 0
        GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "FinishReason", lastStopReason)
        If F4SE.GetPluginVersion("FPVDroneNative") >= 128
            GardenOfEden2.WriteIni("FPVDrone.launch", "Latest", "Native", "status=" + FPVDroneNative.GetStatus() + "; frames=" + FPVDroneNative.GetFrames() + "; explode=" + explode)
        EndIf
    EndIf
    If fpvTransitionBlack && !explode && !fpvTransitionAbortNotified
        fpvTransitionAbortNotified = true
        Debug.Notification("FPV: запуск отменён до включения камеры дрона.")
    EndIf
EndFunction

Function FPVTransitionCaptureController(Int expected)
    If generation != expected || mode != 1
        Return
    EndIf
    Bool controller = false
    If F4SE.GetPluginVersion("F4MCM") >= 0 && F4SE.GetPluginVersion("FPVDroneController") >= 132
        If GardenOfEden2.ReadIni("FPVDrone.controllers", "Bridge", "Ready") == "1"
            String selected = MCM.GetModSettingString("FPVDrone", "sSelectedDevice:Controllers")
            controller = selected != "" && selected != "keyboard"
        EndIf
    EndIf
    ; Native calls can yield. A cancelled or older launch cannot overwrite
    ; the input ownership of a newer generation.
    If generation == expected && mode == 1
        fpvTransitionControllerFlight = controller
        fpvTransitionControllerFlightGeneration = expected
    EndIf
EndFunction

Bool Function FPVTransitionIgnoreMouseInput(Int keyCode)
    Return keyCode == 256 && mode == 2 && fpvTransitionControllerFlight && fpvTransitionControllerFlightGeneration == generation
EndFunction

Function FPVTransitionClearControllerFlight()
    fpvTransitionControllerFlight = false
    fpvTransitionControllerFlightGeneration = -1
EndFunction

Function FPVTransitionClearIdleControllerFlight()
    If mode == 0
        FPVTransitionClearControllerFlight()
    EndIf
EndFunction

Bool Function FPVTransitionCurrent(Int expected, Int expectedMode = 1)
    Return fpvTransitionOwned && fpvTransitionGeneration == expected && generation == expected && mode == expectedMode
EndFunction

; Fallout 4 keyboard events use VK-style IDs: D=0x44/68, F10=0x79/121.
; F4SE passes keyMask unchanged. Do not import Skyrim/DirectInput key values.
Function FPVTransitionRegisterCancel()
    If AbortKey == 68
        ; Repair saves touched by the erroneous 0.1.29/0.1.30 conversion.
        AbortKey = 121
    EndIf
    ; F4SE key registrations are serialized too; remove the stale D binding.
    ; RegisterHotkeys registers the repaired AbortKey immediately afterwards.
    UnregisterForKey(68)
EndFunction

Function FPVTransitionAnimationEvent(ObjectReference source, String eventName)
    FPVTransitionTraceAnimation(source, eventName)
    If source == pilot && enabled && mode == 0 && (eventName == "weaponFire" || eventName == "weaponFire.2" || eventName == "throwEnd")
        If fpvTransitionWatchArmPending && FPVTransitionThrowWatchCurrent(fpvTransitionWatchPendingEpoch) && fpvTransitionPendingPilot == pilot
            If weaponThrowEpoch == fpvTransitionPendingSourceEpoch || weaponThrowEpoch == fpvTransitionPendingSourceEpoch + 1
                If eventName == "throwEnd"
                    If fpvTransitionPendingSpecificRelease
                        fpvTransitionPendingThrowEnd = true
                    EndIf
                Else
                    fpvTransitionPendingSpecificRelease = true
                EndIf
            EndIf
        EndIf
        If weaponThrowArmed && weaponThrowStarted && fpvTransitionWatchArmedEpoch == weaponThrowEpoch && fpvTransitionWatchBaselineEpoch == weaponThrowEpoch
            If eventName == "throwEnd"
                If fpvTransitionWatchSpecificReleaseEpoch == weaponThrowEpoch
                    fpvTransitionWatchThrowEndEpoch = weaponThrowEpoch
                EndIf
            Else
                fpvTransitionWatchSpecificReleaseEpoch = weaponThrowEpoch
            EndIf
        EndIf
    EndIf
    If fpvTransitionOwned && fpvTransitionPipboy && fpvTransitionGeneration == generation && mode == 1 && source == pilot
        If eventName == "pipboyOpened"
            fpvTransitionOpened = true
        EndIf
    EndIf
EndFunction

Bool Function FPVTransitionBegin(Int expected)
    If generation != expected || mode != 1 || !pilot
        Return false
    EndIf
    FPVTransitionBeginDiagnostics()
    If generation != expected || mode != 1 || !pilot
        Return false
    EndIf
    fpvTransitionOwned = true
    fpvTransitionGeneration = expected
    fpvTransitionOpened = false

    InputEnableLayer layer = InputEnableLayer.Create()
    If !FPVTransitionCurrent(expected)
        If layer
            layer.Delete()
        EndIf
        Return false
    EndIf
    fpvTransitionControls = layer
    If !layer
        AbortWithReason("launch transition: input layer unavailable")
        Return false
    EndIf
    ; Keep sneak stance; block new attacks, throws, menus and camera input.
    layer.DisablePlayerControls(true, true, true, true, false, true, true, true, true, true, true)
    layer.EnableFastTravel(false)
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf

    Idle opening = Game.GetFormFromFile(0x00022D05, "Fallout4.esm") as Idle
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    If !opening
        AbortWithReason("launch transition: vanilla pipboyOpen idle missing")
        Return false
    EndIf
    ; savedCamera was captured by Launch before this call. Its cleanup will
    ; restore the original view even if preparation fails before drone creation.
    cameraOwned = true
    Game.ForceFirstPerson()
    Int cameraTries = 0
    While FPVTransitionCurrent(expected) && Game.GetCameraState() != 0 && cameraTries < 30
        Utility.WaitMenuMode(0.05)
        cameraTries += 1
    EndWhile
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    If Game.GetCameraState() != 0 || pilot.IsDead() || Utility.IsInMenuMode()
        AbortWithReason("launch transition: first-person animation unavailable")
        Return false
    EndIf

    ; Claim registration before the call, so cancellation/load cleanup owns it
    ; even while the native registration is dispatched.
    fpvTransitionPipboy = true
    Bool registered = RegisterForAnimationEvent(pilot, "pipboyOpened")
    If !FPVTransitionCurrent(expected)
        If registered
            UnregisterForAnimationEvent(pilot, "pipboyOpened")
        EndIf
        Return false
    EndIf
    If !registered
        AbortWithReason("launch transition: pipboy animation listener unavailable")
        Return false
    EndIf
    Float began = Utility.GetCurrentRealTime()
    Bool accepted = pilot.PlayIdle(opening)
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    If !accepted
        AbortWithReason("launch transition: pipboyOpen rejected")
        Return false
    EndIf
    RecordStatus("launch transition: pipboy opening")
    Float elapsed = 0.0
    Bool completed = false
    ; The vanilla pipboyUp clip lasts 0.8667 seconds. Require completion
    ; evidence AND the clip's duration, rather than a blind launch delay.
    While FPVTransitionCurrent(expected) && !completed && elapsed < 2.5
        If pilot.IsDead()
            AbortWithReason("launch transition: operator died")
            Return false
        EndIf
        If (fpvTransitionOpened || UI.IsMenuOpen("PipboyMenu")) && elapsed >= 0.87
            completed = true
        Else
            Utility.WaitMenuMode(0.02)
            elapsed = Utility.GetCurrentRealTime() - began
        EndIf
    EndWhile
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    If !completed
        AbortWithReason("launch transition: pipboy opening timed out")
        Return false
    EndIf

    fpvTransitionBlack = true
    Game.FadeOutGame(true, true, 0.0, 0.12, true)
    Utility.WaitMenuMode(0.15)
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    RecordStatus("launch transition: black, preparing FPV")
    ; Lower the Pip-Boy while hidden, before the native third-person handoff.
    ; Only menus belonging to this animation may be closed here.
    If UI.IsMenuOpen("PipboyMenu")
        UI.CloseMenu("PipboyMenu")
    EndIf
    Idle closing = Game.GetFormFromFile(0x00022CF8, "Fallout4.esm") as Idle
    If closing
        pilot.PlayIdle(closing)
    Else
        pilot.PlayAnimation("pipboyClose")
    EndIf
    Utility.WaitMenuMode(0.70)
    If !FPVTransitionCurrent(expected)
        Return false
    EndIf
    If UI.IsMenuOpen("PipboyMenu")
        UI.CloseMenu("PipboyMenu")
    EndIf
    UnregisterForAnimationEvent(pilot, "pipboyOpened")
    fpvTransitionPipboy = false
    If Utility.IsInMenuMode() || UI.IsMenuOpen("PipboyMenu") || pilot.IsDead()
        AbortWithReason("launch transition: interrupted before camera handoff")
        Return false
    EndIf
    Return FPVTransitionCurrent(expected)
EndFunction

Function FPVTransitionReveal(Int expected)
    Float began = Utility.GetCurrentRealTime()
    Int firstFrame = FPVDroneNative.GetFrames()
    While FPVTransitionCurrent(expected, 2)
        Int frame = FPVDroneNative.GetFrames()
        If frame < firstFrame
            firstFrame = frame
        EndIf
        If FPVDroneNative.GetStatus() == 1 && frame - firstFrame >= 2
            If !FPVTransitionCurrent(expected, 2)
                Return
            EndIf
            ; At least two native frame callbacks have positioned the camera.
            FPVTransitionReset()
            RecordStatus("launch transition: FPV visible")
            Return
        EndIf
        If Utility.GetCurrentRealTime() - began > 10.0
            AbortWithReason("launch transition: FPV readiness timed out")
            Return
        EndIf
        Utility.WaitMenuMode(0.02)
    EndWhile
    ; FinishFlight/RecoverAfterLoad own cleanup after a generation change.
EndFunction

Function FPVTransitionReset()
    FPVTransitionClosePipboy()
    Bool clearBlack = fpvTransitionBlack
    InputEnableLayer oldLayer = fpvTransitionControls
    fpvTransitionOwned = false
    fpvTransitionBlack = false
    fpvTransitionPipboy = false
    fpvTransitionOpened = false
    fpvTransitionGeneration = -1
    fpvTransitionControls = None
    If oldLayer
        oldLayer.Delete()
    EndIf
    If clearBlack
        Game.FadeOutGame(false, true, 0.0, 0.12, false)
    EndIf
EndFunction

; Cleanup calls this BEFORE restoring the player's camera, and only clears
; the fade afterwards. Do not reveal an open Pip-Boy or intermediate view.
Function FPVTransitionClosePipboy()
    If fpvTransitionPipboy
        fpvTransitionPipboy = false
        If pilot
            UnregisterForAnimationEvent(pilot, "pipboyOpened")
            pilot.PlayAnimation("pipboyClose")
            If UI.IsMenuOpen("PipboyMenu")
                UI.CloseMenu("PipboyMenu")
            EndIf
        EndIf
    EndIf
EndFunction

Bool Function FPVTransitionStartOperatorPose(Int expected)
    If generation != expected || mode != 2
        Return false
    EndIf
    If !pilot
        AbortWithReason("operator pose: player reference unavailable")
        Return false
    EndIf
    Actor body = pilot
    If body.IsDead() || !body.Is3DLoaded()
        AbortWithReason("operator pose: player body unavailable")
        Return false
    EndIf
    ActorBase bodyBase = body.GetLeveledActorBase()
    If !bodyBase
        bodyBase = body.GetActorBase()
    EndIf
    Int poseID = 0x00000810
    If bodyBase && bodyBase.GetSex() == 1
        poseID = 0x00000811
    EndIf
    Idle pose = Game.GetFormFromFile(poseID, "FPVDrone.esp") as Idle
    If generation != expected || mode != 2
        Return false
    EndIf
    If !pose
        AbortWithReason("operator pose: private Pip-Boy idle missing; update FPVDrone.esp")
        Return false
    EndIf
    ; These private idles reuse the vanilla PipboyIdle clips through
    ; dyn_ActivationAllowMovement. The graph chooses standing / sneak upper-body
    ; masks itself. Do not force a sneak variable, furniture state or camera.
    fpvTransitionPosePilot = body
    fpvTransitionPoseGeneration = expected
    fpvTransitionPoseOwned = true
    Bool accepted = body.PlayIdle(pose)
    If generation != expected || mode != 2
        If accepted && !fpvTransitionPoseOwned
            FPVTransitionIdleStop(body)
        EndIf
        Return false
    EndIf
    If !accepted
        AbortWithReason("operator pose: Pip-Boy idle rejected")
        Return false
    EndIf
    RecordStatus("operator pose: Pip-Boy active, standing/sneak stance preserved")
    ; IDLE min/max looping seconds are both 255: loop until explicitly stopped.
    ; Replaying the request on a timer would restart the gesture unnecessarily.
    Return true
EndFunction

Function FPVTransitionStopOperatorPose()
    Actor body = fpvTransitionPosePilot
    Bool owned = fpvTransitionPoseOwned
    fpvTransitionPoseOwned = false
    fpvTransitionPosePilot = None
    fpvTransitionPoseGeneration = -1
    If owned && body
        FPVTransitionIdleStop(body)
    EndIf
EndFunction

Function FPVTransitionIdleStop(Actor body)
    ; Leave the death graph alone. The native pilot hold restores motion/sneak;
    ; stopping this idle must not stand up or reset the player's animation graph.
    If body && body.Is3DLoaded() && !body.IsDead()
        Idle stop = Game.GetFormFromFile(0x000E9855, "Fallout4.esm") as Idle
        Bool stopped = false
        If stop
            stopped = body.PlayIdle(stop)
        EndIf
        If !stopped
            body.PlayAnimation("idleStop")
        EndIf
    EndIf
EndFunction

Function FPVTransitionRegisterControllerMenu()
    If FPVTransitionControllerDevices == None
        FPVTransitionControllerDevices = new String[1]
        FPVTransitionControllerDevices[0] = "Клавиатура и мышь"
        fpvTransitionControllerIDs = new String[1]
        fpvTransitionControllerIDs[0] = "keyboard"
        fpvTransitionControllerLayouts = new String[1]
        fpvTransitionControllerLayouts[0] = "keyboard"
        FPVTransitionControllerStatus = "Откройте меню для обновления списка устройств"
    EndIf
    If enabled && F4SE.GetPluginVersion("F4MCM") >= 0
        RegisterForExternalEvent("OnMCMMenuOpen|FPVDrone", "FPVTransitionControllerMenuOpen")
    EndIf
EndFunction

Function FPVTransitionUnregisterControllerMenu()
    fpvTransitionControllerMenuEpoch += 1
    UnregisterForExternalEvent("OnMCMMenuOpen|FPVDrone")
EndFunction

Function FPVTransitionControllerMenuOpen(String modName)
    If modName == "FPVDrone" && enabled
        FPVTransitionRefreshControllers()
    EndIf
EndFunction

Function FPVTransitionRefreshControllers()
    If !enabled || F4SE.GetPluginVersion("F4MCM") < 0
        Return
    EndIf
    FPVTransitionRegisterControllerMenu()
    If F4SE.GetPluginVersion("FPVDroneController") < 132
        FPVTransitionControllerStatus = "Модуль контроллеров не загружен. Перезапустите игру через F4SE."
        MCM.RefreshMenu()
        Return
    EndIf
    fpvTransitionControllerMenuEpoch += 1
    Int request = fpvTransitionControllerMenuEpoch
    String oldVersion = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "ScanVersion")
    GardenOfEden2.WriteIni("FPVDrone.controllers.request", "Commands", "ScanRequest", Utility.GetCurrentRealTime() as String)
    Int waits = 0
    While request == fpvTransitionControllerMenuEpoch && waits < 24 && oldVersion == GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "ScanVersion")
        Utility.WaitMenuMode(0.05)
        waits += 1
    EndWhile
    If request != fpvTransitionControllerMenuEpoch
        Return
    EndIf
    If GardenOfEden2.ReadIni("FPVDrone.controllers", "Bridge", "Ready") != "1"
        FPVTransitionControllerStatus = "Контроллеры недоступны: " + GardenOfEden2.ReadIni("FPVDrone.controllers", "Bridge", "Status")
        MCM.RefreshMenu()
        Return
    EndIf
    Bool coherent = false
    Int tries = 0
    Int count = 0
    String[] labels
    String[] ids
    String[] layouts
    While request == fpvTransitionControllerMenuEpoch && !coherent && tries < 3
        String version = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "ScanVersion")
        count = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "Count") as Int
        If version != "" && count >= 1 && count <= 63
            labels = new String[count]
            ids = new String[count]
            layouts = new String[count]
            Int i = 0
            Bool valid = true
            While i < count
                labels[i] = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "Name" + i)
                ids[i] = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "Id" + i)
                layouts[i] = GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "Layout" + i)
                If layouts[i] != "xinput" && layouts[i] != "dualshock4"
                    layouts[i] = "manual"
                EndIf
                If labels[i] == "" || ids[i] == ""
                    valid = false
                EndIf
                i += 1
            EndWhile
            coherent = valid && ids[0] == "keyboard" && version == GardenOfEden2.ReadIni("FPVDrone.controllers", "Devices", "ScanVersion")
        EndIf
        tries += 1
        If !coherent
            Utility.WaitMenuMode(0.05)
        EndIf
    EndWhile
    If request != fpvTransitionControllerMenuEpoch
        Return
    EndIf
    If !coherent
        FPVTransitionControllerStatus = "Список устройств обновляется. Нажмите «Обновить» ещё раз."
        MCM.RefreshMenu()
        Return
    EndIf
    String selected = MCM.GetModSettingString("FPVDrone", "sSelectedDevice:Controllers")
    If selected == ""
        selected = "keyboard"
        MCM.SetModSettingString("FPVDrone", "sSelectedDevice:Controllers", selected)
    EndIf
    Int index = -1
    Int j = 0
    While j < count
        If ids[j] == selected
            index = j
        EndIf
        j += 1
    EndWhile
    Int connected = count - 1
    If index < 0
        ; Keep the saved stable ID explicit when a device is disconnected.
        ; Never show keyboard while secretly retaining a different selected ID.
        String[] extendedLabels = new String[count + 1]
        String[] extendedIDs = new String[count + 1]
        String[] extendedLayouts = new String[count + 1]
        j = 0
        While j < count
            extendedLabels[j] = labels[j]
            extendedIDs[j] = ids[j]
            extendedLayouts[j] = layouts[j]
            j += 1
        EndWhile
        String selectedName = MCM.GetModSettingString("FPVDrone", "sSelectedDeviceName:Controllers")
        If selectedName == ""
            selectedName = selected
        EndIf
        extendedLabels[count] = "Не подключён: " + selectedName
        extendedIDs[count] = selected
        extendedLayouts[count] = "manual"
        labels = extendedLabels
        ids = extendedIDs
        layouts = extendedLayouts
        index = count
        FPVTransitionControllerStatus = "Выбранный контроллер отключён. Подключите его или выберите другое устройство."
    Else
        FPVTransitionControllerStatus = "Контроллеров подключено: " + connected + ". Выбор и оси применяются при следующем запуске."
    EndIf
    fpvTransitionControllerIDs = ids
    fpvTransitionControllerLayouts = layouts
    FPVTransitionControllerDevices = labels
    MCM.SetModSettingInt("FPVDrone", "iDeviceChoice:Controllers", index)
    FPVTransitionConfigureControllerLayout(index)
    MCM.RefreshMenu()
EndFunction

Function FPVTransitionControllerSettingChange(String modName, String setting)
    If !enabled || modName != "FPVDrone" || fpvTransitionControllerLayoutBusy
        Return
    EndIf
    If setting == "iControllerLayout:Controllers"
        If MCM.GetModSettingInt("FPVDrone", "iControllerLayout:Controllers") == 0
            FPVTransitionApplyControllerLayout()
        Else
            FPVTransitionControllerStatus = "Ручная раскладка: используются назначения осей ниже. Следующий полёт."
            MCM.RefreshMenu()
        EndIf
        Return
    EndIf
    If setting == "iThrottleAxis:Controllers" || setting == "iYawAxis:Controllers" || setting == "iRollAxis:Controllers" || setting == "iPitchAxis:Controllers" || setting == "bInvertThrottle:Controllers" || setting == "bInvertYaw:Controllers" || setting == "bInvertRoll:Controllers" || setting == "bInvertPitch:Controllers" || setting == "iThrottleMode:Controllers"
        MCM.SetModSettingInt("FPVDrone", "iControllerLayout:Controllers", 1)
        FPVTransitionControllerStatus = "Ручные назначения сохранены. Применятся при следующем запуске."
        MCM.RefreshMenu()
        Return
    EndIf
    If setting != "iDeviceChoice:Controllers"
        Return
    EndIf
    Int index = MCM.GetModSettingInt("FPVDrone", "iDeviceChoice:Controllers")
    String[] ids = fpvTransitionControllerIDs
    String[] labels = FPVTransitionControllerDevices
    If ids && labels && index >= 0 && index < ids.Length && index < labels.Length
        MCM.SetModSettingString("FPVDrone", "sSelectedDevice:Controllers", ids[index])
        MCM.SetModSettingString("FPVDrone", "sSelectedDeviceName:Controllers", labels[index])
        FPVTransitionControllerStatus = "Выбрано: " + labels[index] + ". Применится при следующем запуске."
        FPVTransitionConfigureControllerLayout(index)
        MCM.RefreshMenu()
    Else
        FPVTransitionRefreshControllers()
    EndIf
EndFunction

Function FPVTransitionConfigureControllerLayout(Int index, Bool force = false)
    If !enabled || fpvTransitionControllerLayoutBusy || MCM.GetModSettingInt("FPVDrone", "iControllerLayout:Controllers") != 0
        Return
    EndIf
    String[] ids = fpvTransitionControllerIDs
    String[] layouts = fpvTransitionControllerLayouts
    If !ids || !layouts || index < 0 || index >= ids.Length || index >= layouts.Length
        Return
    EndIf
    String selected = ids[index]
    String layout = layouts[index]
    If selected == "keyboard" || MCM.GetModSettingString("FPVDrone", "sSelectedDevice:Controllers") != selected
        Return
    EndIf
    If layout != "xinput" && layout != "dualshock4"
        If force
            FPVTransitionControllerStatus = "Для этого пульта назначьте оси вручную. Автораскладка известна только для Xbox и DualShock 4."
        EndIf
        Return
    EndIf
    String previous = MCM.GetModSettingString("FPVDrone", "sAppliedControllerLayout:Controllers")
    String stamp = selected + ":" + layout
    If !force && previous == stamp
        Return
    EndIf
    ; Upgrade safely: user-assigned channels from 0.1.32 are already a manual
    ; profile. Only the unchanged old Xbox defaults need the Sony correction.
    ; Both old accumulated throttle and new absolute throttle are compatible
    ; with these axis defaults; throttle mode does not identify custom channels.
    If !force && previous == ""
        Bool defaults = MCM.GetModSettingInt("FPVDrone", "iThrottleAxis:Controllers") == 1 && MCM.GetModSettingInt("FPVDrone", "iYawAxis:Controllers") == 0 && MCM.GetModSettingInt("FPVDrone", "iRollAxis:Controllers") == 3 && MCM.GetModSettingInt("FPVDrone", "iPitchAxis:Controllers") == 4 && MCM.GetModSettingBool("FPVDrone", "bInvertThrottle:Controllers") && !MCM.GetModSettingBool("FPVDrone", "bInvertYaw:Controllers") && !MCM.GetModSettingBool("FPVDrone", "bInvertRoll:Controllers") && !MCM.GetModSettingBool("FPVDrone", "bInvertPitch:Controllers")
        If !defaults
            MCM.SetModSettingInt("FPVDrone", "iControllerLayout:Controllers", 1)
            FPVTransitionControllerStatus = "Существующая ручная раскладка сохранена. Автораскладку можно включить отдельно."
            Return
        EndIf
    EndIf
    Int roll = 3
    Int pitch = 4
    String title = "Xbox / XInput"
    If layout == "dualshock4"
        roll = 2
        pitch = 5
        title = "DualShock 4: крен Z, тангаж Rz"
    EndIf
    fpvTransitionControllerLayoutBusy = true
    MCM.SetModSettingInt("FPVDrone", "iThrottleAxis:Controllers", 1)
    MCM.SetModSettingInt("FPVDrone", "iYawAxis:Controllers", 0)
    MCM.SetModSettingInt("FPVDrone", "iRollAxis:Controllers", roll)
    MCM.SetModSettingInt("FPVDrone", "iPitchAxis:Controllers", pitch)
    MCM.SetModSettingBool("FPVDrone", "bInvertThrottle:Controllers", true)
    MCM.SetModSettingBool("FPVDrone", "bInvertYaw:Controllers", false)
    MCM.SetModSettingBool("FPVDrone", "bInvertRoll:Controllers", false)
    MCM.SetModSettingBool("FPVDrone", "bInvertPitch:Controllers", false)
    MCM.SetModSettingInt("FPVDrone", "iThrottleMode:Controllers", 1)
    MCM.SetModSettingString("FPVDrone", "sAppliedControllerLayout:Controllers", stamp)
    fpvTransitionControllerLayoutBusy = false
    FPVTransitionControllerStatus = "Применена раскладка " + title + ". Газ Y: вниз 0%, центр 50%, вверх 100%. Следующий полёт."
EndFunction

Function FPVTransitionApplyControllerLayout()
    If !enabled || F4SE.GetPluginVersion("F4MCM") < 0
        Return
    EndIf
    If MCM.GetModSettingInt("FPVDrone", "iControllerLayout:Controllers") != 0
        FPVTransitionControllerStatus = "Сначала выберите автоматическую раскладку. Ручные назначения сохранены."
        MCM.RefreshMenu()
        Return
    EndIf
    String selected = MCM.GetModSettingString("FPVDrone", "sSelectedDevice:Controllers")
    String[] ids = fpvTransitionControllerIDs
    If ids
        Int i = 0
        While i < ids.Length
            If ids[i] == selected
                FPVTransitionConfigureControllerLayout(i, true)
                MCM.RefreshMenu()
                Return
            EndIf
            i += 1
        EndWhile
    EndIf
    FPVTransitionControllerStatus = "Сначала обновите список и выберите подключённое устройство."
    MCM.RefreshMenu()
EndFunction

Function FPVTransitionFlightNotice()
    If F4SE.GetPluginVersion("F4MCM") >= 0 && F4SE.GetPluginVersion("FPVDroneController") >= 132
        String selected = MCM.GetModSettingString("FPVDrone", "sSelectedDevice:Controllers")
        If selected != "" && selected != "keyboard"
            Debug.Notification("FPV: контроллер | назначенные кнопки подрыва/отмены — в MCM | F10 отмена")
            Return
        EndIf
    EndIf
    Debug.Notification("FPV: W/S throttle | A/D yaw | mouse roll/pitch | LMB detonate | F10 cancel")
EndFunction

; Compile-time declarations only; the merger retains the baseline implementations.
Function AbortWithReason(String reason)
EndFunction
Function RecordStatus(String statusText)
EndFunction
Int Function ArmWeaponThrow(Bool fromAnimation)
    Return -1
EndFunction
Bool Function IsWeaponThrowCurrent(Int token)
    Return false
EndFunction
Bool Function IsLaunchInteractionActive()
    Return false
EndFunction
Function ResetWeaponThrow()
EndFunction
