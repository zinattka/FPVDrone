"""Read the credited OBJ and find disconnected, position-welded components.

These standard-library helpers are shared by the optional 3D mesh builder.
They do not depend on the retired sprite/vector rendering pipeline.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path=None):
    vertices, uvs, faces = [], [], []
    source = Path(path) if path is not None else ROOT / "Source/Viewmodel/model/drone.obj"
    for line in source.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            vertices.append(tuple(map(float, fields[1:4])))
        if fields[0] == "vt":
            uvs.append(tuple(map(float, fields[1:3])))
        if fields[0] == "f":
            face = [tuple(int(n) - 1 for n in token.split("/")) for token in fields[1:]]
            for k in range(1, len(face) - 1):
                faces.append((face[0], face[k], face[k + 1]))
    return vertices, uvs, faces


def islands(vertices, faces):
    parent = list(range(len(vertices)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    positions = {}
    for index, point in enumerate(vertices):
        key = tuple(round(value, 5) for value in point)
        if key in positions:
            parent[find(index)] = find(positions[key])
        positions[key] = index
    for face in faces:
        for token in face[1:]:
            parent[find(token[0])] = find(face[0][0])
    groups = {}
    for face in faces:
        groups.setdefault(find(face[0][0]), []).append(face)
    return sorted(groups.values(), key=len, reverse=True)
