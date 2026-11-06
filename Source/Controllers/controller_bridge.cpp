#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "controller_devices.h"
#include "controller_math.h"

// Minimal public F4SE 0.6.23 ABI. No game allocation or Papyrus registration is
// needed: the native bridge reads MCM's existing settings and publishes an INI
// device list consumed through the existing Garden of Eden dependency.
struct F4SEInterface {
    uint32_t f4seVersion, runtimeVersion, editorVersion, isEditor;
    void* (*QueryInterface)(uint32_t);
    uint32_t (*GetPluginHandle)();
    uint32_t (*GetReleaseIndex)();
    const void* (*GetPluginInfo)(const char*);
};
struct PluginInfo { uint32_t infoVersion; const char* name; uint32_t version; };
struct F4SEMessage { const char* sender; uint32_t type, dataLen; void* data; };
struct F4SEMessaging {
    uint32_t version;
    bool (*RegisterListener)(uint32_t, const char*, void (*)(F4SEMessage*));
    bool (*Dispatch)(uint32_t, uint32_t, void*, uint32_t, const char*);
    void* (*GetEventDispatcher)(uint32_t);
};

namespace {
constexpr uintptr_t kPhysicsRva = 0x1E60;
constexpr uintptr_t kStateRva = 0x1E3B0;
constexpr uintptr_t kStatusRva = 0x1E358;
constexpr uintptr_t kAsyncIatRva = 0x1CB10;
constexpr uint32_t kRuntime163 = 0x010A0A30;
constexpr BYTE kPhysicsProlog[] = {0x55,0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,
    0x56,0x57,0x53,0x48,0x81,0xEC,0xB8,0x01,0x00,0x00};
constexpr BYTE kExpectedSha256[] = {0x5A,0xE7,0xAF,0xD9,0x35,0x92,0xFA,0xA1,
    0x44,0x94,0xCE,0x22,0xF4,0xF9,0x49,0x1E,0x2E,0x57,0xD6,0xBC,0x2C,0xE2,0x26,
    0x96,0xBA,0x77,0x94,0x8B,0x6A,0x5A,0xF6,0xC9};
char gUserIni[MAX_PATH], gDefaultsIni[MAX_PATH], gCachePath[MAX_PATH], gCacheTemp[MAX_PATH], gLogPath[MAX_PATH], gRequestPath[MAX_PATH];

using PhysicsFn = void(__fastcall*)(fpv::FlightState*, const fpv::FlightInput*, float, const float*);
using AsyncFn = SHORT(WINAPI*)(int);
PhysicsFn gOriginalPhysics = nullptr;
AsyncFn gOriginalAsync = nullptr;
BYTE* gNative = nullptr;
volatile LONG gInstalled = 0;
volatile LONG gInstallAttempt = 0;
volatile LONG gStop = 0;
volatile LONG gRuntimeStarted = 0; // 0 waiting, 1 activating, 2 worker started.
volatile LONG gWorkerStarted = 0;
SRWLOCK gLock = SRWLOCK_INIT;
SRWLOCK gLogLock = SRWLOCK_INIT;
char gBridgeStatus[192] = "Waiting for save load or new game; controller initialization deferred";

struct Shared {
    fpv::ControllerConfig pending{}, active{};
    fpv::ControllerSample sample{};
    char sampleId[160]{};
    fpv::SampleResult result = fpv::SampleResult::Unavailable;
    uint32_t axisMask = 0;
    ULONGLONG sampledAt = 0;
    ULONGLONG unavailableSince = 0, lastFrameAt = 0;
    ULONGLONG sessionStartedAt = 0;
    bool receivedValidSample = false, abortLogged = false;
    bool session = false;
    bool previousDetonate = false, previousAbort = false;
    bool buttonsPrimed = false;
    bool pendingDetonate = false, pendingAbort = false;
};
Shared gShared;

void Copy(char* destination, size_t capacity, const char* source) {
    if (!capacity) return;
    if (!source) source = "";
    size_t size = strlen(source);
    if (size >= capacity) size = capacity - 1;
    memcpy(destination, source, size); destination[size] = 0;
}
void Log(const char* message) {
    AcquireSRWLockExclusive(&gLogLock);
    HANDLE file = CreateFileA(gLogPath, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file != INVALID_HANDLE_VALUE) {
        DWORD written;
        WriteFile(file, message, static_cast<DWORD>(strlen(message)), &written, nullptr);
        WriteFile(file, "\r\n", 2, &written, nullptr);
        CloseHandle(file);
    }
    ReleaseSRWLockExclusive(&gLogLock);
}
void SetBridgeStatus(const char* status) {
    AcquireSRWLockExclusive(&gLock); Copy(gBridgeStatus, sizeof(gBridgeStatus), status); ReleaseSRWLockExclusive(&gLock);
    Log(status);
}
int NativeStatus() {
    return gNative ? static_cast<int>(InterlockedCompareExchange(
        reinterpret_cast<volatile LONG*>(gNative + kStatusRva), 0, 0)) : 0;
}
bool Keyboard(const fpv::ControllerConfig& config) { return !config.selectedId[0] || !_stricmp(config.selectedId, "keyboard"); }
bool Button(const fpv::ControllerSample& sample, int button) {
    return button > 0 && button <= 128 && static_cast<uint32_t>(button) <= sample.buttonsCount && sample.buttons[button - 1] != 0;
}
bool GamePaused() {
#ifdef FPV_CONTROLLER_TEST
    extern bool gTestPaused;
    return gTestPaused;
#else
    // Same 1.10.163 UI::numPauseGame predicate used by F4SE's input handler and
    // the original native mouse hook. ReadProcessMemory fails closed if the UI
    // singleton is not constructed yet; no raw freed-pointer dereference.
    uintptr_t ui = 0; SIZE_T read = 0;
    const auto game = reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr));
    if (!ReadProcessMemory(GetCurrentProcess(), reinterpret_cast<const void*>(game + 0x058D0898), &ui, sizeof(ui), &read) ||
        read != sizeof(ui) || !ui) return true;
    uint32_t paused = 0;
    return !ReadProcessMemory(GetCurrentProcess(), reinterpret_cast<const void*>(ui + 0x1E0), &paused, sizeof(paused), &read) ||
        read != sizeof(paused) || paused != 0;
#endif
}

void ReadText(const char* key, const char* fallback, char* output, DWORD capacity) {
    char author[256];
    GetPrivateProfileStringA("Controllers", key, fallback, author, sizeof(author), gDefaultsIni);
    GetPrivateProfileStringA("Controllers", key, author, output, capacity, gUserIni);
}
bool EndOfValue(const char* text) {
    while (*text == ' ' || *text == '\t' || *text == '\r' || *text == '\n') ++text;
    return !*text;
}
int ReadInt(const char* key, int fallback, int low, int high) {
    char text[64], defaultText[32]; snprintf(defaultText, sizeof(defaultText), "%d", fallback);
    ReadText(key, defaultText, text, sizeof(text));
    char* end = nullptr; long value = strtol(text, &end, 10);
    return end == text || !EndOfValue(end) || value < low || value > high ? fallback : static_cast<int>(value);
}
float ReadFloat(const char* key, float fallback, float low, float high) {
    char text[64], defaultText[32]; snprintf(defaultText, sizeof(defaultText), "%.5f", fallback);
    ReadText(key, defaultText, text, sizeof(text));
    char* end = nullptr; float value = strtof(text, &end);
    return end == text || !EndOfValue(end) || !isfinite(value) || value < low || value > high ? fallback : value;
}
fpv::ControllerConfig ReadConfig() {
    fpv::ControllerConfig config{};
    ReadText("sSelectedDevice", "keyboard", config.selectedId, sizeof(config.selectedId));
    if (!GetModuleHandleW(L"mcm.dll")) Copy(config.selectedId, sizeof(config.selectedId), "keyboard");
    config.axes[fpv::AxisThrottle] = ReadInt("iThrottleAxis", 1, 0, 7);
    config.axes[fpv::AxisYaw] = ReadInt("iYawAxis", 0, 0, 7);
    config.axes[fpv::AxisRoll] = ReadInt("iRollAxis", 3, 0, 7);
    config.axes[fpv::AxisPitch] = ReadInt("iPitchAxis", 4, 0, 7);
    config.inverted[fpv::AxisThrottle] = ReadInt("bInvertThrottle", 1, 0, 1) != 0;
    config.inverted[fpv::AxisYaw] = ReadInt("bInvertYaw", 0, 0, 1) != 0;
    config.inverted[fpv::AxisRoll] = ReadInt("bInvertRoll", 0, 0, 1) != 0;
    config.inverted[fpv::AxisPitch] = ReadInt("bInvertPitch", 0, 0, 1) != 0;
    config.deadZone = ReadFloat("fDeadZone", 5.0f, 0.0f, 30.0f) / 100.0f;
    config.rates[0] = ReadFloat("fYawRate", 100.0f, 10.0f, 300.0f) / 100.0f;
    config.rates[1] = ReadFloat("fRollRate", 100.0f, 10.0f, 300.0f) / 100.0f;
    config.rates[2] = ReadFloat("fPitchRate", 100.0f, 10.0f, 300.0f) / 100.0f;
    config.throttleMode = ReadInt("iThrottleMode", 0, 0, 1);
    config.detonateButton = ReadInt("iDetonateButton", 1, 0, 128);
    config.abortButton = ReadInt("iAbortButton", 2, 0, 128);
    return config;
}

// Called only from an already validated native flight's F10 query/physics step.
// Beginning a session snapshots settings and held buttons. A button already held
// while launching cannot detonate/cancel until it is released and pressed again.
void BeginSessionLocked() {
    if (gShared.session) return;
    gShared.active = gShared.pending; gShared.session = true;
    gShared.buttonsPrimed = false;
    gShared.lastFrameAt = 0;
    gShared.sessionStartedAt = GetTickCount64();
    gShared.receivedValidSample = false; gShared.abortLogged = false;
    gShared.pendingDetonate = gShared.pendingAbort = false;
    char line[640];
    snprintf(line, sizeof(line), "flight input source=%s axes(T/Y/R/P)=%d/%d/%d/%d throttleMode=%d buttons(D/A)=%d/%d sample=%u raw=%.3f,%.3f,%.3f,%.3f,%.3f,%.3f",
        gShared.active.selectedId, gShared.active.axes[0], gShared.active.axes[1], gShared.active.axes[2], gShared.active.axes[3],
        gShared.active.throttleMode, gShared.active.detonateButton, gShared.active.abortButton,
        static_cast<unsigned>(gShared.result), gShared.sample.axes[0], gShared.sample.axes[1], gShared.sample.axes[2],
        gShared.sample.axes[3], gShared.sample.axes[4], gShared.sample.axes[5]);
    Log(line);
}
void UpdateButtonsLocked(const fpv::ControllerSample& sample, fpv::SampleResult result, bool paused) {
    if (gShared.session && !Keyboard(gShared.active) && result == fpv::SampleResult::Ok && !paused) {
        const bool detonate = Button(sample, gShared.active.detonateButton), abort = Button(sample, gShared.active.abortButton);
        if (gShared.buttonsPrimed) {
            gShared.pendingDetonate |= detonate && !gShared.previousDetonate;
            gShared.pendingAbort |= abort && !gShared.previousAbort;
        }
        gShared.previousDetonate = detonate; gShared.previousAbort = abort;
        gShared.buttonsPrimed = true;
    } else { gShared.buttonsPrimed = false; gShared.pendingDetonate = gShared.pendingAbort = false; }
}
bool ControllerSnapshot(fpv::ControllerConfig& config, fpv::ControllerSample& sample,
    fpv::SampleResult& result, uint32_t& axisMask, ULONGLONG& sampledAt) {
    const int status = NativeStatus();
    if (status != 1 && status != 8) return false;
    AcquireSRWLockExclusive(&gLock);
    BeginSessionLocked(); config = gShared.active; sample = gShared.sample;
    result = gShared.result; axisMask = gShared.axisMask; sampledAt = gShared.sampledAt;
    // A menu change can precede the next worker poll. Never feed the previous
    // device's sample into a newly selected controller or treat that short
    // handoff as a disconnect.
    if (strcmp(gShared.sampleId, config.selectedId)) result = fpv::SampleResult::NotFocused;
    else if (result == fpv::SampleResult::Ok && GetTickCount64() - sampledAt <= 1000 && fpv::ValidAxes(config, axisMask))
        gShared.receivedValidSample = true;
    ReleaseSRWLockExclusive(&gLock);
    return !Keyboard(config);
}

SHORT WINAPI ControllerAsyncKeyState(int key) {
    const SHORT original = gOriginalAsync ? gOriginalAsync(key) : 0;
    fpv::ControllerConfig config{}; fpv::ControllerSample sample{};
    fpv::SampleResult result; uint32_t axisMask = 0; ULONGLONG sampledAt = 0;
    if (!ControllerSnapshot(config, sample, result, axisMask, sampledAt)) return original;
    const bool paused = GamePaused();
    if (key == VK_F10 || paused) {
        const ULONGLONG now = GetTickCount64();
        AcquireSRWLockExclusive(&gLock);
        if (paused || !gShared.lastFrameAt || now - gShared.lastFrameAt > 200) {
            gShared.pendingDetonate = gShared.pendingAbort = false;
            gShared.previousDetonate = Button(gShared.sample, config.detonateButton);
            gShared.previousAbort = Button(gShared.sample, config.abortButton);
            gShared.buttonsPrimed = !paused && !strcmp(gShared.sampleId, config.selectedId) && result == fpv::SampleResult::Ok;
        }
        if (key == VK_F10) gShared.lastFrameAt = now;
        ReleaseSRWLockExclusive(&gLock);
    }
    if (key == VK_F10) {
        bool abort, receivedValid; ULONGLONG unavailableSince, sessionStartedAt;
        AcquireSRWLockExclusive(&gLock);
        abort = gShared.pendingAbort; gShared.pendingAbort = false; unavailableSince = gShared.unavailableSince;
        receivedValid = gShared.receivedValidSample; sessionStartedAt = gShared.sessionStartedAt;
        ReleaseSRWLockExclusive(&gLock);
        const bool disconnected = result == fpv::SampleResult::Disconnected ||
            (result == fpv::SampleResult::Unavailable && unavailableSince && GetTickCount64() - unavailableSince >= 200);
        const bool stale = GetTickCount64() - sampledAt > 1000;
        const bool invalidAxes = result == fpv::SampleResult::Ok && !fpv::ValidAxes(config, axisMask);
        // Briefly allow the first acquisition, not an established controller
        // disappearing. F10/controller cancel and bad axes are never masked.
        const bool firstAcquisitionGrace = !receivedValid && GetTickCount64() - sessionStartedAt < 1000;
        const bool inputFailure = invalidAxes || (!firstAcquisitionGrace && (disconnected || stale));
        if (!paused && (abort || inputFailure)) {
            bool logAbort;
            AcquireSRWLockExclusive(&gLock); logAbort = !gShared.abortLogged; gShared.abortLogged = true; ReleaseSRWLockExclusive(&gLock);
            if (logAbort) Log(abort ? "input abort: controller cancel button" : invalidAxes ? "input abort: invalid axes" :
                stale ? "input abort: worker sample stale" : result == fpv::SampleResult::Disconnected ?
                "input abort: device disconnected" : "input abort: device unavailable");
        }
        return static_cast<SHORT>((original & 0x8000) || (!paused && (abort || inputFailure)) ? 0x8000 : 0);
    }
    if (key == VK_LBUTTON) {
        bool detonate;
        AcquireSRWLockExclusive(&gLock); detonate = gShared.pendingDetonate; gShared.pendingDetonate = false; ReleaseSRWLockExclusive(&gLock);
        return static_cast<SHORT>(!paused && detonate ? 0x8000 : 0); // physical LMB is intentionally ignored in controller mode.
    }
    return original;
}

void __fastcall ControllerPhysicsStep(fpv::FlightState* state, const fpv::FlightInput* input, float dt, const float* settings) {
    fpv::ControllerConfig config{}; fpv::ControllerSample sample{};
    fpv::SampleResult result; uint32_t axisMask = 0; ULONGLONG sampledAt = 0;
    if (state != reinterpret_cast<fpv::FlightState*>(gNative + kStateRva) || !input || !settings ||
        !ControllerSnapshot(config, sample, result, axisMask, sampledAt)) {
        gOriginalPhysics(state, input, dt, settings); return;
    }
    fpv::FlightInput replacement = *input;
    replacement.roll = replacement.pitch = replacement.yaw = 0.0f;
    replacement.throttleUp = replacement.throttleDown = 0;
    float adjustedSettings[14]; memcpy(adjustedSettings, settings, sizeof(adjustedSettings));
    if (result == fpv::SampleResult::Ok && GetTickCount64() - sampledAt <= 1000 && fpv::ValidAxes(config, axisMask)) {
        fpv::ApplyControllerInput(*state, replacement, sample.axes, config, dt);
        fpv::ApplyControllerRates(adjustedSettings, config);
    }
    // NotFocused means neutral rotation with held throttle, not a fabricated
    // disconnect. Missing devices are cancelled by the scoped F10 query.
    gOriginalPhysics(state, &replacement, dt, adjustedSettings);
}

bool CheckHash(HMODULE module) {
    wchar_t filename[MAX_PATH];
    if (!GetModuleFileNameW(module, filename, MAX_PATH)) return false;
    HANDLE file = CreateFileW(filename, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    BCRYPT_ALG_HANDLE algorithm = nullptr; BCRYPT_HASH_HANDLE hash = nullptr;
    BYTE digest[32], buffer[16384]; DWORD count = 0; bool success = false;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0 &&
        BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) >= 0) {
        success = true;
        while (ReadFile(file, buffer, sizeof(buffer), &count, nullptr) && count) {
            if (BCryptHashData(hash, buffer, count, 0) < 0) { success = false; break; }
        }
        if (success && BCryptFinishHash(hash, digest, sizeof(digest), 0) >= 0)
            success = memcmp(digest, kExpectedSha256, sizeof(digest)) == 0;
        else success = false;
    }
    if (hash) BCryptDestroyHash(hash);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    CloseHandle(file); return success;
}
void AbsoluteJump(BYTE* destination, const void* target) {
    destination[0] = 0xFF; destination[1] = 0x25;
    memset(destination + 2, 0, 4); memcpy(destination + 6, &target, sizeof(target));
}
bool InstallHooks() {
    if (InterlockedCompareExchange(&gInstalled, 0, 0)) return true;
    if (InterlockedCompareExchange(&gInstallAttempt, 1, 0)) return false;
    HMODULE native = GetModuleHandleW(L"FPVDroneNative.dll");
    if (!native) { InterlockedExchange(&gInstallAttempt, 0); return false; }
    BYTE* base = reinterpret_cast<BYTE*>(native);
    if (!CheckHash(native)) { SetBridgeStatus("Unsupported FPVDroneNative hash; keyboard only"); return false; }
    if (InterlockedCompareExchange(reinterpret_cast<volatile LONG*>(base + kStatusRva), 0, 0) != 0) {
        SetBridgeStatus("Controller hooks deferred: native flight already active");
        InterlockedExchange(&gInstallAttempt, 0); return false;
    }
    if (memcmp(base + kPhysicsRva, kPhysicsProlog, sizeof(kPhysicsProlog)) != 0) {
        SetBridgeStatus("Native physics entry differs; keyboard only"); return false;
    }
    auto dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    auto nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || nt->Signature != IMAGE_NT_SIGNATURE || nt->OptionalHeader.SizeOfImage < 0x1F000) {
        SetBridgeStatus("Invalid native PE image; keyboard only"); return false;
    }
    BYTE* trampoline = static_cast<BYTE*>(VirtualAlloc(nullptr, sizeof(kPhysicsProlog) + 14,
        MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE));
    if (!trampoline) { SetBridgeStatus("Physics trampoline allocation failed; keyboard only"); return false; }
    memcpy(trampoline, kPhysicsProlog, sizeof(kPhysicsProlog));
    AbsoluteJump(trampoline + sizeof(kPhysicsProlog), base + kPhysicsRva + sizeof(kPhysicsProlog));
    DWORD oldPhysics = 0, oldIat = 0;
    if (!VirtualProtect(base + kPhysicsRva, sizeof(kPhysicsProlog), PAGE_EXECUTE_READWRITE, &oldPhysics)) {
        VirtualFree(trampoline, 0, MEM_RELEASE); SetBridgeStatus("Physics patch protection failed; keyboard only"); return false;
    }
    auto slot = reinterpret_cast<void**>(base + kAsyncIatRva);
    if (!VirtualProtect(slot, sizeof(void*), PAGE_READWRITE, &oldIat)) {
        DWORD ignored; VirtualProtect(base + kPhysicsRva, sizeof(kPhysicsProlog), oldPhysics, &ignored);
        VirtualFree(trampoline, 0, MEM_RELEASE); SetBridgeStatus("Native input IAT protection failed; keyboard only"); return false;
    }
    gNative = base; gOriginalPhysics = reinterpret_cast<PhysicsFn>(trampoline); gOriginalAsync = reinterpret_cast<AsyncFn>(*slot);
    BYTE replacement[sizeof(kPhysicsProlog)]; memset(replacement, 0x90, sizeof(replacement));
    AbsoluteJump(replacement, reinterpret_cast<void*>(&ControllerPhysicsStep));
    memcpy(base + kPhysicsRva, replacement, sizeof(replacement));
    InterlockedExchangePointer(reinterpret_cast<void* volatile*>(slot), reinterpret_cast<void*>(&ControllerAsyncKeyState));
    DWORD ignored; VirtualProtect(slot, sizeof(void*), oldIat, &ignored);
    VirtualProtect(base + kPhysicsRva, sizeof(kPhysicsProlog), oldPhysics, &ignored);
    FlushInstructionCache(GetCurrentProcess(), base + kPhysicsRva, sizeof(kPhysicsProlog));
    FlushInstructionCache(GetCurrentProcess(), trampoline, sizeof(kPhysicsProlog) + 14);
    InterlockedExchange(&gInstalled, 1); SetBridgeStatus("Ready"); return true;
}

BOOL CALLBACK FindWindow(HWND window, LPARAM destination) {
    DWORD pid = 0; GetWindowThreadProcessId(window, &pid);
    if (pid == GetCurrentProcessId() && IsWindowVisible(window) && !GetWindow(window, GW_OWNER)) {
        *reinterpret_cast<HWND*>(destination) = window; return FALSE;
    }
    return TRUE;
}
HWND GameWindow() { HWND window = nullptr; EnumWindows(FindWindow, reinterpret_cast<LPARAM>(&window)); return window; }
void SafeIniText(char* value) {
    for (; *value; ++value) if (*value == '\r' || *value == '\n' || *value == '[' || *value == ']') *value = ' ';
}
void PublishDevices(const fpv::DeviceManager& manager, unsigned scanVersion, const char* lastRequest) {
    char text[24576], status[192]; size_t used = 0;
    AcquireSRWLockShared(&gLock); Copy(status, sizeof(status), gBridgeStatus); ReleaseSRWLockShared(&gLock);
    SafeIniText(status);
    used += snprintf(text + used, sizeof(text) - used,
        "[Bridge]\r\nReady=%ld\r\nStatus=%s\r\nVersion=136\r\nLastScanRequest=%s\r\n\r\n[Devices]\r\nCount=%u\r\nScanVersion=%u\r\nName0=Keyboard / mouse\r\nId0=keyboard\r\nAxisMask0=0\r\nLayout0=keyboard\r\n",
        InterlockedCompareExchange(&gInstalled, 0, 0) && InterlockedCompareExchange(&gWorkerStarted, 0, 0) ? 1L : 0L,
        status, lastRequest, manager.Count() + 1, scanVersion);
    for (uint32_t index = 0; index < manager.Count(); ++index) {
        const auto* device = manager.Device(index); if (!device) continue;
        char name[256]; Copy(name, sizeof(name), device->name); SafeIniText(name);
        used += snprintf(text + used, sizeof(text) - used, "Name%u=%s\r\nId%u=%s\r\nAxisMask%u=%u\r\nLayout%u=%s\r\n",
            index + 1, name, index + 1, device->id, index + 1, device->axisMask, index + 1, device->layout);
    }
    HANDLE file = CreateFileA(gCacheTemp, GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    DWORD written = 0; bool complete = WriteFile(file, text, static_cast<DWORD>(used), &written, nullptr) && written == used;
    FlushFileBuffers(file); CloseHandle(file);
    if (complete) MoveFileExA(gCacheTemp, gCachePath, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH);
}

[[maybe_unused]] DWORD WINAPI Worker(void*) {
    CreateDirectoryA("Data\\F4SE", nullptr); CreateDirectoryA("Data\\F4SE\\Plugins", nullptr);
    Log("FPVDroneController 0.1.36 worker started after save/new game; native flight remains 0.1.28.");
    fpv::DeviceManager manager; HWND window = GameWindow(); manager.Initialize(window);
    HRESULT previousError = S_OK, previousScanError = S_OK; auto previousResult = fpv::SampleResult::Ok;
    ULONGLONG configAt = 0, scanAt = 0, windowAt = 0; unsigned scanVersion = 0;
    char previousScanRequest[64] = "";
    while (!InterlockedCompareExchange(&gStop, 0, 0)) {
        const ULONGLONG now = GetTickCount64();
        bool session;
        AcquireSRWLockExclusive(&gLock);
        if (gShared.session && NativeStatus() == 0) {
            gShared.session = false; gShared.pendingAbort = gShared.pendingDetonate = false;
        }
        session = gShared.session; ReleaseSRWLockExclusive(&gLock);
        if (now - windowAt >= 500) {
            windowAt = now; HWND current = GameWindow();
            if (current != window) { window = current; manager.Initialize(window); scanAt = 0; }
        }
        if (!session && now - configAt >= 100) {
            configAt = now; const auto config = ReadConfig();
            AcquireSRWLockExclusive(&gLock); gShared.pending = config; ReleaseSRWLockExclusive(&gLock);
        }
        char request[64]; GetPrivateProfileStringA("Commands", "ScanRequest", "", request, sizeof(request), gRequestPath);
        SafeIniText(request);
        if (now - scanAt >= 2000 || strcmp(request, previousScanRequest)) {
            scanAt = now; Copy(previousScanRequest, sizeof(previousScanRequest), request);
            manager.Scan();
            if (manager.LastError() != previousScanError) {
                previousScanError = manager.LastError(); char line[160];
                snprintf(line, sizeof(line), "controller inventory authoritative=%u HRESULT=0x%08lX",
                    manager.DirectInputInventoryAvailable() ? 1u : 0u, static_cast<unsigned long>(previousScanError));
                Log(line);
            }
            PublishDevices(manager, ++scanVersion, request);
        }
        fpv::ControllerConfig config;
        AcquireSRWLockShared(&gLock); config = gShared.session ? gShared.active : gShared.pending; ReleaseSRWLockShared(&gLock);
        fpv::ControllerSample sample{}; auto result = fpv::SampleResult::Unavailable; uint32_t axisMask = 0;
        if (!Keyboard(config)) {
            if (strcmp(manager.SelectedId(), config.selectedId)) manager.Select(config.selectedId);
            result = manager.Poll(sample);
            // The acquired device's actual objects are authoritative, including
            // after a temporary metadata/enumeration failure in the menu scan.
            axisMask = manager.SelectedAxisMask();
        } else if (manager.SelectedId()[0]) manager.Select("");
        if (!Keyboard(config) && (result != previousResult || manager.LastError() != previousError)) {
            previousResult = result; previousError = manager.LastError(); char line[320];
            snprintf(line, sizeof(line), "controller poll device=%s result=%u HRESULT=0x%08lX",
                config.selectedId, static_cast<unsigned>(result), static_cast<unsigned long>(previousError));
            Log(line);
        }
        AcquireSRWLockExclusive(&gLock);
        gShared.sample = sample; Copy(gShared.sampleId, sizeof(gShared.sampleId), config.selectedId);
        gShared.result = result; gShared.axisMask = axisMask; gShared.sampledAt = GetTickCount64();
        if (result == fpv::SampleResult::Unavailable) {
            if (!gShared.unavailableSince) gShared.unavailableSince = gShared.sampledAt;
        } else gShared.unavailableSince = 0;
        if (gShared.session && !strcmp(config.selectedId, gShared.active.selectedId) && result == fpv::SampleResult::Ok &&
            fpv::ValidAxes(gShared.active, axisMask)) gShared.receivedValidSample = true;
        UpdateButtonsLocked(sample, result, GamePaused());
        ReleaseSRWLockExclusive(&gLock);
        Sleep(8);
    }
    return 0;
}
bool ActivateRuntime() {
#ifdef FPV_CONTROLLER_TEST
    extern unsigned gTestActivationCalls;
    extern bool gTestActivationSucceeds;
    ++gTestActivationCalls; return gTestActivationSucceeds;
#else
    if (!InstallHooks()) return false;
    AcquireSRWLockExclusive(&gLock); gShared.pending = ReadConfig(); ReleaseSRWLockExclusive(&gLock);
    InterlockedExchange(&gWorkerStarted, 1);
    HANDLE worker = CreateThread(nullptr, 0, Worker, nullptr, 0, nullptr);
    if (!worker) { InterlockedExchange(&gWorkerStarted, 0); SetBridgeStatus("Controller worker could not start; restart game"); return false; }
    CloseHandle(worker); return true;
#endif
}
void StartRuntime(const char* reason) {
    if (InterlockedCompareExchange(&gRuntimeStarted, 1, 0)) return;
    Log(reason);
    if (!ActivateRuntime()) { InterlockedExchange(&gRuntimeStarted, 0); return; }
    InterlockedExchange(&gWorkerStarted, 1); InterlockedExchange(&gRuntimeStarted, 2);
}
void Message(F4SEMessage* message) {
    if (!message) return;
    // F4SE encodes LoadGame's BOOL result in the pointer itself, not at *data.
    if (message->type == 3 && message->dataLen == 1 && reinterpret_cast<uintptr_t>(message->data) == 1)
        StartRuntime("startup stage: successful save load; activating controllers");
    else if (message->type == 8 && message->data && message->dataLen == sizeof(void*))
        StartRuntime("startup stage: new game; activating controllers");
    else if (message->type == 9) Log("startup stage: game data loaded; still waiting for save or new game");
    else if (message->type == 3) Log("startup stage: failed save load; controllers remain deferred");
}
} // namespace

extern "C" __declspec(dllexport) bool F4SEPlugin_Query(const F4SEInterface* f4se, PluginInfo* info) {
    if (!f4se || !info) return false;
    info->infoVersion = 1; info->name = "FPVDroneController"; info->version = 136;
    return !f4se->isEditor && f4se->runtimeVersion == kRuntime163;
}
extern "C" __declspec(dllexport) bool F4SEPlugin_Load(const F4SEInterface* f4se) {
    if (!f4se || f4se->isEditor || f4se->runtimeVersion != kRuntime163) return false;
    auto messaging = reinterpret_cast<F4SEMessaging*>(f4se->QueryInterface(1));
    if (!messaging) return false;
    char folder[MAX_PATH]; DWORD length = GetModuleFileNameA(nullptr, folder, MAX_PATH);
    if (!length || length >= MAX_PATH) return false;
    char* filename = strrchr(folder, '\\'); if (!filename) return false; filename[1] = 0;
    if (strlen(folder) + 60 >= MAX_PATH) return false;
    snprintf(gUserIni, MAX_PATH, "%sData\\MCM\\Settings\\FPVDrone.ini", folder);
    snprintf(gDefaultsIni, MAX_PATH, "%sData\\MCM\\Config\\FPVDrone\\settings.ini", folder);
    snprintf(gCachePath, MAX_PATH, "%sData\\F4SE\\FPVDrone.controllers.ini", folder);
    snprintf(gCacheTemp, MAX_PATH, "%sData\\F4SE\\FPVDrone.controllers.ini.tmp", folder);
    snprintf(gRequestPath, MAX_PATH, "%sData\\F4SE\\FPVDrone.controllers.request.ini", folder);
    snprintf(gLogPath, MAX_PATH, "%sData\\F4SE\\Plugins\\FPVDroneController.log", folder);
    CreateDirectoryA("Data\\F4SE", nullptr);
    Log("FPVDroneController 0.1.36 loaded; device APIs deferred until save/new game.");
    // Clear a previous run's Ready/devices without creating DirectInput/XInput.
    fpv::DeviceManager empty;
    PublishDevices(empty, 0, "");
    return messaging->RegisterListener(f4se->GetPluginHandle(), "F4SE", &Message);
}
extern "C" __declspec(dllexport) HMODULE FPVDroneController_InputModule() { return fpv::ControllerModule(); }
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) DisableThreadLibraryCalls(instance);
    else if (reason == DLL_PROCESS_DETACH) InterlockedExchange(&gStop, 1);
    return TRUE;
}
