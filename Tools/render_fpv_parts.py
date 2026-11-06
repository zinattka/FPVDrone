"""Bake first-person sprites from the credited source mesh, not game screenshots.

Requires Python 3 + Pillow. Model geometry is measured in source metres. This
is a camera decoration: its lighting is baked and it does not change world NIFs.
"""
from pathlib import Path
import math
import json
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '_build/deps/python'))
from PIL import Image, ImageDraw, ImageChops
from inspect_visual_model import load
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Source/Visuals/frames'
FRAMES = 24

def islands(v, faces):
    parent = list(range(len(v)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    positions = {}
    for i,p in enumerate(v):
        key = tuple(round(x,5) for x in p)
        if key in positions: parent[find(i)] = find(positions[key])
        positions[key] = i
    for f in faces:
        for t in f[1:]: parent[find(t[0])] = find(f[0][0])
    groups = {}
    for f in faces: groups.setdefault(find(f[0][0]),[]).append(f)
    return sorted(groups.values(), key=len, reverse=True)

def normal(points):
    a,b = [[points[j][k]-points[0][k] for k in range(3)] for j in (1,2)]
    n = (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    length=math.sqrt(sum(x*x for x in n)) or 1
    return tuple(x/length for x in n)

def render(v,uv,faces,project,size,texture):
    image = Image.new('RGBA',size)
    pix=image.load(); tex=texture.load(); depth=[-float('inf')]*(size[0]*size[1])
    for f in faces:
        pts=[v[t[0]] for t in f]; screen=[project(p) for p in pts]
        if any(p is None for p in screen): continue
        (ax,ay,az),(bx,by,bz),(cx,cy,cz)=screen
        det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(det)<1e-7: continue
        xmin=max(0,math.floor(min(ax,bx,cx))); xmax=min(size[0]-1,math.ceil(max(ax,bx,cx)))
        ymin=max(0,math.floor(min(ay,by,cy))); ymax=min(size[1]-1,math.ceil(max(ay,by,cy)))
        n=normal(pts); shade=.58+.42*abs(n[0]*.3+n[1]*.86-n[2]*.41)
        ta,tb,tc=[uv[t[1]] for t in f]
        for y in range(ymin,ymax+1):
            for x in range(xmin,xmax+1):
                wa=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/det
                wb=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/det
                wc=1-wa-wb
                if min(wa,wb,wc)<-1e-6: continue
                z=wa*az+wb*bz+wc*cz; at=y*size[0]+x
                if z<=depth[at]: continue
                depth[at]=z
                # The perspective projection returns inverse depth.
                weights=(wa*az/z,wb*bz/z,wc*cz/z) if getattr(project,'perspective',False) else (wa,wb,wc)
                u=sum(t[0]*w for t,w in zip((ta,tb,tc),weights)); vv=sum(t[1]*w for t,w in zip((ta,tb,tc),weights))
                color=tex[max(0,min(texture.width-1,int(u*(texture.width-1)))),max(0,min(texture.height-1,int((1-vv)*(texture.height-1))))]
                pix[x,y]=tuple(min(255,int(c*shade)) for c in color[:3])+(255,)
    return image

def clip_near(v,uv,faces,depth,near):
    vertices,coords,triangles=[],[],[]
    for face in faces:
        polygon=[(v[t[0]],uv[t[1]]) for t in face]; clipped=[]
        for i,current in enumerate(polygon):
            previous=polygon[i-1]; da=depth(previous[0]); db=depth(current[0])
            if (da>=near)!=(db>=near):
                f=(near-da)/(db-da)
                clipped.append((tuple(a+(b-a)*f for a,b in zip(previous[0],current[0])),tuple(a+(b-a)*f for a,b in zip(previous[1],current[1]))))
            if db>=near: clipped.append(current)
        indices=[]
        for p,t in clipped:
            index=len(vertices); vertices.append(p); coords.append(t); indices.append((index,index))
        for i in range(1,len(indices)-1): triangles.append((indices[0],indices[i],indices[i+1]))
    return vertices,coords,triangles

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    v,uv,faces=load(); groups=islands(v,faces)
    assert len(groups[14])==512 and len(groups[9])==534 and len(groups[11])==534
    texture=Image.open(ROOT/'Source/Visuals/model/drone_basecolor.png').convert('RGB')
    # Nose extends into the lower centre. Exclude the portion behind the lens.
    def warhead(p):
        x,y,z=p[0]+.00045,p[1]-.025,p[2]-.012
        yy=y*math.cos(.07)-z*math.sin(.07); zz=y*math.sin(.07)+z*math.cos(.07)
        if zz<.024999: return None
        return 512+270*x/zz,420-270*yy/zz,1/zz
    warhead.perspective=True
    def camera_depth(p): return (p[1]-.025)*math.sin(.07)+(p[2]-.012)*math.cos(.07)
    cv,ct,cf=clip_near(v,uv,groups[14],camera_depth,.025)
    static=render(cv,ct,cf,warhead,(1024,768),texture)
    # Front motor housings: same local lens perspective as each propeller.
    for island,cx,cz,sx in [(5,-.0899,.09215,18),(6,.0891,.09215,1006)]:
        def project(p,cx=cx,cz=cz,sx=sx):
            return sx+(p[0]-cx)*1900,455-(p[1]*.97+(p[2]-cz)*.22)*1900,p[1]*.22-(p[2]-cz)*.97
        static.alpha_composite(render(v,uv,groups[island],project,(1024,768),texture))
    # Crop all static art to the lower part; keeps the bitmap allocation small.
    static.crop((0,400,1024,768)).save(OUT/'hardware.png')
    for frame in range(FRAMES):
        combined=Image.new('RGBA',(1024,128))
        for island,cx,cz,sx,direction in [(9,-.0899,.09215,18,1),(11,.0891,.09215,1006,-1)]:
            blur=None
            for sample in range(9):
                angle=direction*math.radians(frame*120/FRAMES+(sample-4)*5)
                co,si=math.cos(angle),math.sin(angle)
                def project(p):
                    x,z=p[0]-cx,p[2]-cz
                    rx,rz=x*co-z*si,x*si+z*co
                    return sx+rx*1900,52-(p[1]*.97+rz*.22)*1900,p[1]*.22-rz*.97
                # Opaque black blades retain the original texture and shape;
                # premultiplied blending below models exposure over rotation.
                part=render(v,uv,groups[island],project,(1024,128),texture)
                premul=part.convert('RGBa')
                blur=premul if blur is None else Image.blend(blur,premul,1/(sample+1))
            part=blur.convert('RGBA')
            combined.alpha_composite(part)
        combined.save(OUT/f'rotors_{frame:02}.png')
    (OUT/'layout.json').write_text(json.dumps({'width':1024,'height':768,'fps':60,'frames':FRAMES,
        'hardware':{'file':'hardware.png','x':0,'y':400},'rotors':{'pattern':'rotors_%02d.png','x':0,'y':400},
        'rotation':'opposite directions; 45 degree shutter; fixed visual cycle, independent of flight physics'},indent=2)+'\n')
    preview=static.copy(); preview.alpha_composite(Image.open(OUT/'rotors_00.png'),(0,400))
    preview.save(ROOT/'_build/visuals/parts.png')
    print(f'Baked {FRAMES} rotor frames and textured hardware')

if __name__=='__main__': main()
