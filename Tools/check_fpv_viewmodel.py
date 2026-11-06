"""Independent binary/mesh/ABI checks; never executes Fallout's game code."""
from pathlib import Path
import ctypes,hashlib,json,re,sys,struct
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'_build/visuals3d'
sys.path[:0]=[str(ROOT/'_analysis'),str(ROOT/'_build/deps/pynifly')]
from visual_3d_engine_probe import PE,Cs,CS_ARCH_X86,CS_MODE_64
from capstone.x86 import X86_OP_MEM,X86_REG_RIP,X86_GRP_JUMP,X86_GRP_CALL
from pyn.pynifly import NifFile
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
checks=[]
def check(ok,text):assert ok,text;checks.append(text)
def main():
    source=(ROOT/'Source/Viewmodel/viewmodel.cpp').read_text()
    def constant(name):return int(re.search(r'\b'+name+r'=(0x[0-9a-f]+)',source)[1],16)
    def signature(name):return bytes(int(v.strip(),0) for v in re.search(name+r'\[\]=\{([^}]+)',source)[1].split(','))
    game=PE('C:/Games/Fallout 4/Fallout4.exe');native=PE(ROOT/'F4SE/Plugins/FPVDroneNative.dll')
    check(sha(ROOT/'F4SE/Plugins/FPVDroneNative.dll')=='5ae7afd93592faa14494ce22f4f9491e2e57d6bc2ce22696ba77948b6a5af6c9','original flight DLL pinned')
    dis=Cs(CS_ARCH_X86,CS_MODE_64);dis.detail=True
    for name in ['Frame','End']:
        sig=signature('k'+name+'Bytes');rva=constant('k'+name)
        check(native.bytes(rva,len(sig))==sig,name+' callback prologue matches disk')
        instructions=list(dis.disasm(sig,rva))
        check(sum(i.size for i in instructions)==len(sig),name+' trampoline copies complete instructions')
        check(not any(i.group(X86_GRP_JUMP) or i.group(X86_GRP_CALL) or any(o.type==X86_OP_MEM and o.mem.base==X86_REG_RIP for o in i.operands) for i in instructions),name+' copied prologue has no PC-relative operands')
    for name in ['Demand','Scene','Clone','MaterialCtor','MaterialDtor','MaterialLoad','MaterialApply']:
        sig=signature('k'+name+'Bytes');rva=constant('kSceneUpdate' if name=='Scene' else 'k'+name)
        check(game.bytes(rva,len(sig))==sig,name+' engine function signature matches installed executable')
    check(constant('kThrottle')==0x1e3b0+0x34,'throttle uses the validated controller flight-state layout')
    mesh=NifFile(str(OUT/'drone_fpv.nif'));report=json.loads((OUT/'mesh_report.json').read_text())
    check(sha(OUT/'drone_fpv.nif')==report['outputSHA256'],'candidate mesh matches extraction report')
    check(len(mesh.shapes)==5 and mesh.root.name=='FPVDroneViewmodel','five original 3D parts under private root')
    check(mesh.root.blockname=='BSFadeNode','standalone fade/light root isolated from hidden actor')
    for part in mesh.shapes:
        entry=next(e for e in report['parts'] if e['name']==part.name)
        check(len(part.tris)==entry['triangles'],part.name+' retains all source triangles')
        check(not part.skin_instance_name,part.name+' is independently transformable geometry')
        check(part.shader.name.lower()==r'materials\fpvdrone\drone.bgsm',part.name+' uses original game material')
        check(len(part.uvs)==len(part.verts) and len(part.normals)==len(part.verts),part.name+' retains full UV and normal attributes')
    # Load only our standalone DLL and call the public F4SE Query ABI. No
    # listener is dispatched and no game/native runtime function executes.
    class API(ctypes.Structure):_fields_=[('version',ctypes.c_uint32),('runtime',ctypes.c_uint32),('editorVersion',ctypes.c_uint32),('editor',ctypes.c_uint32),('query',ctypes.c_void_p),('handle',ctypes.c_void_p),('release',ctypes.c_void_p),('info',ctypes.c_void_p)]
    class Info(ctypes.Structure):_fields_=[('version',ctypes.c_uint32),('name',ctypes.c_char_p),('pluginVersion',ctypes.c_uint32)]
    dll=ctypes.WinDLL(str(OUT/'FPVDroneViewmodel.dll'))
    query=dll.F4SEPlugin_Query;query.argtypes=[ctypes.POINTER(API),ctypes.POINTER(Info)];query.restype=ctypes.c_bool
    api=API();api.runtime=0x010a0a30;info=Info()
    check(query(ctypes.byref(api),ctypes.byref(info)) and info.name==b'FPVDroneViewmodel' and info.pluginVersion==4,'compiled DLL exports correct old-gen Query ABI and version 4')
    api.runtime=0x010a3d80;check(not query(ctypes.byref(api),ctypes.byref(info)),'next-gen runtime rejected')
    api.runtime=0x010a0a30;api.editor=1;check(not query(ctypes.byref(api),ctypes.byref(info)),'editor runtime rejected')
    output={'result':'pass','assertions':len(checks),'checks':checks,'dllSHA256':sha(OUT/'FPVDroneViewmodel.dll'),
        'meshSHA256':sha(OUT/'drone_fpv.nif'),'gameExecuted':False,'inGameTested':False}
    (OUT/'binary_report.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps(output,indent=2))
if __name__=='__main__':main()
