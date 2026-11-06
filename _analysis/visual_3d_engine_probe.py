"""Read-only addresses/signatures for the 1.10.163 FPV viewmodel experiment."""
from pathlib import Path
import struct,json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'_build/deps/python'))
from capstone import Cs,CS_ARCH_X86,CS_MODE_64

class PE:
    def __init__(self,path):
        self.raw=Path(path).read_bytes(); b=self.raw
        pe=struct.unpack_from('<I',b,0x3c)[0]; count=struct.unpack_from('<H',b,pe+6)[0]; size=struct.unpack_from('<H',b,pe+20)[0]
        opt=pe+24; self.base=struct.unpack_from('<Q',b,opt+24)[0]; self.sections=[]
        for i in range(count):
            at=opt+size+i*40; vs,va,rs,rp=struct.unpack_from('<IIII',b,at+8)
            self.sections.append((va,rs,rp))
    def off(self,rva):
        for va,rs,rp in self.sections:
            if va<=rva<va+rs: return rp+rva-va
        raise ValueError(hex(rva))
    def bytes(self,rva,n): return self.raw[self.off(rva):self.off(rva)+n]

if __name__=='__main__':
    db=(ROOT.parent/'Address Library for F4SE Plugins/F4SE/Plugins/version-1-10-163-0.bin').read_bytes()
    count=struct.unpack_from('<Q',db)[0]; assert len(db)==8+count*16
    wanted={1225688,1066398}; found={}
    for at in range(8,len(db),16):
        id_,offset=struct.unpack_from('<QQ',db,at)
        if id_ in wanted: found[id_]=offset
    game=PE('C:/Games/Fallout 4/Fallout4.exe'); native=PE(ROOT/'F4SE/Plugins/FPVDroneNative.dll')
    dis=Cs(CS_ARCH_X86,CS_MODE_64)
    lines=[]
    for title,pe,start,size in [('native camera callback',native,0x12da0,0x140),('native callback tail',native,0x13fa0,0x3c4),('projection',game,0x1badc90,0x220)]+[(f'model Demand {id_}',game,offset,0x140) for id_,offset in found.items()]:
        lines.append(f'\n{title} RVA {start:x}')
        for ins in dis.disasm(pe.bytes(start,size),start): lines.append(f'{ins.address:08x} {ins.bytes.hex():30} {ins.mnemonic:10} {ins.op_str}')
    (ROOT/'_build/visuals3d/engine_probe.asm').write_text('\n'.join(lines))
    print(json.dumps({str(k):{'rva':hex(v),'prolog':game.bytes(v,20).hex()} for k,v in found.items()},indent=2))
    print('\n'.join(lines[:75]))
