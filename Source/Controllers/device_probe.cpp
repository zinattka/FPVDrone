#include "controller_devices.h"
#include <stdio.h>
#include <string.h>

namespace {
void JsonString(const char* text) {
    putchar('"');
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(text); *p; ++p) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p < 32) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
}

bool ZeroSample(const fpv::ControllerSample& sample) {
    if (sample.connected || sample.buttonsCount) return false;
    for (unsigned i = 0; i < 8; ++i) if (sample.axes[i] != 0.f) return false;
    for (unsigned i = 0; i < 128; ++i) if (sample.buttons[i]) return false;
    return true;
}

int main(int argc, char** argv) {
    fpv::DeviceManager manager;
    bool initialized = manager.Initialize();
    if (argc > 1 && strcmp(argv[1], "--self-test") == 0) {
        unsigned passed = 0;
        if (fpv::ControllerModule() != GetModuleHandleW(nullptr)) return 16;
        ++passed;
        if (fpv::DirectInputOpenFailure(true, true) != fpv::SampleResult::Unavailable) return 17;
        ++passed;
        if (fpv::DirectInputOpenFailure(true, false) != fpv::SampleResult::Disconnected) return 18;
        ++passed;
        if (fpv::DirectInputOpenFailure(false, true) != fpv::SampleResult::Unavailable) return 19;
        ++passed;
        if (fpv::DirectInputOpenFailure(false, false) != fpv::SampleResult::Unavailable) return 20;
        ++passed;
        fpv::ControllerSample sample;
        memset(&sample, 0x7F, sizeof(sample));
        manager.Select("");
        if (manager.Poll(sample) != fpv::SampleResult::Unavailable || !ZeroSample(sample)) return 2;
        ++passed;
        const char* absent = "dinput:{00000001-0002-0003-0405-060708090a0b}";
        if (manager.Select(absent) || strcmp(manager.SelectedId(), absent) != 0) return 3;
        memset(&sample, 0x7F, sizeof(sample));
        if (manager.Poll(sample) != fpv::SampleResult::Disconnected || !ZeroSample(sample)) return 4;
        ++passed;
        manager.Select("dinput:{invalid}");
        if (manager.Poll(sample) != fpv::SampleResult::Unavailable) return 5;
        ++passed;
        manager.Select("xinput:9");
        if (manager.Poll(sample) != fpv::SampleResult::Unavailable) return 6;
        ++passed;
        if (strcmp(fpv::ControllerLayout(fpv::BackendXInput), "xinput")) return 12;
        ++passed;
        const uint32_t sonyProducts[] = {0x09CC054Cu, 0x05C4054Cu, 0x0BA0054Cu};
        for (uint32_t product : sonyProducts) {
            if (strcmp(fpv::ControllerLayout(fpv::BackendDirectInput, product), "dualshock4")) return 13;
            ++passed;
        }
        const uint32_t manualProducts[] = {0u, 0xFFFF054Cu, 0x09CC045Eu, 0x00030483u};
        for (uint32_t product : manualProducts) {
            if (strcmp(fpv::ControllerLayout(fpv::BackendDirectInput, product), "manual")) return 14;
            ++passed;
        }
        if (strcmp(fpv::ControllerLayout(fpv::BackendNone, 0x09CC054Cu), "manual")) return 15;
        ++passed;
        const WORD buttons[fpv::XInputButtonCount] = {
            XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_X, XINPUT_GAMEPAD_Y,
            XINPUT_GAMEPAD_LEFT_SHOULDER, XINPUT_GAMEPAD_RIGHT_SHOULDER,
            XINPUT_GAMEPAD_BACK, XINPUT_GAMEPAD_START, XINPUT_GAMEPAD_LEFT_THUMB,
            XINPUT_GAMEPAD_RIGHT_THUMB, XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_DPAD_DOWN,
            XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT
        };
        uint8_t mapped[128];
        for (unsigned i = 0; i < fpv::XInputButtonCount; ++i) {
            memset(mapped, 0x7F, sizeof(mapped));
            fpv::MapXInputButtons(buttons[i], mapped);
            for (unsigned j = 0; j < 128; ++j) if (mapped[j] != (j == i ? 1 : 0)) return 9;
            ++passed;
        }
        fpv::MapXInputButtons(0xF3FFu, mapped);
        for (unsigned i = 0; i < 128; ++i) if (mapped[i] != (i < fpv::XInputButtonCount ? 1 : 0)) return 10;
        ++passed;
        fpv::MapXInputButtons(0x0C00u, mapped); // Reserved XInput bits.
        for (unsigned i = 0; i < 128; ++i) if (mapped[i]) return 11;
        ++passed;
        if (manager.Device(manager.Count()) != nullptr) return 7;
        ++passed;
        manager.Shutdown();
        memset(&sample, 0x7F, sizeof(sample));
        if (manager.Count() || manager.SelectedId()[0] || manager.DirectInputInventoryAvailable() || manager.SelectedAxisMask() ||
            manager.Poll(sample) != fpv::SampleResult::Unavailable || !ZeroSample(sample)) return 8;
        ++passed;
        printf("{\"testsPassed\":%u,\"hardwareTested\":false}\n", passed);
        return 0;
    }
    printf("{\"initialized\":%s,\"count\":%lu,\"devices\":[", initialized ? "true" : "false", static_cast<unsigned long>(manager.Count()));
    for (uint32_t i = 0; i < manager.Count(); ++i) {
        const fpv::ControllerDevice* device = manager.Device(i);
        if (i) putchar(',');
        printf("{\"id\":"); JsonString(device->id);
        printf(",\"name\":"); JsonString(device->name);
        printf(",\"layout\":"); JsonString(device->layout);
        printf(",\"backend\":%lu,\"axisMask\":%lu}", static_cast<unsigned long>(device->backend), static_cast<unsigned long>(device->axisMask));
    }
    puts("]}");
    return initialized ? 0 : 1;
}
