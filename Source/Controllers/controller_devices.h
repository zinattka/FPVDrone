#pragma once

#ifndef DIRECTINPUT_VERSION
#define DIRECTINPUT_VERSION 0x0800
#endif
#include <windows.h>
#include <dinput.h>
#include <xinput.h>
#include <stdint.h>

namespace fpv {

enum class SampleResult : uint32_t { Ok, Disconnected, NotFocused, Unavailable };
enum ControllerBackend : uint32_t { BackendNone = 0, BackendDirectInput = 1, BackendXInput = 2 };

struct ControllerDevice {
    char id[160];
    char name[256];
    char layout[24]; // Suggested MCM profile; raw axes and buttons stay unchanged.
    uint32_t backend;
    uint32_t index;
    uint32_t axisMask;
    GUID guid;
};

struct ControllerSample {
    // Position axes: X,Y,Z,RX,RY,RZ,Slider0,Slider1, normalized to [-1,1].
    // Positive Y is down. No sensitivity, dead zone or calibration is applied.
    float axes[8];
    // 0 or 1. DirectInput retains native button order. XInput indices 0..13:
    // A,B,X,Y,LB,RB,Back,Start,LeftThumb,RightThumb,Up,Down,Left,Right.
    // Therefore the UI's one-based button 1 is A and button 2 is B.
    uint8_t buttons[128];
    uint32_t buttonsCount;
    bool connected;
};

constexpr uint32_t XInputButtonCount = 14;
// Pure mapping shared by the sampler and hardware-independent probe tests.
void MapXInputButtons(uint16_t mask, uint8_t output[128]);
// Product GUID Data1 stores the DirectInput PID/VID. Only known Sony models
// receive a suggested DS4 layout; an unknown radio retains manual assignment.
const char* ControllerLayout(uint32_t backend, uint32_t productData1 = 0);
// The DirectInput owner is this module, never its host game's executable.
HMODULE ControllerModule();
SampleResult DirectInputOpenFailure(bool inventoryAvailable, bool selectedAttached);

// One worker thread owns each manager. No method is thread-safe.
// Device(i) pointers remain valid until the next Scan/Shutdown.
// No OS keyboard/mouse events, vibration or global device settings are generated.
class DeviceManager {
public:
    static constexpr uint32_t MaxDevices = 32;
    DeviceManager();
    ~DeviceManager();
    DeviceManager(const DeviceManager&) = delete;
    DeviceManager& operator=(const DeviceManager&) = delete;

    // Null HWND supports enumeration/probing. DirectInput acquisition requires
    // a live game-process top-level window, using FOREGROUND|NONEXCLUSIVE.
    bool Initialize(HWND hwnd = nullptr);
    void Shutdown();
    uint32_t Scan();
    uint32_t Count() const { return count_; }
    const ControllerDevice* Device(uint32_t index) const;
    const char* SelectedId() const { return selectedId_; }
    HRESULT LastError() const { return lastError_; }
    bool DirectInputInventoryAvailable() const { return directInventoryAvailable_; }
    uint32_t SelectedAxisMask() const { return selectedAxisMask_; }

    // Returns current availability, retaining the requested stable ID on failure.
    // A disconnected DirectInput selection may reopen the SAME GUID in Poll.
    // Empty ID clears the selection; no fallback device is selected implicitly.
    bool Select(const char* stableId);
    SampleResult Poll(ControllerSample& sample);

private:
    using XInputGetStateFn = DWORD(WINAPI*)(DWORD, XINPUT_STATE*);
    static BOOL CALLBACK EnumDevice(const DIDEVICEINSTANCEW* instance, void* context);
    bool AddDirectInput(const DIDEVICEINSTANCEW& instance);
    void CollectXInputProducts();
    bool IsXInputDuplicate(IDirectInputDevice8W* device, const GUID& product) const;
    bool OpenSelectedDirectInput();
    void CloseSelected();
    bool Focused() const;

    HWND hwnd_;
    IDirectInput8W* directInput_;
    HMODULE xinputModule_;
    XInputGetStateFn getXInputState_;
    ControllerDevice devices_[MaxDevices];
    uint32_t count_;
    uint32_t xinputProducts_[64];
    uint32_t xinputProductCount_;
    bool hasConnectedXInput_;
    bool directInventoryAvailable_, directEnumerationTruncated_;

    char selectedId_[160];
    uint32_t selectedBackend_;
    uint32_t selectedIndex_;
    uint32_t selectedAxisMask_;
    uint32_t selectedButtons_;
    GUID selectedGuid_;
    IDirectInputDevice8W* selectedDirectInput_;
    HRESULT lastError_;
    LONG selectedMin_[8];
    LONG selectedMax_[8];
};

} // namespace fpv
