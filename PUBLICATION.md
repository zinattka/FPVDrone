# Publishing FPV Drone

This directory, `Documents/FPVDrone-GitHub`, is the local checkout for
[zinattka/FPVDrone](https://github.com/zinattka/FPVDrone).
It replaces the earlier publication snapshot. Use this checkout for future
repository updates; the existing GitHub repository and commit history are retained.

The repository contains the core mod, available sources, build inputs, tests,
licenses, CI and a separate optional experimental viewmodel under `Optional/Viewmodel`.
The main README is English; Russian instructions are in `README_RU.md`.

## Update the repository

From this directory, review your changes, refresh checksums after intentional
changes, and run the supplied checks before committing:

```powershell
python Tools/prepare_release.py --refresh-manifest --check
git diff
git add .
git commit -m "Describe the update"
git push origin main
```

Files are uploaded only when you push. GitHub Actions verifies manifests and
shipped Papyrus bytecode and builds the controller bridge. Papyrus compilation
with game tools and in-game validation remain local checks.

## Prepare release assets

For a separately verified release, generate deterministic archives with:

```powershell
python Tools/prepare_release.py --output dist
```

The output contains `FPVDrone-0.1.40.zip`, `FPVDrone-0.1.40-source.zip`,
`FPVDrone-Viewmodel-0.1.40-experimental.zip` and `SHA256SUMS`.
Use a new output directory if an earlier export already exists. The packager
refuses to overwrite an existing prepared repository. See `BUILDING.md`.

The core ZIP is the installable mod. The viewmodel is a separate experimental
add-on; runtime 4 rendering has not yet been confirmed in-game. Creating or
updating the repository does not automatically publish a GitHub Release.

Local build caches, logs, saves, toolchains, game SDK binaries and personal MCM
settings are excluded. Code: MIT, FPV Drone contributors. Model and texture
adaptations: Kvasovich, CC BY 4.0. Preserve `LICENSE`, `ASSET_LICENSE.md` and
`CREDITS.md` when distributing the mod.
