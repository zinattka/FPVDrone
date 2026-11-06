# Compiled regression fixtures

The 0.1.35 and 0.1.36 quest PEX files are frozen comparison data for
`Tools/test_launch_transition.js`. They verify that diagnostic and gamepad
hooks preserve the original instructions and relocated branches outside their
specified insertion points.

They were copied byte-for-byte from verified local release backups. Keep them
in source checkouts; they are not build output and must not be installed into
Fallout 4. Installable archives use only the current root `Scripts` files.

[FILE_MANIFEST.sha256](FILE_MANIFEST.sha256) covers these comparison files and
the [0.1.28 binary build inputs](../../Source/Legacy/README.md). Its paths are
relative to the repository root. The original source loss and retained native
binary are documented with those build inputs.
