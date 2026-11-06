"""Small read-only PE image reader for binary signature checks."""
from pathlib import Path
import struct


class PEImage:
    def __init__(self, path):
        self.raw = Path(path).read_bytes()
        data = self.raw
        if len(data) < 64 or data[:2] != b"MZ":
            raise ValueError(f"Not a PE image: {path}")
        pe = struct.unpack_from("<I", data, 0x3C)[0]
        if pe + 24 > len(data) or data[pe:pe + 4] != b"PE\0\0":
            raise ValueError(f"Invalid PE header: {path}")
        count = struct.unpack_from("<H", data, pe + 6)[0]
        optional_size = struct.unpack_from("<H", data, pe + 20)[0]
        optional = pe + 24
        sections = optional + optional_size
        if optional_size < 32 or sections + count * 40 > len(data):
            raise ValueError(f"Truncated PE headers: {path}")
        if struct.unpack_from("<H", data, optional)[0] != 0x20B:
            raise ValueError(f"Expected a PE32+ image: {path}")
        self.base = struct.unpack_from("<Q", data, optional + 24)[0]
        self.sections = []
        for index in range(count):
            at = sections + index * 40
            _, virtual, size, offset = struct.unpack_from("<IIII", data, at + 8)
            if offset + size > len(data):
                raise ValueError(f"Truncated PE section: {path}")
            self.sections.append((virtual, size, offset))

    def bytes(self, rva, size):
        if rva < 0 or size < 0:
            raise ValueError("Negative PE read")
        for virtual, raw_size, offset in self.sections:
            if virtual <= rva and rva + size <= virtual + raw_size:
                start = offset + rva - virtual
                return self.raw[start:start + size]
        raise ValueError(f"RVA outside file-backed PE sections: {rva:#x}+{size:#x}")
