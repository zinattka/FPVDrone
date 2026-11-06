# Retained binary build inputs

The original 0.1.28 Papyrus and native flight sources were lost. The exact
original quest PEX and mod ESP are retained here so a clean checkout can build
the supported additions without relying on local `_build` backups.

- `0.1.28/Scripts/FPVDroneQuestScript.pex`: the base controller merged with the
  compiled `Source/LaunchTransition` fragment. The merger verifies its SHA-256
  and preserves the original saved variables, properties and unrelated code.
- `0.1.28/FPVDrone.esp`: the base plugin used to append the private operator-pose
  records. The builder verifies its SHA-256 and reads vanilla IDLE definitions
  from the developer's installed Fallout4.esm; game assets are not bundled here.

These files are build inputs, not an alternative runtime installation. The
current installable files live at the mod root and under `Scripts`.

The original `F4SE/Plugins/FPVDroneNative.dll` is distributed as a retained
runtime binary and is not rebuilt by these tools. The controller bridge pins
its supported hash. Available sources cover the later additions, not the lost
original implementation.

All retained build and comparison fixtures are listed by repository-relative
path in [the fixture manifest](../../Tests/Fixtures/FILE_MANIFEST.sha256).
