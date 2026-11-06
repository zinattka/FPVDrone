"""Validate and package the curated FPV Drone release. Python stdlib only.

The installed experimental add-on is left untouched. Only explicit runtime
files and Source/Tools/Tests/.github are exported; local build/history folders
are never traversed. Run --check on a fresh checkout without game/toolchain.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.40"
MANIFEST = "FILE_MANIFEST.sha256"
NATIVE_SHA = "5ae7afd93592faa14494ce22f4f9491e2e57d6bc2ce22696ba77948b6a5af6c9"
OVERLAY_SHA = "d90dd66783c85445b4aed7912faf575972eb00b35b1ca7fabf367fc39bc4a26b"
DOCS = ("README.md", "README_EN.md", "README_RU.md", "BUILDING.md", "TESTING.md", "CHANGELOG.md",
        "RELEASE_NOTES.md", "LICENSE", "ASSET_LICENSE.md", "CREDITS.md", "meta.ini", "PUBLICATION.md")
CORE = (
    "FPVDrone.esp", "F4SE/Plugins/FPVDroneNative.dll",
    "F4SE/Plugins/FPVDroneController.dll", "Interface/FPVDroneOverlay.swf",
    "MCM/Config/FPVDrone/config.json", "MCM/Config/FPVDrone/settings.ini",
    "Materials/FPVDrone/drone.bgsm", "Meshes/FPVDrone/drone_actor.nif",
    "Meshes/FPVDrone/drone_camera.nif", "Meshes/FPVDrone/drone_hand.nif",
    "Meshes/FPVDrone/drone_static.nif", "Textures/FPVDrone/drone_d.dds",
    "Textures/FPVDrone/drone_n.dds", "Textures/FPVDrone/drone_s.dds",
    "Scripts/FPVDroneNative.pex", "Scripts/FPVDroneQuestScript.pex",
    "Scripts/FPVDronePlayerAlias.pex", "Scripts/FPVDroneReactions.pex",
    "Seq/FPVDrone.seq", "Sound/FX/FPVDrone/motor_loop.wav",
)
ADDON = ("F4SE/Plugins/FPVDroneViewmodel.dll", "Meshes/FPVDrone/drone_fpv.nif")
TREES = ("Source", "Tools", "Tests", ".github", "Optional")
FORBIDDEN = {"_build", "_analysis", "__pycache__", ".git", "node_modules"}
ROOT_FILES = (*CORE, *DOCS, ".gitignore", ".gitattributes")
ADDON_README = """# Experimental 3D FPV viewmodel (runtime 4)

Install FPVDrone-0.1.40.zip first, then this add-on with higher priority.
Requires Fallout 4 1.10.163 and the exact core flight DLL. No additional
runtime dependency is bundled or required. Geometry/material/ABI checks pass;
visible rendering of runtime 4 has not been confirmed in Fallout 4.

To disable, remove only FPVDroneViewmodel.dll and drone_fpv.nif supplied here,
or disable this separate mod in MO2. The core overlay is not replaced.
For source/build details see Source/Viewmodel/README.md in the source archive.
Code: MIT. Mesh: Kvasovich, CC BY 4.0; see CREDITS.md and ASSET_LICENSE.md.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_name(name: str) -> str:
    path = PurePosixPath(name)
    if (not name or "\\" in name or path.is_absolute() or ":" in name
            or ".." in path.parts or any(p in FORBIDDEN for p in path.parts)):
        raise ValueError(f"Unexpected package path: {name}")
    if path.suffix.lower() in {".log", ".fos", ".f4se", ".dmp", ".pyc", ".pyo"}:
        raise ValueError(f"Local/generated file in release: {name}")
    return name


def collect(root: Path) -> dict[str, Path]:
    files = {}
    for name in ROOT_FILES:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(path)
        files[name] = path
    for folder in TREES:
        base = root / folder
        if base.exists():
            for path in base.rglob("*"):
                if not path.is_file() or any(p in FORBIDDEN for p in path.relative_to(root).parts):
                    continue
                if path.suffix.lower() in {".pyc", ".pyo"}:
                    continue
                if path.is_symlink():
                    raise ValueError(f"Symlink not allowed in release inputs: {path}")
                name = safe_name(path.relative_to(root).as_posix())
                files[name] = path
    for name in ADDON:
        if (root / name).is_file():
            files[name] = root / name
    return files


def manifest_bytes(files: dict[str, bytes]) -> bytes:
    return "".join(f"{sha(data)}  {name}\n" for name, data in sorted(files.items())).encode("utf-8")


def parse_manifest(data: bytes) -> dict[str, str]:
    entries = {}
    for line in data.decode("utf-8-sig").splitlines():
        digest, name = line.split("  ", 1)
        safe_name(name)
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest) or name in entries:
            raise ValueError(f"Invalid/duplicate manifest entry: {line}")
        entries[name] = digest
    return entries


def verify_manifest(root: Path, manifest: str = MANIFEST) -> int:
    entries = parse_manifest((root / manifest).read_bytes())
    for name, digest in entries.items():
        if sha((root / name).read_bytes()) != digest:
            raise ValueError(f"Manifest mismatch: {name}")
    return len(entries)


def static_checks(root: Path) -> None:
    if sha((root / CORE[1]).read_bytes()) != NATIVE_SHA:
        raise ValueError("Original flight DLL differs from the supported 1.10.163 build")
    if sha((root / "Interface/FPVDroneOverlay.swf").read_bytes()) != OVERLAY_SHA:
        raise ValueError("Core overlay must be the original empty host")
    json.loads((root / "MCM/Config/FPVDrone/config.json").read_text(encoding="utf-8-sig"))
    verify_manifest(root, "Tests/Fixtures/FILE_MANIFEST.sha256")
    obsolete = [root / "Source/Visuals", root / "Tools/build_fpv_visuals.py",
                root / "Tools/render_fpv_parts.py", root / "Tools/inspect_visual_model.py"]
    if any(path.exists() for path in obsolete):
        raise ValueError("Obsolete flat-visual build pipeline is still present")


def pex_tests(root: Path) -> dict[str, int]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to validate the shipped PEX")
    candidate = root / "_build/launch_transition/candidate"
    candidate.mkdir(parents=True, exist_ok=True)
    for source, name in (("Scripts/FPVDroneQuestScript.pex", "FPVDroneQuestScript.pex"),
                         ("FPVDrone.esp", "FPVDrone.esp")):
        shutil.copyfile(root / source, candidate / name)
    script_files = sorted((root / "Scripts").glob("*.pex"))
    subprocess.run([node, str(root / "Tools/pex.js"), *map(str, script_files)],
                   cwd=root, check=True, capture_output=True, text=True)
    results = {}
    for tool in ("test_launch_transition.js", "test_controller_menu.js"):
        result = subprocess.run([node, str(root / "Tools" / tool)], cwd=root,
                                check=True, capture_output=True, text=True)
        report = json.loads(result.stdout)
        results[tool] = report["testsPassed"]
        (root / "_build/launch_transition" / (tool + ".json")).write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return results


def zip_bytes(path: Path, files: dict[str, bytes]) -> None:
    payload = dict(files)
    payload[MANIFEST] = manifest_bytes(files)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(payload.items()):
            safe_name(name)
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    verify_zip(path)


def verify_zip(path: Path) -> int:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entry")
        for name in names:
            safe_name(name)
        entries = parse_manifest(archive.read(MANIFEST))
        if set(names) != set(entries) | {MANIFEST}:
            raise ValueError("ZIP file set does not match its manifest")
        for name, digest in entries.items():
            if sha(archive.read(name)) != digest:
                raise ValueError(f"ZIP checksum mismatch: {name}")
        if archive.testzip() is not None:
            raise ValueError("ZIP CRC failure")
        return len(entries)


def package(root: Path, output: Path) -> dict:
    output = output.resolve()
    if not output.is_relative_to(root):
        raise ValueError("Release output must stay within the project directory")
    repo = output / "FPVDrone-GitHub"
    if repo.exists():
        raise FileExistsError(f"Refusing to overwrite an existing repository: {repo}; use another --output")
    output.mkdir(parents=True, exist_ok=True)
    inputs = collect(root)
    entries = {}
    for name, path in inputs.items():
        if name in ADDON:
            name = "Optional/Viewmodel/" + name
        entries[name] = path.read_bytes()
    for name in ADDON:
        target = "Optional/Viewmodel/" + name
        if target not in entries:
            raise FileNotFoundError(f"Optional build input is missing: {target}")
    entries["Optional/Viewmodel/README.md"] = ADDON_README.encode("utf-8")
    for name, data in entries.items():
        target = repo / safe_name(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (repo / MANIFEST).write_bytes(manifest_bytes(entries))
    verify_manifest(repo)

    core = {name: entries[name] for name in (*CORE, *DOCS)}
    addon = {name: entries["Optional/Viewmodel/" + name] for name in ADDON}
    addon.update({name: entries[name] for name in ("LICENSE", "ASSET_LICENSE.md", "CREDITS.md")})
    addon["README.md"] = ADDON_README.encode("utf-8")
    artifacts = {
        f"FPVDrone-{VERSION}.zip": core,
        f"FPVDrone-Viewmodel-{VERSION}-experimental.zip": addon,
        f"FPVDrone-{VERSION}-source.zip": entries,
    }
    sizes = {}
    for name, payload in artifacts.items():
        path = output / name
        zip_bytes(path, payload)
        sizes[name] = {"sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
                       "files": len(payload) + 1}
    (output / "SHA256SUMS").write_text("".join(
        f"{data['sha256']}  {name}\n" for name, data in sorted(sizes.items())), encoding="utf-8")
    (output / "RELEASE_NOTES.md").write_bytes(entries["RELEASE_NOTES.md"])
    return {"version": VERSION, "repository": str(repo), "artifacts": sizes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--refresh-manifest", action="store_true")
    parser.add_argument("--check", action="store_true", help="validate only, including shipped PEX tests")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.refresh_manifest:
        (root / MANIFEST).write_bytes(manifest_bytes({n: p.read_bytes() for n, p in collect(root).items()}))
    files = verify_manifest(root)
    static_checks(root)
    checks = pex_tests(root)
    report = {"manifestFiles": files, "checks": checks, "gameExecuted": False}
    if not args.check:
        output = args.output or Path("dist")
        if not output.is_absolute():
            output = root / output
        report.update(package(root, output))
        (output / "release-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
