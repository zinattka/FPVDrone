#include "controller_devices.h"
#include <stdio.h>
#include <string.h>

namespace fpv {
namespace {
constexpr DWORD kPositionOffsets[8] = {
    DIJOFS_X, DIJOFS_Y, DIJOFS_Z, DIJOFS_RX, DIJOFS_RY, DIJOFS_RZ,
    DIJOFS_SLIDER(0), DIJOFS_SLIDER(1)
};

void CopyString(char* destination, size_t capacity, const char* source) {
    if (!capacity) return;
    if (!source) source = "";
    size_t length = strlen(source);
    if (length >= capacity) length = capacity - 1;
    memcpy(destination, source, length);
    destination[length] = 0;
}

void Utf8(char* destination, size_t capacity, const wchar_t* source) {
    if (!capacity) return;
    destination[0] = 0;
    if (!source) return;
    // Truncate at whole UTF-16 code units, then retry on UTF-8 buffer overflow.
    int length = lstrlenW(source);
    while (length > 0) {
        if (length > 0 && source[length - 1] >= 0xD800 && source[length - 1] <= 0xDBFF) --length;
        int written = WideCharToMultiByte(CP_UTF8, 0, source, length, destination,
            static_cast<int>(capacity - 1), nullptr, nullptr);
        if (written > 0) { destination[written] = 0; return; }
        --length;
    }
}

void FormatGuidId(char* output, size_t capacity, const GUID& guid) {
    snprintf(output, capacity,
        "dinput:{%08lx-%04x-%04x-%02x%02x-%02x%02x%02x%02x%02x%02x}",
        static_cast<unsigned long>(guid.Data1), guid.Data2, guid.Data3,
        guid.Data4[0], guid.Data4[1], guid.Data4[2], guid.Data4[3],
        guid.Data4[4], guid.Data4[5], guid.Data4[6], guid.Data4[7]);
}

int Hex(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

bool ParseHex(const char* text, unsigned count, uint32_t& value) {
    value = 0;
    for (unsigned i = 0; i < count; ++i) {
        int digit = Hex(text[i]);
        if (digit < 0) return false;
        value = (value << 4) | static_cast<uint32_t>(digit);
    }
    return true;
}

bool ParseGuidId(const char* id, GUID& guid) {
    if (!id || strlen(id) != 45 || _strnicmp(id, "dinput:{", 8) != 0) return false;
    const char* text = id + 8;
    // dinput:{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
    if (text[8] != '-' || text[13] != '-' || text[18] != '-' || text[23] != '-' || text[36] != '}') return false;
    uint32_t value = 0;
    if (!ParseHex(text, 8, value)) return false; guid.Data1 = value;
    if (!ParseHex(text + 9, 4, value)) return false; guid.Data2 = static_cast<WORD>(value);
    if (!ParseHex(text + 14, 4, value)) return false; guid.Data3 = static_cast<WORD>(value);
    const unsigned offsets[8] = {19, 21, 24, 26, 28, 30, 32, 34};
    for (unsigned i = 0; i < 8; ++i) {
        if (!ParseHex(text + offsets[i], 2, value)) return false;
        guid.Data4[i] = static_cast<BYTE>(value);
    }
    return true;
}

bool HasIG(const wchar_t* text) {
    if (!text) return false;
    for (const wchar_t* p = text; *p; ++p) {
        if ((p[0] == 'I' || p[0] == 'i') && (p[1] == 'G' || p[1] == 'g') && p[2] == '_') return true;
    }
    return false;
}

uint32_t Axes(IDirectInputDevice8W* device) {
    uint32_t mask = 0;
    for (unsigned i = 0; i < 8; ++i) {
        DIDEVICEOBJECTINSTANCEW object = {};
        object.dwSize = sizeof(object);
        if (SUCCEEDED(device->GetObjectInfo(&object, kPositionOffsets[i], DIPH_BYOFFSET)) &&
            (object.dwType & DIDFT_AXIS)) mask |= (1u << i);
    }
    return mask;
}

float Clamp(float value) { return value < -1.f ? -1.f : value > 1.f ? 1.f : value; }
float Stick(SHORT value) { return value < 0 ? value / 32768.f : value / 32767.f; }

bool DeviceBefore(const ControllerDevice& a, const ControllerDevice& b) {
    if (a.backend != b.backend) return a.backend == BackendXInput;
    int byName = _stricmp(a.name, b.name);
    return byName < 0 || (byName == 0 && _stricmp(a.id, b.id) < 0);
}
} // namespace

const char* ControllerLayout(uint32_t backend, uint32_t productData1) {
    if (backend == BackendXInput) return "xinput";
    if (backend == BackendDirectInput && (productData1 == 0x09CC054Cu ||
        productData1 == 0x05C4054Cu || productData1 == 0x0BA0054Cu)) return "dualshock4";
    return "manual";
}
HMODULE ControllerModule() {
    HMODULE module = nullptr;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        reinterpret_cast<LPCWSTR>(&ControllerModule), &module);
    return module;
}
SampleResult DirectInputOpenFailure(bool inventoryAvailable, bool selectedAttached) {
    return !inventoryAvailable || selectedAttached ? SampleResult::Unavailable : SampleResult::Disconnected;
}

void MapXInputButtons(uint16_t mask, uint8_t output[128]) {
    const WORD masks[XInputButtonCount] = {
        XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_X, XINPUT_GAMEPAD_Y,
        XINPUT_GAMEPAD_LEFT_SHOULDER, XINPUT_GAMEPAD_RIGHT_SHOULDER,
        XINPUT_GAMEPAD_BACK, XINPUT_GAMEPAD_START, XINPUT_GAMEPAD_LEFT_THUMB,
        XINPUT_GAMEPAD_RIGHT_THUMB, XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_DPAD_DOWN,
        XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT
    };
    memset(output, 0, 128);
    for (uint32_t i = 0; i < XInputButtonCount; ++i) output[i] = (mask & masks[i]) ? 1 : 0;
}

DeviceManager::DeviceManager() : hwnd_(nullptr), directInput_(nullptr), xinputModule_(nullptr),
    getXInputState_(nullptr), count_(0), xinputProductCount_(0), hasConnectedXInput_(false),
    directInventoryAvailable_(false), directEnumerationTruncated_(false),
    selectedBackend_(BackendNone), selectedIndex_(0), selectedAxisMask_(0), selectedButtons_(0),
    selectedGuid_{}, selectedDirectInput_(nullptr), lastError_(S_OK) {
    selectedId_[0] = 0;
    memset(devices_, 0, sizeof(devices_));
    for (unsigned i = 0; i < 8; ++i) { selectedMin_[i] = -32767; selectedMax_[i] = 32767; }
}

DeviceManager::~DeviceManager() { Shutdown(); }

bool DeviceManager::Initialize(HWND hwnd) {
    Shutdown();
    hwnd_ = hwnd;
    // Microsoft requires a DLL to pass its own HINSTANCE. Sharing the host
    // executable's handle can interfere with that application's input setup.
    HMODULE owner = ControllerModule();
    HRESULT result = owner ? DirectInput8Create(owner, DIRECTINPUT_VERSION,
        IID_IDirectInput8W, reinterpret_cast<void**>(&directInput_), nullptr) : E_HANDLE;
    lastError_ = result;
    if (FAILED(result)) directInput_ = nullptr;
    xinputModule_ = LoadLibraryW(L"xinput1_4.dll");
    if (!xinputModule_) xinputModule_ = LoadLibraryW(L"xinput9_1_0.dll");
    if (xinputModule_) getXInputState_ = reinterpret_cast<XInputGetStateFn>(GetProcAddress(xinputModule_, "XInputGetState"));
    Scan();
    return directInput_ || getXInputState_;
}

void DeviceManager::CloseSelected() {
    if (selectedDirectInput_) {
        selectedDirectInput_->Unacquire();
        selectedDirectInput_->Release();
        selectedDirectInput_ = nullptr;
    }
}

void DeviceManager::Shutdown() {
    CloseSelected();
    if (directInput_) { directInput_->Release(); directInput_ = nullptr; }
    if (xinputModule_) { FreeLibrary(xinputModule_); xinputModule_ = nullptr; }
    getXInputState_ = nullptr;
    count_ = 0;
    selectedBackend_ = BackendNone;
    selectedId_[0] = 0;
    selectedAxisMask_ = selectedButtons_ = 0;
    xinputProductCount_ = 0;
    hasConnectedXInput_ = false;
    directInventoryAvailable_ = directEnumerationTruncated_ = false;
    hwnd_ = nullptr;
}

const ControllerDevice* DeviceManager::Device(uint32_t index) const { return index < count_ ? &devices_[index] : nullptr; }

void DeviceManager::CollectXInputProducts() {
    xinputProductCount_ = 0;
    if (!hasConnectedXInput_) return;
    UINT count = 0;
    if (GetRawInputDeviceList(nullptr, &count, sizeof(RAWINPUTDEVICELIST)) != 0 || !count || count > 4096) return;
    RAWINPUTDEVICELIST* list = static_cast<RAWINPUTDEVICELIST*>(HeapAlloc(GetProcessHeap(), 0, count * sizeof(*list)));
    if (!list) return;
    UINT actual = GetRawInputDeviceList(list, &count, sizeof(*list));
    if (actual != static_cast<UINT>(-1)) {
        for (UINT i = 0; i < actual && xinputProductCount_ < 64; ++i) {
            if (list[i].dwType != RIM_TYPEHID) continue;
            wchar_t name[1024] = {};
            UINT characters = 1024;
            if (GetRawInputDeviceInfoW(list[i].hDevice, RIDI_DEVICENAME, name, &characters) == static_cast<UINT>(-1) || !HasIG(name)) continue;
            RID_DEVICE_INFO info = {};
            info.cbSize = sizeof(info);
            UINT size = sizeof(info);
            if (GetRawInputDeviceInfoW(list[i].hDevice, RIDI_DEVICEINFO, &info, &size) == static_cast<UINT>(-1)) continue;
            uint32_t product = (info.hid.dwVendorId & 0xFFFFu) | ((info.hid.dwProductId & 0xFFFFu) << 16);
            bool duplicate = false;
            for (uint32_t j = 0; j < xinputProductCount_; ++j) if (xinputProducts_[j] == product) duplicate = true;
            if (!duplicate) xinputProducts_[xinputProductCount_++] = product;
        }
    }
    HeapFree(GetProcessHeap(), 0, list);
}

bool DeviceManager::IsXInputDuplicate(IDirectInputDevice8W* device, const GUID& product) const {
    if (!hasConnectedXInput_) return false;
    DIPROPGUIDANDPATH path = {};
    path.diph.dwSize = sizeof(path);
    path.diph.dwHeaderSize = sizeof(path.diph);
    path.diph.dwHow = DIPH_DEVICE;
    if (device && SUCCEEDED(device->GetProperty(DIPROP_GUIDANDPATH, &path.diph))) {
        // A path without IG_ is a known non-XInput interface: avoid broad
        // VID/PID filtering that could hide an unrelated same-product device.
        return HasIG(path.wszPath);
    }
    for (uint32_t i = 0; i < xinputProductCount_; ++i) if (xinputProducts_[i] == product.Data1) return true;
    return false;
}

BOOL CALLBACK DeviceManager::EnumDevice(const DIDEVICEINSTANCEW* instance, void* context) {
    DeviceManager* manager = static_cast<DeviceManager*>(context);
    if (manager->count_ >= MaxDevices) { manager->directEnumerationTruncated_ = true; return DIENUM_STOP; }
    manager->AddDirectInput(*instance);
    return DIENUM_CONTINUE;
}

bool DeviceManager::AddDirectInput(const DIDEVICEINSTANCEW& source) {
    if (count_ >= MaxDevices || !directInput_) return false;
    // EnumDevices owns its callback memory. Keep identity before re-entering
    // the driver for optional metadata queries.
    const DIDEVICEINSTANCEW instance = source;
    IDirectInputDevice8W* device = nullptr;
    HRESULT result = directInput_->CreateDevice(instance.guidInstance, &device, nullptr);
    if (FAILED(result) || !device) lastError_ = FAILED(result) ? result : E_FAIL;
    bool duplicate = IsXInputDuplicate(device, instance.guidProduct);
    uint32_t mask = 0;
    if (!duplicate && device) {
        result = device->SetDataFormat(&c_dfDIJoystick2);
        if (SUCCEEDED(result)) mask = Axes(device);
        else lastError_ = result;
    }
    if (device) device->Release();
    if (duplicate) return false;
    ControllerDevice& output = devices_[count_];
    memset(&output, 0, sizeof(output));
    FormatGuidId(output.id, sizeof(output.id), instance.guidInstance);
    char friendly[216] = {};
    Utf8(friendly, sizeof(friendly), instance.tszInstanceName[0] ? instance.tszInstanceName : instance.tszProductName);
    snprintf(output.name, sizeof(output.name), "%s [DirectInput]", friendly[0] ? friendly : "USB controller");
    output.backend = BackendDirectInput;
    CopyString(output.layout, sizeof(output.layout), ControllerLayout(output.backend, instance.guidProduct.Data1));
    output.index = count_;
    output.axisMask = mask;
    output.guid = instance.guidInstance;
    ++count_;
    return true;
}

uint32_t DeviceManager::Scan() {
    ControllerDevice previous[MaxDevices];
    const uint32_t previousCount = count_;
    memcpy(previous, devices_, previousCount * sizeof(previous[0]));
    count_ = 0;
    directInventoryAvailable_ = false; directEnumerationTruncated_ = false;
    lastError_ = S_OK;
    hasConnectedXInput_ = false;
    if (getXInputState_) for (DWORD i = 0; i < 4 && count_ < MaxDevices; ++i) {
        XINPUT_STATE state = {};
        if (getXInputState_(i, &state) != ERROR_SUCCESS) continue;
        hasConnectedXInput_ = true;
        ControllerDevice& output = devices_[count_++];
        memset(&output, 0, sizeof(output));
        snprintf(output.id, sizeof(output.id), "xinput:%lu", static_cast<unsigned long>(i));
        snprintf(output.name, sizeof(output.name), "Xbox / XInput #%lu [XInput]", static_cast<unsigned long>(i + 1));
        output.backend = BackendXInput;
        CopyString(output.layout, sizeof(output.layout), ControllerLayout(output.backend));
        output.index = i;
        output.axisMask = 0x3Fu;
    }
    CollectXInputProducts();
    const uint32_t directInputStart = count_;
    if (directInput_) {
        const HRESULT result = directInput_->EnumDevices(DI8DEVCLASS_GAMECTRL, EnumDevice, this, DIEDFL_ATTACHEDONLY);
        directInventoryAvailable_ = SUCCEEDED(result) && !directEnumerationTruncated_;
        if (!directInventoryAvailable_) {
            lastError_ = FAILED(result) ? result : HRESULT_FROM_WIN32(ERROR_MORE_DATA);
            // A failed/truncated scan is not evidence that an existing radio
            // vanished. Keep the last known DI inventory and acquired instance.
            count_ = directInputStart;
            for (uint32_t i = 0; i < previousCount && count_ < MaxDevices; ++i)
                if (previous[i].backend == BackendDirectInput) devices_[count_++] = previous[i];
        }
    } else lastError_ = DIERR_NOTINITIALIZED;
    for (uint32_t i = 1; i < count_; ++i) {
        ControllerDevice item = devices_[i];
        uint32_t j = i;
        while (j && DeviceBefore(item, devices_[j - 1])) { devices_[j] = devices_[j - 1]; --j; }
        devices_[j] = item;
    }
    if (selectedBackend_ == BackendDirectInput && selectedDirectInput_) {
        bool attached = false;
        for (uint32_t i = 0; i < count_; ++i) if (_stricmp(devices_[i].id, selectedId_) == 0) attached = true;
        if (DirectInputOpenFailure(directInventoryAvailable_, attached) == SampleResult::Disconnected) CloseSelected();
    }
    // Distinguish two radios of the same model in MCM. Compare all original
    // names before modifying any of them so that every duplicate gets a suffix.
    bool repeated[MaxDevices]{};
    for (uint32_t i = 0; i < count_; ++i) for (uint32_t j = i + 1; j < count_; ++j)
        if (devices_[i].backend == BackendDirectInput && devices_[j].backend == BackendDirectInput &&
            !_stricmp(devices_[i].name, devices_[j].name)) repeated[i] = repeated[j] = true;
    for (uint32_t i = 0; i < count_; ++i) if (repeated[i]) {
        char original[256]; CopyString(original, sizeof(original), devices_[i].name);
        // GUID Data1 can coincide between instances; include the full GUID
        // when names collide, keeping the displayed suffix unambiguous.
        snprintf(devices_[i].name, sizeof(devices_[i].name), "%.208s %s", original, devices_[i].id + 7);
    }
    return count_;
}

bool DeviceManager::Focused() const { return !hwnd_ || (IsWindow(hwnd_) && GetForegroundWindow() == hwnd_); }

bool DeviceManager::OpenSelectedDirectInput() {
    if (!directInput_ || selectedBackend_ != BackendDirectInput) { lastError_ = DIERR_NOTINITIALIZED; return false; }
    if (!hwnd_ || !IsWindow(hwnd_)) { lastError_ = E_HANDLE; return false; }
    // Inventory refresh controls reattachment attempts. Do not repeatedly call
    // CreateDevice every frame while a saved GUID is known to be unplugged.
    bool attached = false;
    for (uint32_t i = 0; i < count_; ++i) if (_stricmp(devices_[i].id, selectedId_) == 0) attached = true;
    if (!attached && directInventoryAvailable_) { lastError_ = DIERR_DEVICENOTREG; return false; }
    DWORD process = 0;
    GetWindowThreadProcessId(hwnd_, &process);
    if (process != GetCurrentProcessId()) { lastError_ = E_INVALIDARG; return false; }
    IDirectInputDevice8W* device = nullptr;
    HRESULT result = directInput_->CreateDevice(selectedGuid_, &device, nullptr);
    if (FAILED(result) || !device) { lastError_ = FAILED(result) ? result : E_FAIL; return false; }
    result = device->SetCooperativeLevel(hwnd_, DISCL_FOREGROUND | DISCL_NONEXCLUSIVE);
    if (SUCCEEDED(result)) result = device->SetDataFormat(&c_dfDIJoystick2);
    if (FAILED(result)) { lastError_ = result; device->Release(); return false; }
    selectedAxisMask_ = Axes(device);
    for (uint32_t i = 0; i < count_; ++i)
        if (!_stricmp(devices_[i].id, selectedId_)) devices_[i].axisMask = selectedAxisMask_;
    for (unsigned i = 0; i < 8; ++i) {
        selectedMin_[i] = 0; selectedMax_[i] = 65535;
        if (!(selectedAxisMask_ & (1u << i))) continue;
        DIPROPRANGE range = {};
        range.diph.dwSize = sizeof(range);
        range.diph.dwHeaderSize = sizeof(range.diph);
        range.diph.dwHow = DIPH_BYOFFSET;
        range.diph.dwObj = kPositionOffsets[i];
        range.lMin = -32767; range.lMax = 32767;
        if (SUCCEEDED(device->SetProperty(DIPROP_RANGE, &range.diph))) {
            selectedMin_[i] = range.lMin; selectedMax_[i] = range.lMax;
        }
        // Read back even after a successful SetProperty: a driver can report
        // no-effect/success without accepting the preferred range.
        if (SUCCEEDED(device->GetProperty(DIPROP_RANGE, &range.diph)) && range.lMax > range.lMin) {
            selectedMin_[i] = range.lMin; selectedMax_[i] = range.lMax;
        }
    }
    DIDEVCAPS caps = {};
    caps.dwSize = sizeof(caps);
    selectedButtons_ = SUCCEEDED(device->GetCapabilities(&caps)) ? (caps.dwButtons > 128 ? 128 : caps.dwButtons) : 0;
    selectedDirectInput_ = device;
    // Acquisition can legitimately fail while the game is not foreground.
    // Keep the configured instance; Poll will attempt bounded reacquisition.
    lastError_ = device->Acquire();
    return true;
}

bool DeviceManager::Select(const char* stableId) {
    CloseSelected();
    selectedBackend_ = BackendNone;
    selectedAxisMask_ = selectedButtons_ = 0;
    CopyString(selectedId_, sizeof(selectedId_), stableId);
    if (!selectedId_[0]) return true;
    if (_strnicmp(selectedId_, "xinput:", 7) == 0 && strlen(selectedId_) == 8 && selectedId_[7] >= '0' && selectedId_[7] <= '3') {
        selectedBackend_ = BackendXInput;
        selectedIndex_ = static_cast<uint32_t>(selectedId_[7] - '0');
        selectedAxisMask_ = 0x3F;
        selectedButtons_ = XInputButtonCount;
        XINPUT_STATE state = {};
        return getXInputState_ && getXInputState_(selectedIndex_, &state) == ERROR_SUCCESS;
    }
    GUID parsed = {};
    if (!ParseGuidId(selectedId_, parsed)) return false;
    selectedBackend_ = BackendDirectInput;
    selectedGuid_ = parsed;
    return OpenSelectedDirectInput();
}

SampleResult DeviceManager::Poll(ControllerSample& sample) {
    memset(&sample, 0, sizeof(sample));
    if (selectedBackend_ == BackendNone) { lastError_ = DIERR_NOTINITIALIZED; return SampleResult::Unavailable; }
    if (!Focused()) {
        if (selectedDirectInput_) selectedDirectInput_->Unacquire();
        lastError_ = DIERR_OTHERAPPHASPRIO;
        return SampleResult::NotFocused;
    }
    if (selectedBackend_ == BackendXInput) {
        if (!getXInputState_) { lastError_ = DIERR_NOTINITIALIZED; return SampleResult::Unavailable; }
        XINPUT_STATE state = {};
        DWORD result = getXInputState_(selectedIndex_, &state);
        lastError_ = result == ERROR_SUCCESS ? S_OK : HRESULT_FROM_WIN32(result);
        if (result != ERROR_SUCCESS) return result == ERROR_DEVICE_NOT_CONNECTED ? SampleResult::Disconnected : SampleResult::Unavailable;
        sample.axes[0] = Stick(state.Gamepad.sThumbLX);
        sample.axes[1] = -Stick(state.Gamepad.sThumbLY);
        sample.axes[2] = state.Gamepad.bLeftTrigger / 127.5f - 1.f;
        sample.axes[3] = Stick(state.Gamepad.sThumbRX);
        sample.axes[4] = -Stick(state.Gamepad.sThumbRY);
        sample.axes[5] = state.Gamepad.bRightTrigger / 127.5f - 1.f;
        sample.buttonsCount = XInputButtonCount;
        MapXInputButtons(state.Gamepad.wButtons, sample.buttons);
        sample.connected = true;
        return SampleResult::Ok;
    }
    if (!selectedDirectInput_ && !OpenSelectedDirectInput()) {
        // A known attached controller can fail acquisition while its window or
        // cooperative level is being prepared. That is not a physical unplug.
        bool attached = false;
        for (uint32_t i = 0; i < count_; ++i) if (!_stricmp(devices_[i].id, selectedId_)) attached = true;
        return DirectInputOpenFailure(directInventoryAvailable_, attached);
    }
    DIJOYSTATE2 state = {};
    HRESULT result = selectedDirectInput_->Poll();
    if (SUCCEEDED(result)) result = selectedDirectInput_->GetDeviceState(sizeof(state), &state);
    if (result == DIERR_INPUTLOST || result == DIERR_NOTACQUIRED) {
        HRESULT acquired = selectedDirectInput_->Acquire();
        if (SUCCEEDED(acquired)) {
            result = selectedDirectInput_->Poll();
            if (SUCCEEDED(result)) result = selectedDirectInput_->GetDeviceState(sizeof(state), &state);
        } else result = acquired;
    }
    lastError_ = result;
    if (FAILED(result)) {
        if (!Focused()) return SampleResult::NotFocused;
        if (result == static_cast<HRESULT>(DIERR_UNPLUGGED) || result == DIERR_DEVICENOTREG || result == DIERR_NOTFOUND) {
            CloseSelected();
            return SampleResult::Disconnected;
        }
        return SampleResult::Unavailable;
    }
    const LONG positions[8] = { state.lX, state.lY, state.lZ, state.lRx, state.lRy, state.lRz, state.rglSlider[0], state.rglSlider[1] };
    for (unsigned i = 0; i < 8; ++i) if ((selectedAxisMask_ & (1u << i)) && selectedMax_[i] > selectedMin_[i]) {
        double scaled = (static_cast<double>(positions[i]) - selectedMin_[i]) /
            (static_cast<double>(selectedMax_[i]) - selectedMin_[i]);
        sample.axes[i] = Clamp(static_cast<float>(2.0 * scaled - 1.0));
    }
    sample.buttonsCount = selectedButtons_;
    for (uint32_t i = 0; i < sample.buttonsCount; ++i) sample.buttons[i] = (state.rgbButtons[i] & 0x80u) ? 1 : 0;
    sample.connected = true;
    return SampleResult::Ok;
}
} // namespace fpv
