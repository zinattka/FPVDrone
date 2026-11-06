"""Build the FPV camera decoration SWF without an external AS3 compiler.

Pillow is required only to decode the checked-in source PNGs. Emits standard
SWF15 solid-fill DefineShape3 / DefineSprite and ABC46.16. No bitmap/image
resources are emitted: the first bitmap build produced a green rectangle in
the user's Fallout 4 runtime despite passing Ruffle. The ABC
implements Source/Visuals/FPVDroneVisual.as. No native offsets or DLL changes.
Format: Adobe SWF v10 and AVM2 Overview specifications.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'_build/deps/python'))
from PIL import Image
from fpv_vector_shapes import encode
ROOT=Path(__file__).resolve().parents[1]
FRAMES=ROOT/'Source/Visuals/frames'
OUT=ROOT/'_build/visuals'

def u16(n): return struct.pack('<H',n)
def u32(n): return struct.pack('<I',n)
def u30(n):
    assert 0<=n<1<<30
    data=bytearray()
    while n>=128: data.append((n&127)|128); n>>=7
    data.append(n)
    return bytes(data)

class Bits:
    def __init__(self): self.bits=''
    def put(self,n,size): self.bits+=format(n&((1<<size)-1),f'0{size}b')
    def bytes(self):
        b=self.bits+'0'*(-len(self.bits)%8)
        return int(b,2).to_bytes(len(b)//8,'big') if b else b''

def signed_size(values): return max(max(1,abs(x).bit_length()+1) for x in values)
def rect(width,height):
    b=Bits(); values=[0,width*20,0,height*20]; n=signed_size(values)
    b.put(n,5)
    for v in values: b.put(v,n)
    return b.bytes()
def matrix(x=0,y=0,scale=None):
    b=Bits(); b.put(scale is not None,1)
    if scale is not None:
        v=round(scale*65536); n=signed_size([v]); b.put(n,5); b.put(v,n); b.put(v,n)
    b.put(0,1); values=[round(x*20),round(y*20)]; n=signed_size(values)
    b.put(n,5)
    for v in values: b.put(v,n)
    return b.bytes()
def tag(kind,data=b''):
    return u16((kind<<6)|min(len(data),63))+(u32(len(data)) if len(data)>=63 else b'')+data
def place(character,depth,x=0,y=0,name=None,move=False):
    flags=0x02|0x04|(0x20 if name else 0)|(1 if move else 0)
    return tag(26,bytes([flags])+u16(depth)+u16(character)+matrix(x,y)+(name.encode()+b'\0' if name else b''))

_vector_cache={}
def vector(image,shape_id):
    # Production and test hosts share identical shapes. Trace once per build.
    key=(shape_id,image.size,image.tobytes())
    if key not in _vector_cache:
        _vector_cache[key]=encode(image,shape_id,Bits,u16,rect,tag,signed_size)
    return _vector_cache[key][0]

class Code:
    def __init__(self,mn,strings): self.data=bytearray(); self.labels={}; self.fix=[]; self.mn=mn; self.strings=strings
    def op(self,opcode,*args):
        self.data.append(opcode)
        for n in args: self.data.extend(u30(n))
        return self
    def prop(self,opcode,name,*args): return self.op(opcode,self.mn[name],*args)
    def string(self,s): return self.op(0x2c,self.strings[s])
    def jump(self,opcode,label):
        self.data.append(opcode); self.fix.append((len(self.data),label)); self.data.extend(b'\0'*3)
    def label(self,name): self.labels[name]=len(self.data)
    def finish(self):
        for at,label in self.fix:
            n=self.labels[label]-(at+3); self.data[at:at+3]=(n&0xffffff).to_bytes(3,'little')
        return bytes(self.data)

def abc():
    strings=['','flash.display','flash.events','FPVDroneVisual','MovieClip','Object','EventDispatcher',
        'DisplayObject','InteractiveObject','DisplayObjectContainer','Sprite','root','visible','mouseEnabled',
        'mouseChildren','addEventListener','removeEventListener','getChildByName','addChildAt','onFrame',
        'enterFrame','FPVDroneCanvas','FPVDroneThrottle','fpvView']
    si={s:i for i,s in enumerate(strings)}
    names=['FPVDroneVisual','MovieClip','Object','EventDispatcher','DisplayObject','InteractiveObject',
        'DisplayObjectContainer','Sprite','root','visible','mouseEnabled','mouseChildren','addEventListener',
        'removeEventListener','getChildByName','addChildAt','onFrame']
    mn={s:i+1 for i,s in enumerate(names)}
    out=struct.pack('<HH',16,46)+b'\x01'*3 # integer,uint,double pools
    out+=u30(len(strings))+b''.join(u30(len(s.encode()))+s.encode() for s in strings[1:])
    out+=u30(4)+b'\x16'+u30(0)+b'\x16'+u30(si['flash.display'])+b'\x16'+u30(si['flash.events'])
    out+=u30(1) # empty namespace set pool
    out+=u30(len(names)+1)
    for name in names:
        namespace=2 if name in ['MovieClip','DisplayObject','InteractiveObject','DisplayObjectContainer','Sprite'] else 3 if name=='EventDispatcher' else 1
        out+=b'\x07'+u30(namespace)+u30(si[name])
    out+=u30(4) # constructor, enterFrame method, class initializer, script initializer
    for params in [0,1,0,0]: out+=u30(params)+u30(0)+b'\0'*params+u30(0)+b'\0'
    out+=u30(0)+u30(1) # no metadata, one class
    out+=u30(mn['FPVDroneVisual'])+u30(mn['MovieClip'])+b'\0'+u30(0)+u30(0)+u30(1)
    out+=u30(mn['onFrame'])+b'\x01'+u30(0)+u30(1) # public method trait
    out+=u30(2)+u30(0) # class_info cinit, traits
    out+=u30(1)+u30(3)+u30(1)+u30(mn['FPVDroneVisual'])+b'\x04'+u30(1)+u30(0)
    bodies=[]
    ctor=Code(mn,si); ctor.op(0xd0).op(0x30).op(0xd0).op(0x49,0)
    for name in ['visible','mouseEnabled','mouseChildren']: ctor.op(0xd0).op(0x27).prop(0x61,name)
    ctor.op(0xd0).string('enterFrame').op(0xd0).prop(0x66,'onFrame').prop(0x4f,'addEventListener',2).op(0x47)
    bodies.append((0,3,1,9,10,ctor.finish()))
    tick=Code(mn,si); tick.op(0xd0).op(0x30).op(0xd0).prop(0x66,'root').op(0xd6)
    tick.op(0xd2); tick.jump(0x12,'end')
    for name in ['FPVDroneCanvas','FPVDroneThrottle','fpvView']:
        tick.op(0xd2).string(name).prop(0x46,'getChildByName',1).op(0xd6)
        tick.op(0xd2); tick.jump(0x12,'end')
    tick.op(0xd2).op(0xd0).op(0x24,0).prop(0x4f,'addChildAt',2)
    tick.op(0xd0).op(0x26).prop(0x61,'visible')
    tick.op(0xd0).string('enterFrame').op(0xd0).prop(0x66,'onFrame').prop(0x4f,'removeEventListener',2)
    tick.label('end'); tick.op(0x47)
    bodies.append((1,3,3,9,10,tick.finish()))
    bodies.append((2,1,1,8,9,b'\xd0\x30\x47'))
    init=Code(mn,si); init.op(0xd0).op(0x30).op(0x65,0) # getscopeobject global
    bases=['Object','EventDispatcher','DisplayObject','InteractiveObject','DisplayObjectContainer','Sprite','MovieClip']
    for base in bases:
        init.prop(0x60,base)
        if base=='MovieClip': init.op(0x2a)
        init.op(0x30)
    init.op(0x58,0)
    for _ in bases: init.op(0x1d)
    init.prop(0x68,'FPVDroneVisual').op(0x47)
    bodies.append((3,3,1,0,8,init.finish()))
    out+=u30(len(bodies))
    for method,stack,locals_,scope,maxscope,code in bodies:
        out+=b''.join(u30(n) for n in [method,stack,locals_,scope,maxscope,len(code)])+code+u30(0)+u30(0)
    return out,{'strings':strings,'multinames':names,'bodies':[{'method':m,'maxStack':s,'locals':l,'initialScope':i,'maxScope':x,'code':c.hex()} for m,s,l,i,x,c in bodies]}

def build(test_host=False):
    config=json.loads((FRAMES/'layout.json').read_text()); bytecode,debug=abc()
    definitions=vector(Image.open(FRAMES/'hardware.png'),11)
    for i in range(config['frames']): definitions+=vector(Image.open(FRAMES/f'rotors_{i:02}.png'),200+i)
    if test_host:
        # Reproduce only the native display hierarchy, so Ruffle can execute
        # the real attachment bytecode without Fallout/F4SE.
        if test_host=='lost': definitions+=vector(Image.new('RGBA',(1024,768),(112,119,130,255)),61)
        canvas=tag(39,u16(4)+u16(1)+(place(61,1,name='fpvSignalVeil') if test_host=='lost' else b'')+tag(1)+tag(0))
        view_placement=place(4,1,name='fpvView')
        if test_host=='scaled':
            view_placement=tag(26,b'\x26'+u16(1)+u16(4)+matrix(256,192,scale=.5)+b'fpvView\0')
        if test_host=='hidden':
            b=Bits(); b.put(0,1); b.put(1,1); b.put(10,4)
            for n in [256,256,256,0]: b.put(n,10)
            view_placement=tag(26,b'\x2e'+u16(1)+u16(4)+matrix()+b.bytes()+b'fpvView\0')
        canvas+=tag(39,u16(3)+u16(1)+view_placement+tag(1)+tag(0))
        canvas+=tag(39,u16(1)+u16(1)+place(3,1,name='FPVDroneThrottle')+tag(1)+tag(0))
    else:
        canvas=tag(39,u16(1)+u16(1)+tag(1)+tag(0))
    timeline=place(11,1,0,400,'fpvHardware')
    for i in range(config['frames']):
        timeline+=place(200+i,2,0,400,'fpvRotors' if i==0 else None,move=i!=0)+tag(1)
    visual=tag(39,u16(2)+u16(config['frames'])+timeline+tag(0))
    body=rect(1024 if test_host else 1280,768 if test_host else 720)+u16(config['fps']*256)+u16(1)
    body+=tag(69,u32(8))+tag(82,u32(0)+b'FPVDroneOverlay\0'+bytecode)+definitions+canvas+visual
    body+=tag(76,u16(1)+u16(2)+b'FPVDroneVisual\0')
    # Keep the native display-list contract root1.FPVDroneCanvas unchanged.
    body+=place(1,1,name='FPVDroneCanvas')+place(2,2,name='FPVDroneVisual')+tag(1)+tag(0)
    return b'FWS\x0f'+u32(len(body)+8)+body,debug

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--install',action='store_true'); args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    swf,debug=build(); target=OUT/'FPVDroneOverlay.swf'; target.write_bytes(swf)
    for mode in ['normal','hidden','lost','scaled']:
        (OUT/f'visual_test_{mode}.swf').write_bytes(build(test_host=mode)[0])
    (OUT/'visual_abc.json').write_text(json.dumps(debug,indent=2)+'\n')
    (OUT/'vector_shapes.json').write_text(json.dumps([v[1] for v in _vector_cache.values()],indent=2)+'\n')
    print(json.dumps({'output':str(target),'bytes':len(swf),'sha256':hashlib.sha256(swf).hexdigest()}))
    if args.install:
        if (ROOT/'F4SE/Plugins/FPVDroneViewmodel.dll').exists():
            raise RuntimeError('The 3D viewmodel is installed. Use install_fpv_viewmodel.ps1 -RestoreVector to avoid duplicate hardware layers.')
        report_path=OUT/'test_report.json'
        if not report_path.exists(): raise RuntimeError('Run the SWF renderer and test_fpv_visuals.py before installation')
        report=json.loads(report_path.read_text())
        if report.get('result')!='pass' or report.get('swfSHA256')!=hashlib.sha256(swf).hexdigest():
            raise RuntimeError('Validation does not match the current SWF; rerun preview and tests')
        # The original is preserved once. Never replace the rollback with a modified build.
        destination=ROOT/'Interface/FPVDroneOverlay.swf'; backup=OUT/'FPVDroneOverlay.original.swf'
        if not backup.exists(): backup.write_bytes(destination.read_bytes())
        destination.write_bytes(swf)
        print('Installed camera-only visual overlay')

if __name__=='__main__': main()
