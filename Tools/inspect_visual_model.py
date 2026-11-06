"""Inspect disconnected source-model islands and render diagnostic views."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '_build/deps/python'))
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]

def load():
    vertices, uvs, faces = [], [], []
    for line in (ROOT / 'Source/Visuals/model/drone.obj').read_text().splitlines():
        f = line.split()
        if not f: continue
        if f[0] == 'v': vertices.append(tuple(map(float, f[1:4])))
        if f[0] == 'vt': uvs.append(tuple(map(float, f[1:3])))
        if f[0] == 'f':
            face = [tuple(int(n)-1 for n in t.split('/')) for t in f[1:]]
            for k in range(1, len(face)-1): faces.append((face[0],face[k],face[k+1]))
    return vertices, uvs, faces

if __name__ == '__main__':
    v, uv, f = load()
    parent = list(range(len(v)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    # OBJ repeats vertices across UV seams: weld by position for component inspection.
    positions = {}
    for i, p in enumerate(v):
        key = tuple(round(x,5) for x in p)
        if key in positions: parent[find(i)] = find(positions[key])
        positions[key] = i
    for face in f:
        for t in face[1:]: parent[find(t[0])] = find(face[0][0])
    groups = {}
    for face in f: groups.setdefault(find(face[0][0]), []).append(face)
    groups = sorted(groups.values(), key=len, reverse=True)
    report = []
    for i, group in enumerate(groups):
        pts = [v[t[0]] for face in group for t in face]
        report.append({'island':i, 'faces':len(group),'min':[round(min(p[k] for p in pts),4) for k in range(3)],'max':[round(max(p[k] for p in pts),4) for k in range(3)]})
    import json
    (ROOT/'_build/visuals/model_islands.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report[:35],indent=2))
    image = Image.new('RGB',(1500,900),'#22272d'); draw=ImageDraw.Draw(image)
    palette=['#c19766','#729b6d','#9c6366','#7196b4','#aea565','#9e7dba']
    for panel,(a,b) in enumerate([(0,1),(0,2),(2,1)]):
        for i,group in enumerate(groups):
            for face in group:
                pts=[(250+panel*500+v[t[0]][a]*110,480-v[t[0]][b]*110) for t in face]
                draw.polygon(pts,fill=palette[i%len(palette)])
        draw.text((panel*500+15,20),f'axes {a},{b}',fill='white')
    image.save(ROOT/'_build/visuals/model_axes.png')
