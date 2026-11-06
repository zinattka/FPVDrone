#pragma once
#include <stdint.h>
#include <stddef.h>
#include <math.h>

namespace fpv {

// Recovered from the exact FPVDroneNative 0.1.28 integrator call at RVA 0x13EB3.
// These are local copies at the boundary; the original integration is retained.
struct FlightInput {
    float roll, pitch, yaw;
    uint8_t throttleUp, throttleDown, reserved[2];
};
struct FlightState {
    float position[3], velocity[3], attitude[4], angularVelocity[3], throttle;
};
static_assert(sizeof(FlightInput) == 16, "native input ABI");
static_assert(offsetof(FlightInput, throttleUp) == 12, "native input ABI");
static_assert(sizeof(FlightState) == 0x38, "native state ABI");
static_assert(offsetof(FlightState, throttle) == 0x34, "native state ABI");

enum ControlAxis { AxisThrottle = 0, AxisYaw, AxisRoll, AxisPitch };
struct ControllerConfig {
    char selectedId[160];
    int axes[4];
    bool inverted[4];
    float deadZone;       // [0,0.30], author/UI values are percent.
    float rates[3];       // yaw, roll, pitch multipliers [0.10,3.0].
    int throttleMode;     // 0: centered-stick rate, 1: absolute radio throttle.
    int detonateButton;   // 1-based, zero disables this binding.
    int abortButton;
};

inline float ClampFinite(float value, float low, float high, float fallback = 0.0f) {
    if (!isfinite(value)) value = fallback;
    return value < low ? low : value > high ? high : value;
}
inline float AxisValue(float value, bool inverted, float deadZone) {
    value = ClampFinite(value, -1.0f, 1.0f);
    if (inverted) value = -value;
    deadZone = ClampFinite(deadZone, 0.0f, 0.30f);
    const float magnitude = fabsf(value);
    if (magnitude <= deadZone) return 0.0f;
    const float scaled = (magnitude - deadZone) / (1.0f - deadZone);
    return value < 0.0f ? -scaled : scaled;
}
inline bool ValidAxes(const ControllerConfig& config, uint32_t availableMask) {
    for (unsigned i = 0; i < 4; ++i)
        if (config.axes[i] < 0 || config.axes[i] > 7 || !(availableMask & (1u << config.axes[i]))) return false;
    return true;
}
inline void ApplyControllerInput(FlightState& state, FlightInput& input,
    const float axes[8], const ControllerConfig& config, float dt) {
    input.roll = AxisValue(axes[config.axes[AxisRoll]], config.inverted[AxisRoll], config.deadZone);
    input.pitch = AxisValue(axes[config.axes[AxisPitch]], config.inverted[AxisPitch], config.deadZone);
    input.yaw = AxisValue(axes[config.axes[AxisYaw]], config.inverted[AxisYaw], config.deadZone);
    const float throttle = AxisValue(axes[config.axes[AxisThrottle]], config.inverted[AxisThrottle],
        config.throttleMode == 1 ? 0.0f : config.deadZone);
    if (config.throttleMode == 1) state.throttle = 0.5f * (throttle + 1.0f);
    else state.throttle = ClampFinite(state.throttle, 0.0f, 1.0f, 0.5f)
        + throttle * 0.75f * ClampFinite(dt, 0.0f, 0.05f);
    state.throttle = ClampFinite(state.throttle, 0.0f, 1.0f, 0.5f);
    input.throttleUp = input.throttleDown = 0;
}
// Native settings offsets 0x18/0x1C/0x20 are maximum roll/pitch/yaw rates.
// Scaling the rate settings, rather than saturating normalized input, preserves
// continuous stick travel and makes 200% double the maximum angular rate.
inline void ApplyControllerRates(float settings[14], const ControllerConfig& config) {
    settings[6] *= config.rates[1];
    settings[7] *= config.rates[2];
    settings[8] *= config.rates[0];
}

} // namespace fpv
