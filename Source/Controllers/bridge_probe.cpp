// Hardware-independent integration checks of the production bridge hooks.
// The game pause singleton alone is replaced; sampling, session/button logic,
// config parsing and hook entry points below are the actual production code.
#define FPV_CONTROLLER_TEST
#include "controller_bridge.cpp"

namespace {
bool gTestPaused = false;
unsigned gTestActivationCalls = 0;
bool gTestActivationSucceeds = true;
alignas(16) BYTE testNative[0x20000]{};
SHORT physicalKeys[256]{};
fpv::FlightInput receivedInput{};
float receivedSettings[14]{};
fpv::FlightState* receivedState = nullptr;
unsigned physicsCalls = 0, tests = 0;
SHORT WINAPI TestAsync(int key) { return key >= 0 && key < 256 ? physicalKeys[key] : 0; }
void __fastcall TestPhysics(fpv::FlightState* state, const fpv::FlightInput* input, float, const float* settings) {
    ++physicsCalls; receivedState = state; receivedInput = *input;
    memcpy(receivedSettings, settings, sizeof(receivedSettings));
}
void Require(bool condition, const char* description) {
    ++tests;
    if (!condition) { fprintf(stderr, "FAIL %u: %s\n", tests, description); exit(2); }
}
bool Near(float a, float b) { return fabsf(a - b) < 0.00001f; }
fpv::ControllerConfig Config(const char* id = "xinput:0") {
    fpv::ControllerConfig c{}; Copy(c.selectedId, sizeof(c.selectedId), id);
    c.axes[0] = 1; c.axes[1] = 0; c.axes[2] = 3; c.axes[3] = 4;
    c.inverted[0] = true; c.deadZone = 0.05f;
    c.rates[0] = 1; c.rates[1] = 2; c.rates[2] = 0.5f;
    c.detonateButton = 1; c.abortButton = 2;
    return c;
}
void Reset(const char* id = "xinput:0") {
    gShared = Shared{}; memset(testNative, 0, sizeof(testNative));
    memset(physicalKeys, 0, sizeof(physicalKeys));
    gNative = testNative; gOriginalPhysics = TestPhysics; gOriginalAsync = TestAsync;
    *reinterpret_cast<LONG*>(testNative + kStatusRva) = 1;
    gShared.pending = Config(id); gShared.result = fpv::SampleResult::Ok;
    Copy(gShared.sampleId, sizeof(gShared.sampleId), id);
    gShared.axisMask = 0x3F; gShared.sampledAt = GetTickCount64();
    gShared.sample.connected = true; gShared.sample.buttonsCount = 14;
    gTestPaused = false; physicsCalls = 0;
}
void TickButtons(bool detonate, bool abort, bool paused = false) {
    gShared.sample.buttons[0] = detonate; gShared.sample.buttons[1] = abort;
    UpdateButtonsLocked(gShared.sample, gShared.result, paused);
}
} // namespace

int main(int argc, char** argv) {
    Require(fpv::ControllerModule() == GetModuleHandleW(nullptr), "standalone DirectInput owner is the probe executable");
    F4SEMessage startupMessage{"F4SE", 0, 0, nullptr};
    const uint32_t deferredPhases[] = {0u, 1u, 7u, 9u};
    for (uint32_t phase : deferredPhases) { startupMessage.type = phase; Message(&startupMessage); }
    startupMessage.type = 3; startupMessage.dataLen = 1; Message(&startupMessage);
    startupMessage.data = reinterpret_cast<void*>(1); startupMessage.dataLen = 0; Message(&startupMessage);
    Require(gTestActivationCalls == 0 && gRuntimeStarted == 0 && !gWorkerStarted, "plugin/PostLoad/InputLoaded/GameLoaded/failed save do not initialize controllers");
    startupMessage.dataLen = 1; Message(&startupMessage);
    Require(gTestActivationCalls == 1 && gRuntimeStarted == 2 && gWorkerStarted, "successful save load activates controllers exactly once");
    Message(&startupMessage); startupMessage.type = 8; startupMessage.dataLen = sizeof(void*); Message(&startupMessage);
    Require(gTestActivationCalls == 1, "subsequent save and new-game events cannot start a second worker");
    gRuntimeStarted = 0; gWorkerStarted = 0; gTestActivationCalls = 0; gTestActivationSucceeds = false;
    Message(&startupMessage);
    Require(gRuntimeStarted == 0 && !gWorkerStarted && gTestActivationCalls == 1, "failed activation remains deferred and retryable");
    gTestActivationSucceeds = true; Message(&startupMessage);
    Require(gRuntimeStarted == 2 && gWorkerStarted && gTestActivationCalls == 2, "new game retries failed activation without early startup work");
    gRuntimeStarted = 0; gWorkerStarted = 0;
    Require(Near(fpv::AxisValue(0.04f, false, 0.05f), 0), "dead zone rejects drift");
    Require(Near(fpv::AxisValue(0.525f, false, 0.05f), 0.5f), "remaining travel is continuous");
    Require(Near(fpv::AxisValue(-1, true, 0.3f), 1), "axis inversion and endpoints");
    Require(Near(fpv::AxisValue(NAN, false, 0.05f), 0), "nonfinite axis becomes neutral");
    // Recorded DS4 DirectInput contract: right stick Z/Rz, resting triggers
    // Rx/Ry=-1. The old Xbox defaults commanded full tilt at rest, producing
    // the early terrain impacts reported by the user, even with no fire button.
    float sonyAxes[8] = {0, 0, 0, -1, -1, 0, 0, 0};
    auto sonyConfig = Config(); fpv::FlightState sonyState{}; fpv::FlightInput sonyInput{};
    sonyState.throttle = 0.5f;
    fpv::ApplyControllerInput(sonyState, sonyInput, sonyAxes, sonyConfig, 0.02f);
    Require(Near(sonyInput.roll, -1) && Near(sonyInput.pitch, -1), "old Xbox profile reproduces resting DS4 full tilt");
    sonyConfig.axes[fpv::AxisRoll] = 2; sonyConfig.axes[fpv::AxisPitch] = 5;
    fpv::ApplyControllerInput(sonyState, sonyInput, sonyAxes, sonyConfig, 0.02f);
    Require(Near(sonyInput.roll, 0) && Near(sonyInput.pitch, 0) && Near(sonyInput.yaw, 0) && Near(sonyState.throttle, 0.5f), "DS4 profile stays neutral with resting triggers and holds hover throttle");
    sonyAxes[3] = sonyAxes[4] = 1;
    fpv::ApplyControllerInput(sonyState, sonyInput, sonyAxes, sonyConfig, 0.02f);
    Require(Near(sonyInput.roll, 0) && Near(sonyInput.pitch, 0), "DS4 trigger travel cannot tilt the drone");
    sonyAxes[2] = 0.525f; sonyAxes[5] = -0.525f;
    fpv::ApplyControllerInput(sonyState, sonyInput, sonyAxes, sonyConfig, 0.02f);
    Require(Near(sonyInput.roll, 0.5f) && Near(sonyInput.pitch, -0.5f), "DS4 actual right stick continuously controls attitude");
    Reset();
    Require(fpv::ValidAxes(gShared.pending, 0x3F), "Xbox axis assignment available");
    Require(!fpv::ValidAxes(gShared.pending, 0x0F), "absent pitch axis rejected");
    auto* state = reinterpret_cast<fpv::FlightState*>(testNative + kStateRva);
    fpv::FlightInput input{0.2f, 0.3f, 0.4f, 1, 1, {0, 0}};
    float settings[14]; for (unsigned i = 0; i < 14; ++i) settings[i] = static_cast<float>(i + 1);
    state->throttle = 0.5f;
    gShared.sample.axes[0] = 1; gShared.sample.axes[1] = -1;
    gShared.sample.axes[3] = 0.525f; gShared.sample.axes[4] = -0.525f;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(physicsCalls == 1 && receivedState == state, "original physics called once with original state");
    Require(Near(receivedInput.roll, 0.5f) && Near(receivedInput.pitch, -0.5f) && Near(receivedInput.yaw, 1), "analog axes reach integrator");
    Require(!receivedInput.throttleUp && !receivedInput.throttleDown && Near(state->throttle, 0.515f), "centered throttle integrates with dt");
    Require(Near(receivedSettings[6], 14) && Near(receivedSettings[7], 4) && Near(receivedSettings[8], 9), "independent roll pitch yaw rates");
    Require(Near(settings[6], 7) && Near(input.roll, 0.2f), "caller input and settings preserved");
    gShared.pending = Config("keyboard");
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(receivedInput.roll, 0.5f), "midflight preference change waits for next session");
    gShared.active.throttleMode = 1;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(state->throttle, 1), "absolute throttle maximum");
    gShared.sample.axes[1] = 0;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(state->throttle, 0.5f), "releasing full-up stick immediately returns throttle to 50 percent");
    gShared.sample.axes[1] = 1;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(state->throttle, 0), "absolute throttle minimum");
    gShared.sample.axes[1] = 0;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(state->throttle, 0.5f), "releasing full-down stick immediately returns throttle to 50 percent");
    gShared.sample.axes[1] = 0.5f;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(state->throttle, 0.25f), "absolute throttle preserves full travel without dead zone");
    bool fixedPositionTracks = true;
    const float initialLevels[] = {0.0f, 0.2f, 0.9f, 1.0f};
    const float stepDurations[] = {0.0f, 0.001f, 0.02f, 0.1f, 1.0f};
    for (float initial : initialLevels) for (float step : stepDurations) {
        state->throttle = initial;
        ControllerPhysicsStep(state, &input, step, settings);
        if (!Near(state->throttle, 0.25f)) fixedPositionTracks = false;
    }
    Require(fixedPositionTracks, "fixed quarter-throttle stick position ignores prior throttle and frame duration");
    bool heldPositionTracks = true; gShared.sample.axes[1] = -0.5f;
    for (unsigned frame = 0; frame < 120; ++frame) {
        ControllerPhysicsStep(state, &input, frame % 2 ? 0.02f : 0.005f, settings);
        if (!Near(state->throttle, 0.75f)) heldPositionTracks = false;
    }
    Require(heldPositionTracks, "holding a fixed stick position keeps 75 percent instead of accumulating throttle");
    gShared.active.throttleMode = 0; state->throttle = 0.999f; gShared.sample.axes[1] = -1;
    ControllerPhysicsStep(state, &input, 20, settings);
    Require(Near(state->throttle, 1), "long frame cannot overflow throttle");
    gShared.result = fpv::SampleResult::NotFocused; state->throttle = 0.6f;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(receivedInput.roll, 0) && Near(state->throttle, 0.6f), "loss of focus neutralizes attitude and holds throttle");
    Require(ControllerAsyncKeyState(VK_F10) == 0, "loss of focus alone does not cancel");
    Reset("keyboard"); physicalKeys[VK_F10] = static_cast<SHORT>(0x8001); physicalKeys[VK_LBUTTON] = 1;
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(!memcmp(&receivedInput, &input, sizeof(input)) && !memcmp(receivedSettings, settings, sizeof(settings)), "keyboard physics exact passthrough");
    Require(ControllerAsyncKeyState(VK_F10) == physicalKeys[VK_F10] && ControllerAsyncKeyState(VK_LBUTTON) == 1, "keyboard key state exact passthrough");
    Reset(); physicalKeys[VK_LBUTTON] = static_cast<SHORT>(0x8000);
    Require(ControllerAsyncKeyState(VK_LBUTTON) == 0, "physical mouse cannot detonate in controller mode");
    physicalKeys[VK_F10] = static_cast<SHORT>(0x8000);
    Require(ControllerAsyncKeyState(VK_F10) < 0, "physical F10 remains emergency exit");
    Reset(); TickButtons(true, true); ControllerAsyncKeyState(VK_F10); TickButtons(true, true);
    Require(ControllerAsyncKeyState(VK_LBUTTON) == 0 && ControllerAsyncKeyState(VK_F10) == 0, "buttons held on launch do not fire");
    TickButtons(false, false); TickButtons(true, false);
    Require(ControllerAsyncKeyState(VK_LBUTTON) < 0 && ControllerAsyncKeyState(VK_LBUTTON) == 0, "detonate press delivered once");
    TickButtons(true, false);
    Require(ControllerAsyncKeyState(VK_LBUTTON) == 0, "held detonate does not repeat");
    TickButtons(false, false); TickButtons(false, true);
    Require(ControllerAsyncKeyState(VK_F10) < 0 && ControllerAsyncKeyState(VK_F10) == 0, "abort press delivered once");
    TickButtons(false, false, true); TickButtons(true, true, true);
    gTestPaused = true;
    Require(ControllerAsyncKeyState(VK_LBUTTON) == 0 && ControllerAsyncKeyState(VK_F10) == 0, "paused menu buttons suppressed");
    gTestPaused = false; TickButtons(true, true);
    Require(ControllerAsyncKeyState(VK_LBUTTON) == 0 && ControllerAsyncKeyState(VK_F10) == 0, "held menu confirm suppressed on resume");
    TickButtons(false, false); TickButtons(true, false);
    Require(ControllerAsyncKeyState(VK_LBUTTON) < 0, "release and new press after menu works");
    Reset(); ControllerAsyncKeyState(VK_F10); gShared.result = fpv::SampleResult::Disconnected;
    Require(ControllerAsyncKeyState(VK_F10) < 0 && ControllerAsyncKeyState(VK_LBUTTON) == 0, "disconnect cancels without detonation");
    Reset(); gShared.result = fpv::SampleResult::Disconnected;
    Require(ControllerAsyncKeyState(VK_F10) == 0 && !gShared.receivedValidSample, "first acquisition has a bounded grace period before any valid sample");
    gShared.sessionStartedAt -= 1001;
    Require(ControllerAsyncKeyState(VK_F10) < 0, "initial missing controller cancels when startup grace expires");
    Reset(); gShared.result = fpv::SampleResult::Unavailable; gShared.unavailableSince = GetTickCount64() - 201;
    Require(ControllerAsyncKeyState(VK_F10) == 0, "initial acquisition failure is not mistaken for established input loss");
    gShared.pendingAbort = true;
    Require(ControllerAsyncKeyState(VK_F10) < 0, "controller cancel remains immediate during acquisition grace");
    Reset(); gShared.result = fpv::SampleResult::Disconnected; physicalKeys[VK_F10] = static_cast<SHORT>(0x8000);
    Require(ControllerAsyncKeyState(VK_F10) < 0, "physical emergency F10 remains immediate during acquisition grace");
    Reset(); ControllerAsyncKeyState(VK_F10); gShared.result = fpv::SampleResult::Unavailable; gShared.unavailableSince = GetTickCount64();
    Require(ControllerAsyncKeyState(VK_F10) == 0, "brief unavailable sample tolerated");
    gShared.unavailableSince -= 201;
    Require(ControllerAsyncKeyState(VK_F10) < 0, "persistent unavailable input cancels");
    Reset(); ControllerAsyncKeyState(VK_F10); gShared.sampledAt -= 1001;
    Require(ControllerAsyncKeyState(VK_F10) < 0, "stalled worker cancels");
    Reset(); gShared.axisMask = 1;
    Require(ControllerAsyncKeyState(VK_F10) < 0, "invalid axis assignment cancels safely");
    Reset(); Copy(gShared.sampleId, sizeof(gShared.sampleId), "xinput:1");
    Require(ControllerAsyncKeyState(VK_F10) == 0, "device handoff does not use old sample or fabricate disconnect");
    ControllerPhysicsStep(state, &input, 0.02f, settings);
    Require(Near(receivedInput.roll, 0), "different device sample cannot control flight");
    PluginInfo info{}; F4SEInterface f4se{}; f4se.runtimeVersion = kRuntime163;
    Require(F4SEPlugin_Query(&f4se, &info) && info.version == 136 && !strcmp(info.name, "FPVDroneController"), "F4SE query version and name");
    f4se.runtimeVersion++;
    Require(!F4SEPlugin_Query(&f4se, &info) && !F4SEPlugin_Load(&f4se), "other runtime rejected before hooks");
    f4se.runtimeVersion = kRuntime163; f4se.isEditor = 1;
    Require(!F4SEPlugin_Query(&f4se, &info), "editor rejected");
    Require(!CheckHash(GetModuleHandleW(nullptr)), "modified or unrelated native image rejected");
    // Exercise real Windows profile APIs and atomic file replacement together,
    // including already-cached reads, rather than only stubbing the INI bridge.
    char probeFolder[MAX_PATH]; GetModuleFileNameA(nullptr, probeFolder, MAX_PATH);
    char* probeFilename = strrchr(probeFolder, '\\'); Require(probeFilename != nullptr, "probe path found"); probeFilename[1] = 0;
    snprintf(gDefaultsIni, MAX_PATH, "%sprobe.defaults.ini", probeFolder);
    snprintf(gUserIni, MAX_PATH, "%sprobe.settings.ini", probeFolder);
    snprintf(gCachePath, MAX_PATH, "%sprobe.controllers.ini", probeFolder);
    snprintf(gCacheTemp, MAX_PATH, "%sprobe.controllers.ini.tmp", probeFolder);
    DeleteFileA(gDefaultsIni); DeleteFileA(gUserIni); DeleteFileA(gCachePath); DeleteFileA(gCacheTemp);
    Require(WritePrivateProfileStringA("Controllers", "iYawAxis", "2", gDefaultsIni) &&
        WritePrivateProfileStringA("Controllers", "fDeadZone", "12.5", gDefaultsIni) &&
        WritePrivateProfileStringA("Controllers", "iThrottleMode", "1", gDefaultsIni), "author defaults written including direct throttle");
    auto config = ReadConfig();
    Require(config.axes[fpv::AxisYaw] == 2 && Near(config.deadZone, 0.125f), "author defaults used when user has no values");
    Require(config.throttleMode == 1, "author direct throttle applies without a user override on validated runtime");
    WritePrivateProfileStringA("Controllers", "iThrottleMode", "0", gUserIni);
    Require(ReadConfig().throttleMode == 0, "explicit saved rate-throttle preference remains supported");
    WritePrivateProfileStringA("Controllers", "iThrottleMode", nullptr, gUserIni);
    Require(Keyboard(config), "missing MCM forces keyboard despite saved settings");
    WritePrivateProfileStringA("Controllers", "iYawAxis", "3", gUserIni);
    WritePrivateProfileStringA("Controllers", "fDeadZone", "7.5", gUserIni);
    WritePrivateProfileStringA("Controllers", "bInvertThrottle", "0", gUserIni);
    WritePrivateProfileStringA("Controllers", "fYawRate", "250", gUserIni);
    config = ReadConfig();
    Require(config.axes[fpv::AxisYaw] == 3 && Near(config.deadZone, 0.075f) && !config.inverted[0] && Near(config.rates[0], 2.5f), "saved user values override author defaults with correct percent units");
    WritePrivateProfileStringA("Controllers", "iYawAxis", "garbage", gUserIni);
    WritePrivateProfileStringA("Controllers", "fDeadZone", "nan", gUserIni);
    WritePrivateProfileStringA("Controllers", "fYawRate", "200garbage", gUserIni);
    config = ReadConfig();
    Require(config.axes[fpv::AxisYaw] == 0 && Near(config.deadZone, 0.05f) && Near(config.rates[0], 1), "malformed and nonfinite saved values use safe defaults");
    fpv::DeviceManager manager; manager.Initialize();
    PublishDevices(manager, 1, "test1");
    Require(GetPrivateProfileIntA("Devices", "ScanVersion", 0, gCachePath) == 1 &&
        GetPrivateProfileIntA("Devices", "Count", 0, gCachePath) == manager.Count() + 1, "published inventory includes keyboard and real device count");
    gInstalled = 1; gWorkerStarted = 1; PublishDevices(manager, 2, "test2");
    char cacheText[64]; GetPrivateProfileStringA("Devices", "Id0", "", cacheText, sizeof(cacheText), gCachePath);
    Require(!strcmp(cacheText, "keyboard") && GetPrivateProfileIntA("Devices", "ScanVersion", 0, gCachePath) == 2 &&
        GetPrivateProfileIntA("Bridge", "Ready", 0, gCachePath) == 1, "profile API sees atomic cache replacement after earlier read");
    gInstalled = 0; gWorkerStarted = 0; manager.Shutdown();
    DeleteFileA(gDefaultsIni); DeleteFileA(gUserIni); DeleteFileA(gCachePath); DeleteFileA(gCacheTemp);
    if (argc > 2) {
        HMODULE bridge = LoadLibraryA(argv[2]);
        Require(bridge != nullptr, "built controller DLL loads with Windows system dependencies");
        using QueryFn = bool (*)(const F4SEInterface*, PluginInfo*);
        using LoadFn = bool (*)(const F4SEInterface*);
        auto query = reinterpret_cast<QueryFn>(GetProcAddress(bridge, "F4SEPlugin_Query"));
        auto load = reinterpret_cast<LoadFn>(GetProcAddress(bridge, "F4SEPlugin_Load"));
        Require(query && load, "built DLL exports both F4SE entry points");
        f4se.isEditor = 0; f4se.runtimeVersion = kRuntime163; info = {};
        Require(query(&f4se, &info) && info.version == 136 && !strcmp(info.name, "FPVDroneController"), "shipped DLL accepts supported runtime");
        using InputModuleFn = HMODULE (*)();
        auto inputModule = reinterpret_cast<InputModuleFn>(GetProcAddress(bridge, "FPVDroneController_InputModule"));
        Require(inputModule && inputModule() == bridge && inputModule() != GetModuleHandleW(nullptr), "DLL DirectInput owner is its own module, not the host executable");
        ++f4se.runtimeVersion;
        Require(!query(&f4se, &info) && !load(&f4se), "built DLL rejects unsupported runtime without starting a worker");
        FreeLibrary(bridge);
    }
    if (argc > 1) {
        // Map the real release without running its DllMain, TLS callbacks or
        // unresolved imports. No original flight/game function is executed.
        HMODULE release = LoadLibraryExA(argv[1], nullptr, DONT_RESOLVE_DLL_REFERENCES);
        Require(release != nullptr, "release image maps without executing game code");
        auto* base = reinterpret_cast<BYTE*>(release);
        Require(CheckHash(release), "original release SHA256 accepted");
        auto* slot = reinterpret_cast<void**>(base + kAsyncIatRva);
        void* oldSlot = *slot; DWORD oldProtection = 0, ignored = 0;
        Require(VirtualProtect(base + kPhysicsRva, sizeof(kPhysicsProlog), PAGE_EXECUTE_READWRITE, &oldProtection), "test image protection acquired");
        base[kPhysicsRva] ^= 1;
        gNative = nullptr; gInstallAttempt = 0; gInstalled = 0;
        Require(!InstallHooks() && !gInstalled && *slot == oldSlot, "modified memory prologue blocks all hooks");
        memcpy(base + kPhysicsRva, kPhysicsProlog, sizeof(kPhysicsProlog));
        VirtualProtect(base + kPhysicsRva, sizeof(kPhysicsProlog), oldProtection, &ignored);
        gInstallAttempt = 0;
        Require(InstallHooks() && gInstalled, "validated release hook installation");
        Require(*slot == reinterpret_cast<void*>(&ControllerAsyncKeyState), "only native input IAT points to bridge");
        const auto* trampoline = reinterpret_cast<const BYTE*>(gOriginalPhysics);
        Require(!memcmp(trampoline, kPhysicsProlog, sizeof(kPhysicsProlog)), "trampoline retains complete original instructions");
        void* destination = nullptr; memcpy(&destination, base + kPhysicsRva + 6, sizeof(destination));
        Require(base[kPhysicsRva] == 0xFF && base[kPhysicsRva + 1] == 0x25 && destination == reinterpret_cast<void*>(&ControllerPhysicsStep), "absolute physics jump targets bridge");
        memcpy(&destination, trampoline + sizeof(kPhysicsProlog) + 6, sizeof(destination));
        Require(destination == base + kPhysicsRva + sizeof(kPhysicsProlog), "trampoline returns after all relocated instructions");
        Require(InstallHooks(), "hook installation is idempotent");
        // The process exits immediately; do not unload an intentionally patched
        // image or execute its game-dependent integrator in this test.
    }
    printf("{\"testsPassed\":%u,\"hardwareTested\":false,\"gameTested\":false}\n", tests);
    return 0;
}
