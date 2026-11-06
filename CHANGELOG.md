# Changelog

## 0.1.40 — GitHub release preparation

- Retain the user-confirmed core runtime and launch behavior, including global
  gamepad launch and correct consumable selection in the lightweight profile.
- Remove the superseded flat SWF visual pipeline, generated frames, redundant
  rendering helpers and Python cache after preserving a verified local archive.
- Remove the unused controller module variable; preserve all live Papyrus
  helpers, public compatibility APIs and serialized save fields.
- Move required binary build inputs and regression fixtures out of local build
  folders so a clean checkout can run the patcher and tests.
- Isolate reusable model/PE helpers and remove optional build dependencies on
  reverse-engineering scratch files and the retired vector pipeline.
- Separate the unconfirmed 3D viewmodel runtime 4 into an optional experimental
  archive. Core flight does not require it.
- Add MIT licensing for code, separate CC BY 4.0 asset attribution, reproducible
  release archives, per-archive manifests, checksums and GitHub Actions checks.

## 0.1.40 — gamepad launch confirmation

- Correct HKX annotation versus Papyrus event-name handling. A watched throw
  requires its own base weaponFire then throwEnd rather than a literal .2 tag.
- Preserve exact one-item payment, trusted pre-throw inventory, cancellation,
  epoch checks and bounded completion waits. Save gate/event diagnostics before
  failure reset.
- User confirmed launch in the main profile with global gamepad controls and
  in the lightweight profile after selecting FPVDroneWeapon (xx00080E).

Earlier development notes and rollback copies remain in the local development
archive; they are not required to install or build this release. See
RELEASE_NOTES.md, TESTING.md and BUILDING.md for the maintained release details.
