"""Read the built SWF independently; check real Ruffle-rendered test hosts.

Run build_fpv_visuals.py, preview_fpv_visuals.cjs, then this file. These checks
execute AVM2 in Ruffle, not Fallout's Scaleform, and do not constitute a flight test.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'_build/deps/python'))
from PIL import Image,ImageChops,ImageStat
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'_build/visuals'
checks=[]
def check(condition,message):
    assert condition,message
    checks.append(message)
def tags(data,at=0):
    result=[]
    while at<len(data):
        head=struct.unpack_from('<H',data,at)[0]; at+=2; length=head&63
        if length==63: length=struct.unpack_from('<I',data,at)[0]; at+=4
        check(at+length<=len(data),'tag payload within bounds')
        result.append((head>>6,data[at:at+length])); at+=length
        if head>>6==0: break
    check(at==len(data),'no trailing timeline bytes')
    return result
def main():
    swf=(OUT/'FPVDroneOverlay.swf').read_bytes()
    check(swf[:4]==b'FWS\x0f','uncompressed SWF15')
    check(struct.unpack_from('<I',swf,4)[0]==len(swf),'declared SWF size')
    n=swf[8]>>3; start=8+(5+4*n+7)//8
    fps,frames=struct.unpack_from('<HH',swf,start)
    check((fps,frames)==(60*256,1),'stable single-frame root at 60 FPS')
    top=tags(swf,start+4)
    check(top[0]==(69,b'\x08\0\0\0'),'AS3 file attribute')
    sprites={struct.unpack_from('<H',p)[0]:p for t,p in top if t==39}
    check(set(sprites)=={1,2},'production host has only canvas and visual symbols')
    canvas=sprites[1]
    check(canvas==b'\x01\0\x01\0\x40\0\0\0','native canvas stays empty and one-frame')
    symbols=[p for t,p in top if t==76]
    check(symbols==[b'\x01\0\x02\0FPVDroneVisual\0'],'visual-only class binding; no root class replacement')
    placements=[p for t,p in top if t==26]
    check(len(placements)==2 and placements[0].endswith(b'FPVDroneCanvas\0'),'native named root child retained')
    check(struct.unpack_from('<H',placements[0],1)[0]==1,'native canvas retains depth 1')
    # Regression: the user saw green over the entire bitmap rectangle in
    # Fallout. Do not allow any image character or bitmap fill back in.
    check(not any(t in (6,20,21,35,36,90,92,1000,1001,1002,1009) for t,p in top),'no embedded or external bitmap/image tags')
    shapes=[p for t,p in top if t==32]
    check(len(shapes)==25,'one hardware vector shape plus 24 rotor vector frames')
    ids=[]; fill_total=0; translucent=0
    for p in shapes:
        ids.append(struct.unpack_from('<H',p)[0]); n=p[2]>>3
        at=2+(5+4*n+7)//8; count=p[at]; at+=1
        if count==255: count=struct.unpack_from('<H',p,at)[0]; at+=2
        styles=[]
        for _ in range(count):
            kind=p[at]; at+=1; styles.append(kind)
            check(at+4<=len(p),'solid RGBA style within shape bounds')
            translucent+=p[at+3]<255; at+=4
        check(all(k==0 for k in styles),'all shape fills are solid RGBA, never bitmap/gradient')
        check(p[at]==0,'no textured line styles')
        fill_total+=count
    check(len(set(ids))==25,'vector character IDs unique')
    check(ids==[11]+list(range(200,224)),'all timeline shapes defined')
    check(translucent>0,'solid alpha fills retain propeller exposure blur')
    visual=sprites[2]
    check(struct.unpack_from('<H',visual,2)[0]==24,'24-frame rotor timeline')
    control=tags(visual,4)
    check(sum(t==1 for t,p in control)==24,'one ShowFrame per rotor phase')
    check(not any(t in (12,59,82) for t,p in control),'timeline has no frame stop or repeated script execution')
    references=[struct.unpack_from('<H',p,3)[0] for t,p in control if t==26]
    check(references==[11]+list(range(200,224)),'hardware persists; rotor frame replaced at same depth')
    # Execute/render evidence from the real AVM2 player, not a source-code mock.
    normal=Image.open(OUT/'ruffle_normal.png').convert('RGB')
    second=Image.open(OUT/'ruffle_normal_2.png').convert('RGB')
    background=Image.new('RGB',normal.size,(120,149,163))
    diff=ImageChops.difference(normal,background)
    check(diff.crop((0,400,170,500)).getbbox() is not None,'left rotor and motor render')
    check(diff.crop((854,400,1024,500)).getbbox() is not None,'right rotor and motor render')
    check(diff.crop((420,555,604,768)).getbbox() is not None,'shaded vector charge renders below reticle')
    check(diff.crop((170,0,854,550)).getbbox() is None,'central sight picture remains clear')
    motion=ImageChops.difference(normal,second); bounds=motion.getbbox()
    check(bounds is not None and bounds[1]>=400 and bounds[3]<=528,'real SWF playback animates only rotor strip')
    check(motion.crop((400,550,624,768)).getbbox() is None,'warhead stays fixed to camera')
    for name in ['hidden','waiting']:
        im=Image.open(OUT/f'ruffle_{name}.png').convert('RGB')
        check(ImageChops.difference(im,background).getbbox() is None,f'{name} host never leaks decoration')
    lost=Image.open(OUT/'ruffle_lost.png').convert('RGB')
    check(ImageChops.difference(lost,Image.new('RGB',lost.size,(112,119,130))).getbbox() is None,'opaque signal veil covers hardware and rotors')
    scaled=Image.open(OUT/'ruffle_scaled.png').convert('RGB')
    bounds=ImageChops.difference(scaled,background).getbbox()
    check(bounds is not None and bounds[0]>=256 and bounds[2]<=768 and bounds[1]>=392 and bounds[3]<=576,'decoration inherits parent position and half scale')
    log=(OUT/'ruffle.log').read_text()
    check(not any(s in log for s in ['VerifyError','ReferenceError','TypeError','AVM2 error','PAGEERROR']),'no AVM2 runtime errors in five hosts')
    # The vector conversion must preserve the source hardware silhouette and
    # shading to within colour quantization/edge-antialiasing error.
    source=Image.new('RGBA',normal.size,(120,149,163,255))
    source.alpha_composite(Image.open(ROOT/'Source/Visuals/frames/hardware.png'),(0,400))
    body_error=ImageStat.Stat(ImageChops.difference(normal.crop((400,550,624,768)),source.convert('RGB').crop((400,550,624,768)))).mean
    check(max(body_error)<6,'vector charge remains visually close to source geometry render')
    # Neutral review artifact from the intermediate source renders; Ruffle
    # screenshots above show the actual encoded, quantized vector playback.
    hardware=Image.open(ROOT/'Source/Visuals/frames/hardware.png').convert('RGBA')
    animation=[]
    for i in range(24):
        image=Image.new('RGBA',(1024,768),(120,149,163,255)); image.alpha_composite(hardware,(0,400))
        image.alpha_composite(Image.open(ROOT/f'Source/Visuals/frames/rotors_{i:02}.png'),(0,400))
        animation.append(image.convert('RGB'))
    animation[0].save(OUT/'FPV_visual_preview.gif',save_all=True,append_images=animation[1:],duration=20,loop=0)
    report={'checks':len(checks),'result':'pass','swfSHA256':hashlib.sha256(swf).hexdigest(),
        'rendering':'solid RGBA vector paths only','bitmapBytes':0,'vectorShapes':len(shapes),'vectorFills':fill_total,
        'swfBytes':len(swf),'player':'Ruffle 0.7.1 / headless Chromium',
        'coverage':['load and attach','rotor timeline playback','static charge','waiting for native hierarchy','parent transparency','signal veil occlusion','inherited position/scale'],
        'limitation':'The revised vector build has not yet been tested in Fallout 4. The preceding bitmap build failed there.'}
    (OUT/'test_report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
