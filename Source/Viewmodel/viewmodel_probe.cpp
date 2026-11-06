#define FPV_VIEWMODEL_TEST
#include "viewmodel.cpp"
#include <stdlib.h>
#include <stddef.h>

namespace {
unsigned checks=0,loads=0,attaches=0,removes=0,bounds=0,clones=0,materialLoads=0,materialApplies=0,materialConstructs=0,materialDestructs=0;bool loadFailure=false,materialFailure=false,cloneFailure=false;
void Require(bool ok,const char* what){++checks;if(!ok){fprintf(stderr,"FAIL: %s\n",what);exit(1);}}
bool Near(float a,float b){return fabsf(a-b)<.015f;}
bool Same(const Transform& a,const Transform& b){if(!Near(a.scale,b.scale)||!Near(a.position.x,b.position.x)||!Near(a.position.y,b.position.y)||!Near(a.position.z,b.position.z))return false;for(int i=0;i<3;++i)for(int j=0;j<3;++j)if(!Near(a.rotation.m[i][j],b.rotation.m[i][j]))return false;return true;}
struct CachedString {void* next;uint32_t state,length;void* external;char text[96];};
static_assert(offsetof(CachedString,text)==0x18,"F4SE StringCache Entry inline data");
struct alignas(16) Mock {BYTE data[0x1b0]{};void* children[8]{};CachedString name{};};
Mock parent1,parent2,actorRoot,mesh,parts[5],cameraRoot,optical,camera,shadowRoot,hiddenOwner;
Mock cachedMesh,cachedParts[5];BYTE shaders[5][0xe8]{},materials[5][0xc0]{};
struct MockRTTI {const char* name;const void* parent;};
const MockRTTI rttiNode{"NiNode",nullptr},rttiFade{"BSFadeNode",&rttiNode},rttiShadow{"ShadowSceneNode",&rttiNode};
const MockRTTI rttiShader{"BSLightingShaderProperty",nullptr};
const void* GetType(void* p){for(auto& shader:shaders)if(p==shader)return &rttiShader;if(p==shadowRoot.data)return &rttiShadow;if(p==mesh.data||p==hiddenOwner.data)return &rttiFade;return &rttiNode;}
BYTE nativeState[0x21000]{},actor[0x110]{},loaded[0x10]{};
void* nodeTable[0x42]{};void* cameraTable[0x42]{};void* queued[32]{};unsigned queueSize=0;
void Init(Mock& m,const char* name,void** table=nodeTable) {
    memset(&m,0,sizeof(m));m.name.state=1;m.name.length=uint32_t(strlen(name));strcpy(m.name.text,name);
    Write(m.data,0,table);Write(m.data,8,LONG(10));Write(m.data,0x10,(void*)&m.name);
    Write(m.data,0x30,Identity());Write(m.data,0x70,Identity());Write(m.data,0x128,(void**)m.children);Write(m.data,0x130,uint16_t(8));
}
void Add(void* p,void* child,bool){++attaches;uint16_t n=Read<uint16_t>(p,0x132);Require(n<8,"mock attach capacity");void** items=Read<void**>(p,0x128);items[n]=child;Write(p,0x132,uint16_t(n+1));Write(child,0x28,p);AddRef(child);}
void Remove(void* p,void* child){++removes;void** items=Read<void**>(p,0x128);uint16_t n=Read<uint16_t>(p,0x132);bool found=false;for(unsigned i=0;i<n;++i)if(items[i]==child){items[i]=items[n-1];items[n-1]=nullptr;Write(p,0x132,uint16_t(n-1));found=true;break;}Require(found,"remove owned child exactly once");Write(child,0x28,(void*)nullptr);InterlockedDecrement((volatile LONG*)((BYTE*)child+8));}
void Bound(void*){++bounds;}
int32_t Demand(const char* name,void** out,const ModelArgs* args){++loads;Require(!strcmp(name,"FPVDrone\\drone_fpv.nif"),"private model path");Require(args->flags==0x29,"engine material processing and texture loading enabled");*out=loadFailure?nullptr:cachedMesh.data;if(!loadFailure)AddRef(*out);return loadFailure?1:0;}
void* Clone(void* source){++clones;Require(source==cachedMesh.data,"clone cached prototype instead of rendering it directly");if(cloneFailure)return nullptr;Write(mesh.data,8,LONG(0));return mesh.data;}
void MaterialCtor(void* p){++materialConstructs;memset(p,0,0x1e0);}
void MaterialDtor(void*){++materialDestructs;}
uint32_t MaterialLoad(const char* path,void*,uint32_t flags){++materialLoads;Require(!strcmp(path,"FPVDrone\\drone.bgsm")&&flags==0,"load original BGSM with engine-relative path");return materialFailure?1:0;}
void MaterialApply(void*,void* part,bool textures){++materialApplies;Require(gParent!=nullptr,"initialize shaders after scene attachment");Require(textures,"material apply enables texture loading");int at=-1;for(int i=0;i<5;++i)if(part==parts[i].data)at=i;Require(at>=0,"apply material only to private clone geometry");Write(shaders[at],0,(void**)nodeTable);Write(shaders[at],0x58,(void*)materials[at]);Write(shaders[at],0x28,1.f);Write(part,0x138,(void*)shaders[at]);}
void UpdateScene(void* model,void*){
    void* p=Read<void*>(model,0x28);Transform parent=Read<Transform>(p,0x70),local=Read<Transform>(model,0x30);
    Transform world=(Read<uint64_t>(model,0x108)&(1ull<<45))?parent:Compose(parent,local);Write(model,0x70,world);
    for(auto& part:parts){Transform t=Compose(world,Read<Transform>(part.data,0x30));Write(part.data,0x70,t);}
}
void AddTask(void* p){Require(queueSize<32,"bounded test task queue");queued[queueSize++]=p;}
void Drain(){while(queueSize){auto* task=(ResetTask*)queued[0];for(unsigned i=1;i<queueSize;++i)queued[i-1]=queued[i];--queueSize;reinterpret_cast<void(*)(ResetTask*)>(task->table[1])(task);reinterpret_cast<void*(*)(ResetTask*,unsigned)>(task->table[0])(task,1);}}
void OriginalFrame(void*,void*){}
void OriginalEnd(bool){Write(gNative,kStatus,int(0));Write(gNative,kGeneration,Read<uint32_t>(gNative,kGeneration)+1);Write(gNative,kCameraState,(void*)nullptr);Write(gNative,kActor,(void*)nullptr);}
Tasks tasks{2,AddTask,nullptr};
void Start(Mock& parent){Write(actorRoot.data,0x28,(void*)parent.data);Write(loaded,8,(void*)actorRoot.data);Write(actor,0xf0,(void*)loaded);Write(gNative,kActor,(void*)actor);Write(gNative,kStatus,int(1));Write(gNative,kCameraState,(void*)0x12345678);Write(gNative,kGeneration,Read<uint32_t>(gNative,kGeneration)+1);}
void FrameNow(){Frame((void*)0x12345678,nullptr);}
bool Hidden(){return !gModel||(Read<uint64_t>(gModel,0x108)&1)!=0;}

void MathChecks(){
    Frustum f{-.85f,.85f,.48f,-.48f,15,100000,0,{0,0,0}};Layout l{};
    Require(Place(f,l),"standard FOV/near plane layout");Require(l.depth-.075f*l.partScale>f.nearPlane,"props ahead of near plane");Require(l.depth-.147f*l.chargeScale>f.nearPlane,"charge ahead of near plane");
    auto left=Part(2,l,.7f),right=Part(3,l,.7f);Require(left.position.x<0&&right.position.x>0,"rotors placed on opposite edges");Require(left.rotation.m[0][1]*right.rotation.m[0][1]<0,"rotors counterrotate");
    Require(Part(4,l,.3f).position.z<0,"charge below camera");Require(Same(Part(4,l,0),Part(4,l,4)),"charge does not spin with propellers");
    f.top=.85f;f.bottom=-.85f;Require(Place(f,l)&&l.depth-.147f*l.chargeScale>f.nearPlane,"wide FOV keeps complete charge ahead of near clip");
    f.ortho=1;Require(!Place(f,l),"reject orthographic camera");f.ortho=0;f.nearPlane=NAN;Require(!Place(f,l),"reject invalid near plane");
    for(int i=0;i<80;++i){
        Transform parent=Compose(Yaw(i*.09f),Pitch(i*.033f));parent.scale=.35f+i*.03f;parent.position={float(i*31),float(-i*7),float(i*13)};
        Transform cameraPose=Compose(Pitch(i*.017f),Yaw(i*.11f));cameraPose.position={float(i*17+9),float(i*23-50),float(i*5+70)};
        Transform body=BodyFromCamera(cameraPose),local{};Require(Relative(parent,body,local),"solve rotated/scaled parent");Require(Same(Compose(parent,local),body),"no drift under yaw/pitch/roll and carrier scale");
    }
}
void StringChecks(){
    Mock model;Init(model,"FPVDroneViewmodel");
    Require(Name(model.data,"FPVDroneViewmodel"),"decode actual inline StringCache Entry name");
    Require(!Name(model.data,"FPVLeftMotor"),"different cached node name rejected");
    CachedString external{};external.state=0x4001;external.external=&model.name;Write(model.data,0x10,(void*)&external);
    Require(Name(model.data,"FPVDroneViewmodel"),"decode external StringCache Entry name");
    model.name.state|=0x8000;Require(!Name(model.data,"FPVDroneViewmodel"),"wide cached name rejected safely");model.name.state=1;
    external.external=&external;Require(!Name(model.data,"FPVDroneViewmodel"),"external cache cycle bounded");
    Write(model.data,0x10,(void*)1);Require(!Name(model.data,"FPVDroneViewmodel"),"unreadable cache pointer rejected");
    Write(model.data,0x10,(const char*)"FPVDroneViewmodel");Require(!Name(model.data,"FPVDroneViewmodel"),"raw C string is not a valid engine cached name");
    Write(model.data,0x10,(void*)&model.name);char output[64];DescribeName(model.data,output,sizeof(output));Require(!strcmp(output,"FPVDroneViewmodel"),"diagnostic name uses same engine cache decoding");
}
void SceneChecks(){
    gNative=nativeState;gGame=0x140000000ull;gDemand=Demand;gScene=UpdateScene;gTasks=&tasks;gFrame=OriginalFrame;gEnd=OriginalEnd;gTestCamera=camera.data;gTestCameraVtable=cameraTable;
    gClone=Clone;gMaterialCtor=MaterialCtor;gMaterialDtor=MaterialDtor;gMaterialLoad=MaterialLoad;gMaterialApply=MaterialApply;
    QueryPerformanceFrequency(&gFrequency);strcpy(gLog,"_build\\visuals3d\\probe.log");
    nodeTable[2]=(void*)&GetType;nodeTable[3]=(void*)(gGame+kGetAsNode);nodeTable[0x3a]=(void*)&Add;nodeTable[0x3d]=(void*)&Remove;nodeTable[0x33]=(void*)&Bound;
    Init(parent1,"scene branch one");Init(parent2,"scene branch two");Init(actorRoot,"invisible actor root");Init(mesh,"FPVDroneViewmodel");Init(cameraRoot,"camera root");Init(optical,"optical",cameraTable);Init(camera,"singleton");
    for(int i=0;i<5;++i){Init(parts[i],kNames[i]);mesh.children[i]=parts[i].data;Write(parts[i].data,0x28,(void*)mesh.data);Write(parts[i].data,0x108,1ull<<45);}
    Init(cachedMesh,"FPVDroneViewmodel");Write(cachedMesh.data,0x132,uint16_t(5));
    for(int i=0;i<5;++i){Init(cachedParts[i],kNames[i]);cachedMesh.children[i]=cachedParts[i].data;Write(cachedParts[i].data,0x28,(void*)cachedMesh.data);}
    Write(mesh.data,0x132,uint16_t(5));Write(mesh.data,0x108,1ull<<45);
    cameraRoot.children[0]=optical.data;Write(cameraRoot.data,0x132,uint16_t(1));Write(optical.data,0x28,(void*)cameraRoot.data);
    Write(camera.data,0x20,(void*)cameraRoot.data);Write(camera.data,0x28,(void*)0x12345678);
    Frustum frustum{-.85f,.85f,.48f,-.48f,15,100000,0,{0,0,0}};Write(optical.data,0x160,frustum);
    Start(parent1);FrameNow();Require(gModel==mesh.data&&gParent==parent1.data&&!Hidden(),"first flight loads and attaches 3D model");Require(loads==1&&attaches==1,"one load and one attachment");Require(bounds>0,"carrier culling bounds updated");
    Require(Read<uint64_t>(mesh.data,0x108)&(1ull<<15),"private viewmodel ignores ordinary distance fade");
    Require(Read<uint64_t>(parent1.data,0x108)&(1ull<<29),"attach/unhide propagates renderer scene-change flag");
    Require(gParent!=actorRoot.data&&Read<void*>(mesh.data,0x28)==Read<void*>(actorRoot.data,0x28),"standalone sibling bypasses invisible actor alpha");
    Require(Same(Read<Transform>(mesh.data,0x70),BodyFromCamera(Read<Transform>(optical.data,0x70))),"actual viewmodel world transform follows optical camera");
    for(int i=0;i<5;++i)Require(!(Read<uint64_t>(parts[i].data,0x108)&(1ull<<45)),"disable identity-inheritance fast path for animated parts");
    BYTE actorBefore[sizeof(actor)];memcpy(actorBefore,actor,sizeof(actor));
    Transform parent=Compose(Pitch(.7f),Yaw(.4f));parent.scale=.35f;parent.position={800,-250,75};Write(parent1.data,0x70,parent);
    Transform opticalPose=Compose(Yaw(1.2f),Pitch(.35f));opticalPose.position={-130,570,200};Write(optical.data,0x70,opticalPose);FrameNow();
    Require(Same(Read<Transform>(mesh.data,0x70),BodyFromCamera(opticalPose)),"camera-relative model survives carrier rotation/scale");Require(!memcmp(actor,actorBefore,sizeof(actor)),"TESObjectREFR position/angles/physics untouched");
    FrameNow();FrameNow();Require(loads==1&&attaches==1,"no per-frame resource load or duplicate child");
    InterlockedAnd64((volatile LONG64*)(parent1.data+0x108),~(1ll<<29));InterlockedAnd64((volatile LONG64*)(mesh.data+0x108),~(1ll<<29));
    gTestPaused=true;FrameNow();Require(Hidden(),"pause hides viewmodel");Require(Read<uint64_t>(parent1.data,0x108)&(1ull<<29),"hide notifies renderer ancestor");
    InterlockedAnd64((volatile LONG64*)(parent1.data+0x108),~(1ll<<29));
    gTestPaused=false;FrameNow();Require(!Hidden(),"resume restores viewmodel");Require(Read<uint64_t>(parent1.data,0x108)&(1ull<<29),"unhide notifies renderer ancestor");
    Write(gNative,kStatus,int(8));FrameNow();Require(!Hidden(),"lost-link scene remains beneath HUD loss veil");Write(gNative,kStatus,int(1));
    void* savedParent=Read<void*>(optical.data,0x28);Write(optical.data,0x28,(void*)nullptr);FrameNow();Require(Hidden()&&!gFaulted,"temporary bad camera hides without touching flight");Write(optical.data,0x28,savedParent);FrameNow();Require(!Hidden(),"recovered camera restores scene");
    End(false);Require(Hidden()&&queueSize==1,"stop hides immediately and queues main-thread detach");Require(gParent==parent1.data,"parent retained until task runs");Drain();Require(!gParent&&Read<void*>(mesh.data,0x28)==nullptr,"queued stop detaches scene");Require(Read<LONG>(parent1.data,8)==10,"carrier reference released");
    Start(parent1);FrameNow();Require(loads==1&&gParent==parent1.data,"second launch reuses resource without duplicate");End(true);Require(queueSize==1,"detonation queues cleanup");
    Start(parent2);FrameNow();Require(gParent==parent2.data,"rapid relaunch moves model to new actor");Drain();Require(gParent==parent2.data&&!Hidden(),"stale end task cannot detach newer generation");
    End(false);Write(loaded,8,(void*)nullptr);Drain();Require(!gParent&&Read<LONG>(parent2.data,8)==10,"cleanup works after actor unload");
    Start(parent1);FrameNow();QueueReset(true);Drain();Require(!gParent&&Hidden(),"pre-load forced cleanup detaches model");
    Require(Read<LONG>(mesh.data,8)==1,"raw engine clone owns one retained reference after detaching");
    Require(clones==1&&materialLoads==1&&materialApplies==5,"clone and initialize all five materials only once across launches");
    Require(materialConstructs==1&&materialDestructs==1,"engine shader data lifetime balanced");
    Require(Read<LONG>(cachedMesh.data,8)==10&&Read<void*>(cachedMesh.data,0x28)==nullptr,"cached prototype released and never attached");
    for(int i=0;i<5;++i){Require(Read<void*>(cachedParts[i].data,0x138)==nullptr,"prototype shader data remains untouched");Require(Near(Read<float>(shaders[i],0x64),1),"private shader has visible LOD fade");}
    Init(shadowRoot,"WorldRoot");Init(hiddenOwner,"actor fade owner");Write(hiddenOwner.data,0x108,uint64_t(1));Write(hiddenOwner.data,0x28,(void*)shadowRoot.data);Write(parent1.data,0x28,(void*)hiddenOwner.data);
    Start(parent1);FrameNow();Require(gParent==shadowRoot.data,"bypass hidden actor ancestor using ShadowSceneNode RTTI");Require(Read<uint64_t>(hiddenOwner.data,0x108)&1,"never unhide actor-owned ancestor");
    Require(Same(Read<Transform>(mesh.data,0x70),BodyFromCamera(opticalPose)),"world render root preserves optical placement");End(false);Drain();Require(!gParent,"world render root cleanup balances ownership");
    Write(parent1.data,0x28,(void*)nullptr);Start(parent1);
    gModel=nullptr;memset(gParts,0,sizeof(gParts));gLoadAttempted=false;gFaulted=false;loadFailure=true;unsigned before=loads;FrameNow();FrameNow();Require(loads==before+1&&gFaulted&&!gModel,"failed mesh load is bounded and does not retry per frame");Require(Read<int>(gNative,kStatus)==1,"visual failure does not abort flight");
    loadFailure=false;cloneFailure=true;gLoadAttempted=false;gFaulted=false;before=clones;
    FrameNow();FrameNow();Require(clones==before+1&&gFaulted&&!gModel,"failed clone hides safely without retry or cached fallback");
    Require(Read<LONG>(cachedMesh.data,8)==10,"failed clone releases acquired cache reference");
    cloneFailure=false;materialFailure=true;gLoadAttempted=false;gFaulted=false;before=materialLoads;unsigned applied=materialApplies;
    FrameNow();FrameNow();Require(materialLoads==before+1&&gFaulted&&Hidden(),"failed BGSM hides safely without per-frame material reload");
    Require(materialApplies==applied,"failed material does not apply incomplete shader data");
    Require(materialConstructs==2&&materialDestructs==2,"failed BGSM destroys engine shader data");
    Require(Read<int>(gNative,kStatus)==1,"clone and shader failures preserve flight state");
    End(false);Drain();Require(!gParent&&Read<LONG>(mesh.data,8)==1,"failed material branch detaches and retains only owned clone reference");
    Write(gNative,kStatus,int(0));Require(queueSize==0,"all reset tasks consumed");
}
void HookChecks(const wchar_t* filename){
    HMODULE native=LoadLibraryExW(filename,nullptr,DONT_RESOLVE_DLL_REFERENCES);Require(native!=nullptr,"map original native without executing game code");
    BYTE* base=(BYTE*)native;Require(Hash(native),"exact original native SHA-256 accepted");Require(!Hash(GetModuleHandleW(nullptr)),"foreign binary hash rejected");
    BYTE physics[32],iat[8],end[sizeof(kEndBytes)];memcpy(physics,base+0x1e60,32);memcpy(iat,base+0x1cb10,8);memcpy(end,base+kEnd,sizeof(end));
    DWORD old;Require(VirtualProtect(base+kFrame,sizeof(kFrameBytes),PAGE_EXECUTE_READWRITE,&old)!=0,"test entry protection");BYTE first=base[kFrame];base[kFrame]=0x90;
    Require(!Install(native),"modified callback rejected before any hook installed");Require(!memcmp(end,base+kEnd,sizeof(end)),"rejected install leaves end callback untouched");base[kFrame]=first;DWORD ignored;VirtualProtect(base+kFrame,sizeof(kFrameBytes),old,&ignored);
    Require(Install(native),"install both validated visual callbacks");Require(base[kFrame]==0xff&&base[kEnd]==0xff,"both absolute jump patches present");
    Require(!memcmp((void*)gFrame,kFrameBytes,sizeof(kFrameBytes))&&!memcmp((void*)gEnd,kEndBytes,sizeof(kEndBytes)),"trampolines preserve exact complete prologues");
    Require(Read<uintptr_t>((void*)gFrame,sizeof(kFrameBytes)+6)==(uintptr_t)base+kFrame+sizeof(kFrameBytes),"frame trampoline resumes after copied instructions");
    Require(Read<uintptr_t>((void*)gEnd,sizeof(kEndBytes)+6)==(uintptr_t)base+kEnd+sizeof(kEndBytes),"end trampoline resumes after copied instructions");
    Require(!memcmp(physics,base+0x1e60,32)&&!memcmp(iat,base+0x1cb10,8),"controller integrator/IAT untouched");Require(Install(native),"repeated hook installation is idempotent");
    FreeLibrary(native);
}
}
int main(int argc,char** argv){
    if(argc!=2){fprintf(stderr,"usage: viewmodel_probe.exe FPVDroneNative.dll\n");return 2;}
    MathChecks();StringChecks();SceneChecks();wchar_t path[MAX_PATH];MultiByteToWideChar(CP_UTF8,0,argv[1],-1,path,MAX_PATH);HookChecks(path);
    printf("{\"result\":\"pass\",\"assertions\":%u,\"loads\":%u,\"attaches\":%u,\"removes\":%u,\"gameExecuted\":false}\n",checks,loads,attaches,removes);return 0;
}
