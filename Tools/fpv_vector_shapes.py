"""Trace rendered FPV parts into solid-colour SWF paths.

No bitmap fills, image characters, external texture files or gradient textures
are emitted. Quantized RGBA regions retain shading/rotor exposure transparency.
Contour loops use the SWF right-side fill convention, including hole boundaries.
"""
from collections import defaultdict

def trace(image):
    image=image.convert('RGBA'); w,h=image.size
    uniform=image.getcolors(1) is not None
    palette={}; cells=[]
    for r,g,b,a in image.getdata():
        # Low-alpha pixels are invisible in the reference but can create many
        # tiny paths. Snap the rest to a small, deterministic colour palette.
        if a<12: cells.append(None); continue
        color=(r,g,b,a) if uniform else tuple(min(255,((c+8)//16)*16) for c in (r,g,b,a))
        if color not in palette: palette[color]=len(palette)+1
        cells.append(palette[color])
    edges=defaultdict(set)
    for y in range(h):
        for x in range(w):
            at=y*w+x; color=cells[at]
            if color is None: continue
            if y==0 or cells[at-w]!=color: edges[color].add(((x,y),(x+1,y)))
            if x==w-1 or cells[at+1]!=color: edges[color].add(((x+1,y),(x+1,y+1)))
            if y==h-1 or cells[at+w]!=color: edges[color].add(((x+1,y+1),(x,y+1)))
            if x==0 or cells[at-1]!=color: edges[color].add(((x,y+1),(x,y)))
    paths=[]
    for color,boundary in sorted(edges.items()):
        nexts=defaultdict(set)
        for a,b in boundary: nexts[a].add(b)
        while nexts:
            start=min(nexts); current=start; previous=None; points=[]
            while True:
                choices=nexts[current]
                if previous is None: after=min(choices)
                else:
                    # At diagonal pixel contacts keep the interior on the
                    # right. A right turn takes precedence over straight/left.
                    dx,dy=current[0]-previous[0],current[1]-previous[1]
                    directions=[(-dy,dx),(dx,dy),(dy,-dx),(-dx,-dy)]
                    after=min(choices,key=lambda p:directions.index((p[0]-current[0],p[1]-current[1])))
                choices.remove(after)
                if not choices: del nexts[current]
                points.append(current); previous,current=current,after
                if current==start: break
            corners=[]
            for i,p in enumerate(points):
                a,b=points[i-1],points[(i+1)%len(points)]
                if (p[0]-a[0])*(b[1]-p[1]) != (p[1]-a[1])*(b[0]-p[0]): corners.append(p)
            if len(corners)>=3: paths.append((color,corners))
    return list(palette),paths

def encode(image,shape_id,Bits,u16,rect,tag,signed_size):
    colors,paths=trace(image); nfill=max(1,len(colors).bit_length())
    assert nfill<=15
    fills=(bytes([len(colors)]) if len(colors)<255 else b'\xff'+u16(len(colors)))
    fills+=b''.join(b'\0'+bytes(color) for color in colors)+b'\0' # no lines
    bits=Bits(); bits.put(nfill,4); bits.put(0,4)
    edge_count=0
    for fill,points in paths:
        bits.put(0,1); bits.put(0b00101,5) # move + fillStyle1
        x,y=points[0][0]*20,points[0][1]*20
        n=signed_size([x,y]); bits.put(n,5); bits.put(x,n); bits.put(y,n); bits.put(fill,nfill)
        for p in points[1:]+points[:1]:
            nx,ny=p[0]*20,p[1]*20; dx,dy=nx-x,ny-y
            n=max(2,signed_size([dx,dy])); assert n<=17
            bits.put(1,1); bits.put(1,1); bits.put(n-2,4)
            if dx and dy:
                bits.put(1,1); bits.put(dx,n); bits.put(dy,n)
            else:
                bits.put(0,1); bits.put(dx==0,1); bits.put(dy if dx==0 else dx,n)
            x,y=nx,ny; edge_count+=1
    bits.put(0,6)
    payload=u16(shape_id)+rect(*image.size)+fills+bits.bytes()
    return tag(32,payload),{'id':shape_id,'fills':len(colors),'paths':len(paths),'edges':edge_count,'bytes':len(payload)}
