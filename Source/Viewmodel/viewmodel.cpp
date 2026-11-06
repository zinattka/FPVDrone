#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "viewmodel_math.h"

struct F4SEInterface { uint32_t version,runtime,editorVersion,isEditor;void*(*QueryInterface)(uint32_t);uint32_t(*GetPluginHandle)();uint32_t(*GetReleaseIndex)();const void*(*GetPluginInfo)(const char*); };
struct PluginInfo { uint32_t version;const char* name;uint32_t pluginVersion; };
struct Message {const char* sender;uint32_t type,length;void* data;};
struct Messaging {uint32_t version;bool(*RegisterListener)(uint32_t,const char*,void(*)(Message*));};
struct Tasks {uint32_t version;void(*AddTask)(void*);void(*AddUITask)(void*);};

namespace {
using namespace fpvview;
constexpr uintptr_t kFrame=0x12da0,kEnd=0x11130,kStatus=0x1e358,kActor=0x1e360,kLock=0x1e3e8,kGeneration=0x1e394,kCameraState=0x1e7b8,kThrottle=0x1e3e4;
constexpr uintptr_t kCameraSingleton=0x58ceb28,kCameraVtable=0x2e15e38,kGetAsNode=0x18b3a0,kSceneUpdate=0x1ba3be0,kDemand=0x1c8e0c0;
constexpr uintptr_t kClone=0x1b94b00,kMaterialCtor=0x27bd630,kMaterialDtor=0x3901f0,kMaterialLoad=0x1c9d170,kMaterialApply=0x27c4550;
constexpr BYTE kFrameBytes[]={0x55,0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x53,0x48,0x81,0xec,0x78,0x05,0,0};
constexpr BYTE kEndBytes[]={0x55,0x41,0x56,0x56,0x57,0x53,0x48,0x81,0xec,0x10,0x01,0,0,0x48,0x8d,0xac,0x24,0x80,0,0,0};
constexpr BYTE kDemandBytes[]={0x48,0x89,0x5c,0x24,0x08,0x57,0x48,0x83,0xec,0x30,0x48,0x8b,0xda,0x48,0x8d,0x54,0x24,0x20};
constexpr BYTE kSceneBytes[]={0x48,0x89,0x5c,0x24,0x08,0x57,0x48,0x83,0xec,0x20};
constexpr BYTE kCloneBytes[]={0x4c,0x8b,0xdc,0x49,0x89,0x5b,0x08,0x57,0x48,0x81,0xec,0xa0,0,0,0};
constexpr BYTE kMaterialCtorBytes[]={0x48,0x89,0x5c,0x24,0x08,0x48,0x89,0x74,0x24,0x10,0x57,0x48,0x83,0xec,0x20};
constexpr BYTE kMaterialDtorBytes[]={0x48,0x89,0x5c,0x24,0x10,0x48,0x89,0x74,0x24,0x18,0x57,0x48,0x83,0xec,0x20};
constexpr BYTE kMaterialLoadBytes[]={0x48,0x89,0x5c,0x24,0x08,0x48,0x89,0x74,0x24,0x10,0x57,0x48,0x83,0xec,0x20};
constexpr BYTE kMaterialApplyBytes[]={0x48,0x85,0xd2,0x0f,0x84,0xe8,0x01,0,0};
constexpr BYTE kHash[]={0x5a,0xe7,0xaf,0xd9,0x35,0x92,0xfa,0xa1,0x44,0x94,0xce,0x22,0xf4,0xf9,0x49,0x1e,0x2e,0x57,0xd6,0xbc,0x2c,0xe2,0x26,0x96,0xba,0x77,0x94,0x8b,0x6a,0x5a,0xf6,0xc9};
constexpr const char* kNames[]={"FPVLeftMotor","FPVRightMotor","FPVLeftRotor","FPVRightRotor","FPVCharge"};
using FrameFn=void(*)(void*,void*);using EndFn=void(*)(bool);
struct ModelArgs {int32_t lod;uint32_t level;uint8_t flags,pad[3];};
static_assert(sizeof(ModelArgs)==12,"BSModelDB arguments");
using DemandFn=int32_t(*)(const char*,void**,const ModelArgs*);using SceneFn=void(*)(void*,void*);
using CloneFn=void*(*)(void*);using MaterialLifeFn=void(*)(void*);
using MaterialLoadFn=uint32_t(*)(const char*,void*,uint32_t);using MaterialApplyFn=void(*)(void*,void*,bool);
BYTE* gNative=nullptr;uintptr_t gGame=0;Tasks* gTasks=nullptr;FrameFn gFrame=nullptr;EndFn gEnd=nullptr;
DemandFn gDemand=nullptr;SceneFn gScene=nullptr;
CloneFn gClone=nullptr;MaterialLifeFn gMaterialCtor=nullptr,gMaterialDtor=nullptr;
MaterialLoadFn gMaterialLoad=nullptr;MaterialApplyFn gMaterialApply=nullptr;
SRWLOCK gVisualLock=SRWLOCK_INIT;SRWLOCK gLogLock=SRWLOCK_INIT;
void* gModel=nullptr;void* gParent=nullptr;void* gParts[5]{};
bool gLoadAttempted=false,gFaulted=false,gInstalled=false;
bool gMaterialsReady=false;
unsigned gRenderTicks=0;
float gPhase=0;LARGE_INTEGER gLast{},gFrequency{};
char gLog[MAX_PATH]="Data\\F4SE\\FPVDroneViewmodel.log";
#ifdef FPV_VIEWMODEL_TEST
void* gTestCamera=nullptr;void* gTestCameraVtable=nullptr;bool gTestPaused=false;
#endif

void Log(const char* text) {
    AcquireSRWLockExclusive(&gLogLock);
    HANDLE h=CreateFileA(gLog,FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_ALWAYS,0,nullptr);
    if(h!=INVALID_HANDLE_VALUE){DWORD n;WriteFile(h,text,(DWORD)strlen(text),&n,nullptr);WriteFile(h,"\r\n",2,&n,nullptr);CloseHandle(h);}
    ReleaseSRWLockExclusive(&gLogLock);
}
bool Readable(const void* ptr,size_t size) {
    if(!ptr||!size)return false;
    MEMORY_BASIC_INFORMATION info{};
    if(!VirtualQuery(ptr,&info,sizeof(info))||info.State!=MEM_COMMIT||(info.Protect&(PAGE_NOACCESS|PAGE_GUARD)))return false;
    uintptr_t start=(uintptr_t)ptr,end=start+size;
    return end>=start&&end<=(uintptr_t)info.BaseAddress+info.RegionSize;
}
template<class T>T Read(const void* p,size_t at=0){T value{};memcpy(&value,(const BYTE*)p+at,sizeof(value));return value;}
template<class T>void Write(void* p,size_t at,const T& value){memcpy((BYTE*)p+at,&value,sizeof(value));}
bool Node(void* p) {
    if(!Readable(p,0x140))return false;void** table=Read<void**>(p);
    return Readable(table,0x42*sizeof(void*))&&(uintptr_t)table[3]==gGame+kGetAsNode;
}
void AddRef(void* p){InterlockedIncrement((volatile LONG*)((BYTE*)p+8));}
void Release(void* p){if(p&&InterlockedDecrement((volatile LONG*)((BYTE*)p+8))==0){void** table=Read<void**>(p);reinterpret_cast<void(*)(void*)>(table[1])(p);}}
void Dirty(void* p) {
    // Match the verified 1.10.163 SetScenegraphChange (RVA1BA47C0): bit29
    // propagates to parents. Raw bit0 writes alone omit this renderer notice.
    for(unsigned depth=0;depth<32&&Readable(p,0x120);++depth){
        LONG64 previous=InterlockedOr64((volatile LONG64*)((BYTE*)p+0x108),1ll<<29);
        if(depth&&previous&(1ll<<29))break;
        p=Read<void*>(p,0x28);
    }
}
void Cull(bool value){if(gModel){auto flags=(volatile LONG64*)((BYTE*)gModel+0x108);LONG64 old=value?InterlockedOr64(flags,1):InterlockedAnd64(flags,~1ll);if(bool(old&1)!=value)Dirty(gModel);}}
void Detach() {
    // Called only on the game thread. Our reference keeps the rendered scene
    // branch alive even if the actor unloaded before the queued task.
    Cull(true);
    if(gParent){
        if(Read<void*>(gModel,0x28)==gParent){void** table=Read<void**>(gParent);reinterpret_cast<void(*)(void*,void*)>(table[0x3d])(gParent,gModel);Dirty(gParent);}
        void* parent=gParent;gParent=nullptr;Release(parent);
    }
}
const char* FixedText(void* p) {
    // NiObjectNET::m_name is BSFixedString = StringCache::Ref, not char*.
    // Its pointer addresses an Entry header: state +08, external Entry +10,
    // inline characters +18. Follow bounded external chains like F4SE 0.6.23.
    if(!Readable(p,0x120))return nullptr;
    const void* entry=Read<const void*>(p,0x10);
    for(unsigned i=0;i<8;++i){
        if(!Readable(entry,0x18))return nullptr;
        uint32_t state=Read<uint32_t>(entry,8);
        if(state&0x4000){entry=Read<const void*>(entry,0x10);continue;}
        if(state&0x8000)return nullptr;
        return (const char*)entry+0x18;
    }
    return nullptr;
}
bool Name(void* p,const char* expected) {
    const char* text=FixedText(p);size_t n=strlen(expected);
    return Readable(text,n+1)&&memcmp(text,expected,n+1)==0;
}
void DescribeName(void* p,char* output,size_t capacity) {
    const char* text=FixedText(p);size_t n=0;
    if(!capacity)return;
    while(n+1<capacity&&Readable(text?text+n:nullptr,1)&&text[n]){output[n]=text[n];++n;}
    output[n]=0;
}
const char* Type(void* p) {
    // NiObject virtual slot2 is its documented, allocation-free GetRTTI.
    if(!Readable(p,0x120))return nullptr;void** table=Read<void**>(p);
    if(!Readable(table,24)||!Readable(table[2],1))return nullptr;
    const void* rtti=reinterpret_cast<const void*(*)(void*)>(table[2])(p);
    return Readable(rtti,16)?Read<const char*>(rtti):nullptr;
}
bool IsType(void* p,const char* expected){const char* name=Type(p);size_t n=strlen(expected);return Readable(name,n+1)&&memcmp(name,expected,n+1)==0;}
void* RenderParent(void* actorRoot) {
    void* immediate=Node(actorRoot)?Read<void*>(actorRoot,0x28):nullptr;
    void* world=nullptr;void* p=immediate;void* seen[32]{};
    for(unsigned depth=0;depth<32&&Node(p);++depth){
        for(unsigned i=0;i<depth;++i)if(seen[i]==p)return nullptr;
        seen[depth]=p;
        if(IsType(p,"ShadowSceneNode"))return p;
        if(Name(p,"WorldRoot"))world=p;
        p=Read<void*>(p,0x28);
    }
    return world?world:immediate;
}
void DescribeType(void* p,char* out,size_t capacity){const char* text=Type(p);size_t n=0;if(!capacity)return;while(n+1<capacity&&Readable(text?text+n:nullptr,1)&&text[n]){out[n]=text[n];++n;}out[n]=0;}
void LogBranch(void* actorRoot) {
    void* p=actorRoot;char name[96],type[64],line[320];
    for(unsigned depth=0;depth<16&&Node(p);++depth){DescribeName(p,name,sizeof(name));DescribeType(p,type,sizeof(type));
        float fade=IsType(p,"BSFadeNode")&&Readable(p,0x1c0)?Read<float>(p,0x1a0):-1;
        snprintf(line,sizeof(line),"Scene ancestor %u: name='%s' type='%s' flags=%llx fade=%.3f selected=%d",depth,name,type,(unsigned long long)Read<uint64_t>(p,0x108),fade,p==gParent);Log(line);p=Read<void*>(p,0x28);
    }
}
void LogRender(void* optical) {
    Transform camera=Read<Transform>(optical,0x70);Frustum f=Read<Frustum>(optical,0x160);char line[320];
    float fade=IsType(gModel,"BSFadeNode")&&Readable(gModel,0x1c0)?Read<float>(gModel,0x1a0):-1;
    snprintf(line,sizeof(line),"Render snapshot tick=%u: rootFlags=%llx fade=%.3f rootBoundRadius=%.3f",gRenderTicks,(unsigned long long)Read<uint64_t>(gModel,0x108),fade,Read<float>(gModel,0xbc));Log(line);
    for(int i=0;i<5;++i){Transform part=Read<Transform>(gParts[i],0x70);Vec3 delta={part.position.x-camera.position.x,part.position.y-camera.position.y,part.position.z-camera.position.z};float coordinates[3]{};
        for(int r=0;r<3;++r)coordinates[r]=delta.x*camera.rotation.m[r][0]+delta.y*camera.rotation.m[r][1]+delta.z*camera.rotation.m[r][2];
        float sx=coordinates[0]>0?.5f+coordinates[2]/coordinates[0]/(f.right-f.left):-1;
        float sy=coordinates[0]>0?.5f-coordinates[1]/coordinates[0]/(f.top-f.bottom):-1;
        snprintf(line,sizeof(line),"Render part '%s': flags=%llx scale=%.3f depth=%.3f screen01=[%.3f %.3f] boundRadius=%.3f",kNames[i],(unsigned long long)Read<uint64_t>(gParts[i],0x108),part.scale,coordinates[0],sx,sy,Read<float>(gParts[i],0xbc));Log(line);
    }
}
void LogGeometry(const char* stage) {
    char line[384],type[64];DescribeType(gModel,type,sizeof(type));
    snprintf(line,sizeof(line),"Geometry %s: rootType='%s' refs=%ld",stage,type,long(Read<LONG>(gModel,8)));Log(line);
    for(int i=0;i<5;++i){void* part=gParts[i];if(!Readable(part,0x170))continue;
        void* shader=Read<void*>(part,0x138);bool property=Readable(shader,0x70);
        void* material=property?Read<void*>(shader,0x58):nullptr;
        void* data=Read<void*>(part,0x148);void* vertices=Readable(data,0x20)?Read<void*>(data,8):nullptr;
        void* indices=Readable(data,0x20)?Read<void*>(data,0x10):nullptr;
        snprintf(line,sizeof(line),"Geometry %s '%s': registered=%u triangles=%u vertices=%u shader=%d material=%d alpha=%.3f lodFade=%.3f diffuse=%d vertexBuffer=%d indexBuffer=%d",stage,kNames[i],unsigned(Read<uint8_t>(part,0x159)),Read<uint32_t>(part,0x160),unsigned(Read<uint16_t>(part,0x164)),property,Readable(material,0xc0),property?Read<float>(shader,0x28):-1,property?Read<float>(shader,0x64):-1,Readable(material,0xc0)&&Read<void*>(material,0x48)!=nullptr,Readable(vertices,8)&&Read<void*>(vertices)!=nullptr,Readable(indices,8)&&Read<void*>(indices)!=nullptr);Log(line);
    }
}
bool PrepareMaterials() {
    // Demand returns a cached NIF, not a fully initialized live render instance.
    // Use the same BSShaderData load/apply path as F4SE's working overlays.
    // ApplyMaterialData loads textures, calls MakeValidForRendering and binds
    // each shader to its geometry (virtual 2A). Merely attaching is insufficient.
    alignas(16) BYTE data[0x1e0]{};gMaterialCtor(data);
    uint32_t result=gMaterialLoad("FPVDrone\\drone.bgsm",data,0);
    bool ok=result==0;
    if(ok)for(int i=0;i<5;++i){
        gMaterialApply(data,gParts[i],true);
        void* shader=Read<void*>(gParts[i],0x138);
        void* material=Readable(shader,0xe8)?Read<void*>(shader,0x58):nullptr;
        if(!Readable(material,0xc0)||!IsType(shader,"BSLightingShaderProperty")){ok=false;break;}
        // This camera decoration has no distance LOD transition. A freshly
        // cloned shader starts at zero fade until an ordinary reference's
        // visibility update; keep only our private shader fully visible.
        Write(shader,0x64,1.f);
    }
    gMaterialDtor(data);LogGeometry(ok?"prepared":"prepare-failed");
    if(!ok){char line[128];snprintf(line,sizeof(line),"3D material preparation failed: result=%u; flight continues.",result);Log(line);}
    return ok;
}
void LogModelContract(int32_t result) {
    char name[96],line[256];DescribeName(gModel,name,sizeof(name));
    bool node=Node(gModel);unsigned count=node?Read<uint16_t>(gModel,0x132):0;
    snprintf(line,sizeof(line),"Model load detail: result=%d present=%d node=%d root='%s' children=%u",int(result),gModel!=nullptr,node,name,count);Log(line);
    if(node&&count<=32){void** children=Read<void**>(gModel,0x128);if(count&&!Readable(children,count*8))return;
        for(unsigned i=0;i<count;++i){DescribeName(children[i],name,sizeof(name));bool linked=Readable(children[i],0x120)&&Read<void*>(children[i],0x28)==gModel;snprintf(line,sizeof(line),"Model child %u: name='%s' parentMatches=%d",i,name,linked);Log(line);}
    }
}
bool Parts() {
    if(!Node(gModel)||!Name(gModel,"FPVDroneViewmodel"))return false;
    uint16_t count=Read<uint16_t>(gModel,0x132);void** children=Read<void**>(gModel,0x128);
    if(count!=5||!Readable(children,count*8))return false;
    for(int i=0;i<5;++i){gParts[i]=nullptr;for(unsigned j=0;j<count;++j)if(Name(children[j],kNames[i])){if(gParts[i])return false;gParts[i]=children[j];}if(!gParts[i]||Read<void*>(gParts[i],0x28)!=gModel)return false;}
    return true;
}
bool EnsureModel() {
    if(gModel)return !gFaulted;
    if(gLoadAttempted)return false;gLoadAttempted=true;
    // Keep cached resource data immutable. Engine Clone performs CreateClone,
    // ProcessClone and destroys its own map/context; raw memcpy cannot copy
    // render resources. The returned raw clone needs our own NiPointer ref.
    ModelArgs args{2,0,0x29,{0,0,0}}; // items, prepare/process/loadTextures
    int32_t result=gDemand("FPVDrone\\drone_fpv.nif",&gModel,&args);
    if(result||!gModel||!Parts()){
        LogModelContract(result);
        if(gModel){Release(gModel);gModel=nullptr;}
        gFaulted=true;Log("3D viewmodel unavailable: model load or five-part contract failed; flight continues.");return false;
    }
    void* prototype=gModel;LogGeometry("cached");gModel=gClone(prototype);
    if(gModel==prototype)gModel=nullptr;
    if(gModel)AddRef(gModel);
    Release(prototype);
    if(!gModel||!Parts()){
        if(gModel){Release(gModel);gModel=nullptr;}
        memset(gParts,0,sizeof(gParts));gFaulted=true;Log("3D viewmodel unavailable: independent engine clone failed; flight continues.");return false;
    }
    gMaterialsReady=false;LogGeometry("cloned");
    // The private camera decoration must not distance-fade like an ordinary
    // unowned world item. Leave every actor/ancestor visibility flag alone.
    InterlockedOr64((volatile LONG64*)((BYTE*)gModel+0x108),1ll<<15);
    Cull(true);Log("Loaded actual NIF geometry with original drone BGSM and DDS maps.");return true;
}
bool Camera(void*& optical) {
#ifdef FPV_VIEWMODEL_TEST
    void* camera=gTestCamera;
#else
    void* camera=Read<void*>((void*)(gGame+kCameraSingleton));
#endif
    if(!Readable(camera,0x148)||Read<void*>(camera,0x28)!=Read<void*>(gNative,kCameraState))return false;
    void* root=Read<void*>(camera,0x20);if(!Node(root))return false;
    // Same bounded, unique-camera contract used by the original flight DLL.
    void* stack[64]{};unsigned size=1,visited=0;stack[0]=root;optical=nullptr;
    while(size){void* p=stack[--size];if(++visited>64||!Readable(p,0x120))return false;
#ifdef FPV_VIEWMODEL_TEST
        bool isCamera=Read<void*>(p)==gTestCameraVtable;
#else
        bool isCamera=Read<uintptr_t>(p)==gGame+kCameraVtable;
#endif
        if(isCamera){if(optical||!Readable(p,0x1a0))return false;optical=p;continue;}
        if(!Node(p))continue;
        uint16_t count=Read<uint16_t>(p,0x132),capacity=Read<uint16_t>(p,0x130);void** children=Read<void**>(p,0x128);
        if(count>capacity||count>64||size+count>64||(count&&!Readable(children,count*8)))return false;
        for(unsigned i=0;i<count;++i)if(children[i]){if(!Readable(children[i],0x120)||Read<void*>(children[i],0x28)!=p)return false;stack[size++]=children[i];}
    }
    return optical!=nullptr;
}
bool Paused(){
#ifdef FPV_VIEWMODEL_TEST
    return gTestPaused;
#else
    void* ui=Read<void*>((void*)(gGame+0x58d0898));return !Readable(ui,0x1e4)||Read<uint32_t>(ui,0x1e0)!=0;
#endif
}
void Fault(const char* reason){Cull(true);gFaulted=true;Log(reason);}
void Update() {
    AcquireSRWLockExclusive(&gVisualLock);
    int status=Read<int>(gNative,kStatus);
    if(gFaulted||(status!=1&&status!=8)||Paused()){Cull(true);QueryPerformanceCounter(&gLast);ReleaseSRWLockExclusive(&gVisualLock);return;}
    void* actor=Read<void*>(gNative,kActor);void* loaded=Readable(actor,0x110)?Read<void*>(actor,0xf0):nullptr;
    void* actorRoot=Readable(loaded,0x10)?Read<void*>(loaded,8):nullptr;
    // A loaded skeleton's immediate parent can still be an actor-owned fade
    // branch. Prefer the actual ShadowSceneNode/WorldRoot rendering branch.
    void* parent=RenderParent(actorRoot);void* optical=nullptr;
    if(!Node(parent)||!Camera(optical)){Cull(true);ReleaseSRWLockExclusive(&gVisualLock);return;}
    Transform world=BodyFromCamera(Read<Transform>(optical,0x70)),local{};Layout layout{};
    if(!Relative(Read<Transform>(parent,0x70),world,local)||!Place(Read<Frustum>(optical,0x160),layout)){
        Fault("3D viewmodel hidden: camera/parent transform or near-plane layout is incompatible.");ReleaseSRWLockExclusive(&gVisualLock);return;
    }
    if(!EnsureModel()){ReleaseSRWLockExclusive(&gVisualLock);return;}
    if(gParent!=parent){
        Detach();AddRef(parent);gParent=parent;
        void** table=Read<void**>(parent);reinterpret_cast<void(*)(void*,void*,bool)>(table[0x3a])(parent,gModel,true);
        if(Read<void*>(gModel,0x28)!=parent){Fault("3D viewmodel hidden: scene attachment failed.");Detach();ReleaseSRWLockExclusive(&gVisualLock);return;}
        Dirty(gModel);gRenderTicks=0;LogBranch(actorRoot);
        gPhase=0;QueryPerformanceCounter(&gLast);
        Frustum f=Read<Frustum>(optical,0x160);char line[256];snprintf(line,sizeof(line),"Attached camera-relative 3D parts: near=%.3f frustum=[%.3f %.3f %.3f %.3f] depth=%.3f scale=%.3f",f.nearPlane,f.left,f.right,f.top,f.bottom,layout.depth,layout.partScale);Log(line);
    }
    if(!gMaterialsReady){
        if(!PrepareMaterials()){Fault("3D viewmodel hidden: material/render initialization failed.");ReleaseSRWLockExclusive(&gVisualLock);return;}
        gMaterialsReady=true;
    }
    LARGE_INTEGER now{};QueryPerformanceCounter(&now);
    double dt=gLast.QuadPart&&gFrequency.QuadPart?double(now.QuadPart-gLast.QuadPart)/gFrequency.QuadPart:0;gLast=now;
    if(dt<0||dt>.05)dt=0;
    float throttle=Read<float>(gNative,kThrottle);if(!isfinite(throttle))throttle=.5f;throttle=fmaxf(0,fminf(1,throttle));
    gPhase=fmodf(gPhase+(35+140*throttle)*float(dt),6.283185307f);
    Write(gModel,0x30,local);
    // The verified engine fast path for bit 45 copies the parent's world
    // transform. Our newly nonidentity locals must take the compose path.
    InterlockedAnd64((volatile LONG64*)((BYTE*)gModel+0x108),~(1ll<<45));
    for(int i=0;i<5;++i){Write(gParts[i],0x30,Part(i,layout,gPhase));InterlockedAnd64((volatile LONG64*)((BYTE*)gParts[i]+0x108),~(1ll<<45));}
    Cull(false);alignas(16) BYTE context[0x40]{};gScene(gModel,context);
    // Include the viewmodel in the rendered scene branch's culling bound.
    void** parentTable=Read<void**>(parent);reinterpret_cast<void(*)(void*)>(parentTable[0x33])(parent);
    Transform actual=Read<Transform>(gModel,0x70);
    bool pose=Valid(actual)&&fabsf(actual.position.x-world.position.x)<=.2f&&fabsf(actual.position.y-world.position.y)<=.2f&&fabsf(actual.position.z-world.position.z)<=.2f&&fabsf(actual.scale-1)<=.005f;
    for(int i=0;i<3;++i)for(int j=0;j<3;++j)pose=pose&&fabsf(actual.rotation.m[i][j]-world.rotation.m[i][j])<=.005f;
    if(!pose)Fault("3D viewmodel hidden: engine world transform differs from solved optical pose.");
    ++gRenderTicks;if(gRenderTicks==1||gRenderTicks==12){LogRender(optical);LogGeometry("frame");}
    ReleaseSRWLockExclusive(&gVisualLock);
}
void Frame(void* state,void* next) {
    gFrame(state,next);
    // Respect the flight DLL's own lock and ownership. Never alter flight
    // state or actor transform: only our independent, non-colliding geometry.
    auto lock=(volatile LONG*)(gNative+kLock);
    while(InterlockedCompareExchange(lock,1,0))YieldProcessor();
    if(state==Read<void*>(gNative,kCameraState))Update();
    InterlockedExchange(lock,0);
}
struct ResetTask {void** table;uint32_t generation;bool force;};
void* ResetDelete(ResetTask* self,unsigned flags){if(flags&1)HeapFree(GetProcessHeap(),0,self);return self;}
void ResetRun(ResetTask* self){
    AcquireSRWLockExclusive(&gVisualLock);
    if(self->generation==Read<uint32_t>(gNative,kGeneration)&&(self->force||Read<int>(gNative,kStatus)==0))Detach();
    ReleaseSRWLockExclusive(&gVisualLock);
}
void* gTaskTable[]={reinterpret_cast<void*>(&ResetDelete),reinterpret_cast<void*>(&ResetRun)};
void QueueReset(bool force=false) {
    AcquireSRWLockExclusive(&gVisualLock);Cull(true);bool attached=gParent!=nullptr;ReleaseSRWLockExclusive(&gVisualLock);
    if(!attached)return;
    auto* task=(ResetTask*)HeapAlloc(GetProcessHeap(),HEAP_ZERO_MEMORY,sizeof(ResetTask));
    if(!task){Log("Unable to queue scene detach; hidden parent is retained until next launch.");return;}
    task->table=gTaskTable;task->generation=Read<uint32_t>(gNative,kGeneration);task->force=force;
    // AddTask is called outside all native/visual locks (F4SE runs tasks while
    // holding its queue lock). Stale generations cannot detach a newer flight.
    gTasks->AddTask(task);
}
void End(bool cut){gEnd(cut);QueueReset();}
bool Hash(HMODULE module) {
    wchar_t path[MAX_PATH];if(!GetModuleFileNameW(module,path,MAX_PATH))return false;
    HANDLE file=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(file==INVALID_HANDLE_VALUE)return false;
    BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;BYTE digest[32],buffer[16384];DWORD n;bool ok=false;
    if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0&&BCryptCreateHash(alg,&hash,nullptr,0,nullptr,0,0)>=0){ok=true;while(ReadFile(file,buffer,sizeof(buffer),&n,nullptr)&&n)if(BCryptHashData(hash,buffer,n,0)<0){ok=false;break;}if(!ok||BCryptFinishHash(hash,digest,32,0)<0||memcmp(digest,kHash,32))ok=false;}
    if(hash)BCryptDestroyHash(hash);if(alg)BCryptCloseAlgorithmProvider(alg,0);CloseHandle(file);return ok;
}
void Jump(BYTE* at,const void* to){at[0]=0xff;at[1]=0x25;memset(at+2,0,4);memcpy(at+6,&to,8);}
void* Trampoline(BYTE* at,size_t n){auto p=(BYTE*)VirtualAlloc(nullptr,n+14,MEM_COMMIT|MEM_RESERVE,PAGE_EXECUTE_READWRITE);if(p){memcpy(p,at,n);Jump(p+n,at+n);}return p;}
bool Install(HMODULE native) {
    if(gInstalled)return true;
    if(!native||!Hash(native)){Log("3D viewmodel disabled: unsupported/missing FPVDroneNative.dll.");return false;}
    BYTE* base=(BYTE*)native;
    if(Read<int>(base,kStatus)!=0||memcmp(base+kFrame,kFrameBytes,sizeof(kFrameBytes))||memcmp(base+kEnd,kEndBytes,sizeof(kEndBytes))){Log("3D viewmodel disabled: flight active or callback bytes differ.");return false;}
#ifndef FPV_VIEWMODEL_TEST
    if(memcmp((void*)(gGame+kDemand),kDemandBytes,sizeof(kDemandBytes))||memcmp((void*)(gGame+kSceneUpdate),kSceneBytes,sizeof(kSceneBytes))){Log("3D viewmodel disabled: engine signatures differ.");return false;}
    if(memcmp((void*)(gGame+kClone),kCloneBytes,sizeof(kCloneBytes))||memcmp((void*)(gGame+kMaterialCtor),kMaterialCtorBytes,sizeof(kMaterialCtorBytes))||memcmp((void*)(gGame+kMaterialDtor),kMaterialDtorBytes,sizeof(kMaterialDtorBytes))||memcmp((void*)(gGame+kMaterialLoad),kMaterialLoadBytes,sizeof(kMaterialLoadBytes))||memcmp((void*)(gGame+kMaterialApply),kMaterialApplyBytes,sizeof(kMaterialApplyBytes))){Log("3D viewmodel disabled: clone/material engine signatures differ.");return false;}
#endif
    auto frame=(FrameFn)Trampoline(base+kFrame,sizeof(kFrameBytes));auto end=(EndFn)Trampoline(base+kEnd,sizeof(kEndBytes));
    if(!frame||!end){if(frame)VirtualFree((void*)frame,0,MEM_RELEASE);if(end)VirtualFree((void*)end,0,MEM_RELEASE);return false;}
    DWORD oldFrame=0,oldEnd=0;
    if(!VirtualProtect(base+kFrame,sizeof(kFrameBytes),PAGE_EXECUTE_READWRITE,&oldFrame)){VirtualFree((void*)frame,0,MEM_RELEASE);VirtualFree((void*)end,0,MEM_RELEASE);return false;}
    if(!VirtualProtect(base+kEnd,sizeof(kEndBytes),PAGE_EXECUTE_READWRITE,&oldEnd)){DWORD ignored;VirtualProtect(base+kFrame,sizeof(kFrameBytes),oldFrame,&ignored);VirtualFree((void*)frame,0,MEM_RELEASE);VirtualFree((void*)end,0,MEM_RELEASE);return false;}
    gNative=base;gFrame=frame;gEnd=end;
    BYTE fb[sizeof(kFrameBytes)],eb[sizeof(kEndBytes)];memset(fb,0x90,sizeof(fb));memset(eb,0x90,sizeof(eb));Jump(fb,(void*)&Frame);Jump(eb,(void*)&End);
    memcpy(base+kFrame,fb,sizeof(fb));memcpy(base+kEnd,eb,sizeof(eb));DWORD ignored;
    VirtualProtect(base+kFrame,sizeof(fb),oldFrame,&ignored);VirtualProtect(base+kEnd,sizeof(eb),oldEnd,&ignored);
    FlushInstructionCache(GetCurrentProcess(),base+kFrame,sizeof(fb));FlushInstructionCache(GetCurrentProcess(),base+kEnd,sizeof(eb));
    FlushInstructionCache(GetCurrentProcess(),(void*)frame,sizeof(fb)+14);FlushInstructionCache(GetCurrentProcess(),(void*)end,sizeof(eb)+14);
    gInstalled=true;Log("FPVDroneViewmodel 4: independent engine clone and explicit BGSM render preparation enabled.");return true;
}
void OnMessage(Message* msg){if(!msg)return;if(msg->type==0)Install(GetModuleHandleW(L"FPVDroneNative.dll"));else if(msg->type==2&&gInstalled)QueueReset(true);}
} // namespace

extern "C" __declspec(dllexport) bool F4SEPlugin_Query(const F4SEInterface* api,PluginInfo* info) {
    if(info){info->version=1;info->name="FPVDroneViewmodel";info->pluginVersion=4;}
    return api&&info&&!api->isEditor&&api->runtime==0x010a0a30;
}
extern "C" __declspec(dllexport) bool F4SEPlugin_Load(const F4SEInterface* api) {
    if(!api||!api->QueryInterface||!api->GetPluginHandle)return false;
    gGame=(uintptr_t)GetModuleHandleW(nullptr);gDemand=(DemandFn)(gGame+kDemand);gScene=(SceneFn)(gGame+kSceneUpdate);QueryPerformanceFrequency(&gFrequency);
    gClone=(CloneFn)(gGame+kClone);gMaterialCtor=(MaterialLifeFn)(gGame+kMaterialCtor);gMaterialDtor=(MaterialLifeFn)(gGame+kMaterialDtor);gMaterialLoad=(MaterialLoadFn)(gGame+kMaterialLoad);gMaterialApply=(MaterialApplyFn)(gGame+kMaterialApply);
    gTasks=(Tasks*)api->QueryInterface(5);auto messaging=(Messaging*)api->QueryInterface(1);
    if(!gTasks||gTasks->version<2||!gTasks->AddTask||!messaging||!messaging->RegisterListener)return false;
    return messaging->RegisterListener(api->GetPluginHandle(),"F4SE",OnMessage);
}
