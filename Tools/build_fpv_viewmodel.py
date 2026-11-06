"""Extract actual 3D parts from the installed drone NIF, retaining UVs/normals.

Requires the official PyNifly 29.1.0 Python/DLL layer, supplied with
--pynifly-root, FPV_PYNIFLY_ROOT, or the local _build/deps/pynifly fallback.
The original drone NIF/material/textures are read-only.
"""
from pathlib import Path
import argparse,os,sys,json,math,hashlib
from itertools import product
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'Tools'))
from model_geometry import load,islands

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pynifly-root',type=Path,default=Path(os.environ.get('FPV_PYNIFLY_ROOT',str(ROOT/'_build/deps/pynifly'))))
    parser.add_argument('--output-dir',type=Path,default=ROOT/'_build/visuals3d')
    args=parser.parse_args()
    sys.path.insert(0,str(args.pynifly_root.resolve()))
    from pyn.pynifly import NifFile
    from pyn.nifdefs import PynBufferTypes
    from pyn.nifconstants import ShaderFlags1FO4,ShaderFlags2FO4,VertexFlags
    source=ROOT/'Meshes/FPVDrone/drone_static.nif'; original=digest(source)
    nif=NifFile(str(source)); shape=nif.shapes[0]
    verts,tris,uvs,normals=shape.verts,shape.tris,shape.uvs,shape.normals
    positions,_,faces=load(); groups=islands(positions,faces)
    center=tuple((min(p[k] for p in positions)+max(p[k] for p in positions))/2 for k in range(3))
    scale=.32*70/max(max(p[k] for p in positions)-min(p[k] for p in positions) for k in (0,2))
    lookup={}; spatial={}
    for group_id,group in enumerate(groups):
        for f in group:
            for t in f:
                p=positions[t[0]]
                lookup[tuple(round(c,5) for c in p)]=group_id
                key=tuple(round(c*10000) for c in p)
                spatial.setdefault(key,{})[p]=group_id
    membership=[]
    for x,y,z in verts:
        point=(-x/scale+center[0],z/scale+center[1],y/scale+center[2])
        key=tuple(round(c,5) for c in point)
        if key not in lookup:
            coarse=tuple(round(c*10000) for c in point); candidates=[]
            for step in product((-1,0,1),repeat=3):
                candidates.extend(spatial.get(tuple(coarse[k]+step[k] for k in range(3)),{}).items())
            assert candidates,point
            closest,group_id=min(candidates,key=lambda item:sum((item[0][k]-point[k])**2 for k in range(3)))
            assert sum((closest[k]-point[k])**2 for k in range(3))<.00015**2
            membership.append(group_id)
        else: membership.append(lookup[key])
    outdir=args.output_dir; outdir.mkdir(exist_ok=True,parents=True)
    target=outdir/'drone_fpv.nif'; result=NifFile()
    # Own BSFadeNode light data: the actor is SetAlpha(0) by Papyrus, so the
    # viewmodel must be a separate rendered scene sibling, not its child.
    result.initialize('FO4',str(target),root_type='BSFadeNode',root_name='FPVDroneViewmodel')
    report=[]; expected={}
    # Body coordinates are right=X, forward=Y, up=Z. Parts are centered around
    # their own pivots; the native renderer supplies camera-relative placement.
    components=[('FPVLeftMotor',6,(.0891,0,.09215)),('FPVRightMotor',5,(-.0899,0,.09215)),
                ('FPVLeftRotor',11,(.0891,.009,.09215)),('FPVRightRotor',9,(-.0899,.009,.09215)),
                ('FPVCharge',14,(-.00045,-.04435,.01865))]
    for name,part,pivot in components:
        selected=[f for f in tris if all(membership[i]==part for i in f)]
        assert len(selected)>400,(name,len(selected))
        indices=sorted({i for f in selected for i in f}); remap={old:new for new,old in enumerate(indices)}
        # Keep dimensions in source metres so the runtime can adjust size to
        # the real camera frustum without deforming any component.
        local=[]
        for i in indices:
            x,y,z=verts[i]
            p=(-x/scale+center[0],z/scale+center[1],y/scale+center[2])
            local.append((-(p[0]-pivot[0]),p[2]-pivot[2],p[1]-pivot[1]))
        new=result.createShapeFromData(name,local,[tuple(remap[i] for i in f) for f in selected],
            [uvs[i] for i in indices],[normals[i] for i in indices],use_type=PynBufferTypes.BSTriShapeBufType)
        shader=new.shader; p=shader.properties
        p.Shader_Flags_1=int(ShaderFlags1FO4.SPECULAR|ShaderFlags1FO4.ZBUFFER_TEST)
        p.Shader_Flags_2=int(ShaderFlags2FO4.ZBUFFER_WRITE)
        p.Alpha=1; p.UV_Scale_U=p.UV_Scale_V=1
        p.Spec_Color[:]=(1,1,1); p.Spec_Str=1; p.Glossiness=1; p.Emissive_Mult=0
        shader.name=r'Materials\FPVDrone\drone.bgsm'
        for slot,texture in [('Diffuse','drone_d.dds'),('Normal','drone_n.dds'),('Specular','drone_s.dds')]:
            new.set_texture(slot,'Textures\\FPVDrone\\'+texture)
        new.save_shader_attributes()
        expected[name]={'vertices':local,'uvs':[uvs[i] for i in indices],'normals':[normals[i] for i in indices]}
        report.append({'name':name,'vertices':len(indices),'triangles':len(selected),'sourceIsland':part,'pivot':pivot})
    result.save()
    check=NifFile(str(target)); assert len(check.shapes)==5 and check.root.blockname=='BSFadeNode'
    for part in check.shapes:
        assert not part.skin_instance_name
        assert part.shader.name.lower()==r'materials\fpvdrone\drone.bgsm'
        assert int(part.properties.vertexDesc)&int(VertexFlags.NORMAL)
        assert int(part.properties.vertexDesc)&int(VertexFlags.TANGENT)
        entry=next(x for x in report if x['name']==part.name)
        assert len(part.verts)==entry['vertices'] and len(part.tris)==entry['triangles']
        data=expected[part.name]
        uv_error=max(abs(a-b) for aa,bb in zip(part.uvs,data['uvs']) for a,b in zip(aa,bb))
        position_error=max(abs(a-b) for aa,bb in zip(part.verts,data['vertices']) for a,b in zip(aa,bb))
        normal_cosine=min(sum(a*b for a,b in zip(aa,bb))/math.sqrt(sum(a*a for a in aa)*sum(b*b for b in bb)) for aa,bb in zip(part.normals,data['normals']))
        assert uv_error<.0001 and position_error<.00015 and normal_cosine>.999
        entry.update({'maximumUVError':uv_error,'maximumPositionError':position_error,'minimumNormalCosine':normal_cosine})
    assert digest(source)==original
    report={'sourceNifSHA256':original,'outputSHA256':digest(target),'parts':report,
        'material':'Materials/FPVDrone/drone.bgsm','textures':'original diffuse/normal/specular DDS; unchanged',
        'skinned':False,'collision':False,'inGameTested':False}
    (outdir/'mesh_report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
