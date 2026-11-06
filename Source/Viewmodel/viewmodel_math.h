#pragma once
#include <math.h>
#include <stdint.h>

namespace fpvview {
struct Vec3 { float x,y,z; };
struct Matrix { float m[3][4]; };
struct Transform { Matrix rotation; Vec3 position; float scale; };
struct Frustum { float left,right,top,bottom,nearPlane,farPlane; uint8_t ortho,pad[3]; };
static_assert(sizeof(Transform)==0x40,"Fallout 4 raw NiTransform");
static_assert(sizeof(Frustum)==0x1c,"NiFrustum layout");
inline Transform Identity() { Transform t{}; for(int i=0;i<3;++i)t.rotation.m[i][i]=1; t.scale=1; return t; }
inline Vec3 Rotate(Vec3 v,const Matrix& r) {
    return {v.x*r.m[0][0]+v.y*r.m[1][0]+v.z*r.m[2][0],v.x*r.m[0][1]+v.y*r.m[1][1]+v.z*r.m[2][1],v.x*r.m[0][2]+v.y*r.m[1][2]+v.z*r.m[2][2]};
}
inline Transform Compose(const Transform& parent,const Transform& local) {
    Transform out{};
    for(int i=0;i<3;++i)for(int j=0;j<3;++j)for(int k=0;k<3;++k)out.rotation.m[i][j]+=local.rotation.m[i][k]*parent.rotation.m[k][j];
    Vec3 v=Rotate(local.position,parent.rotation);
    out.position={parent.position.x+parent.scale*v.x,parent.position.y+parent.scale*v.y,parent.position.z+parent.scale*v.z};
    out.scale=parent.scale*local.scale; return out;
}
inline bool Valid(const Transform& t) {
    if(!isfinite(t.scale)||t.scale<.000001f||t.scale>1000000)return false;
    if(!isfinite(t.position.x)||!isfinite(t.position.y)||!isfinite(t.position.z))return false;
    for(int i=0;i<3;++i)for(int j=i;j<3;++j){float dot=0; for(int k=0;k<3;++k)dot+=t.rotation.m[i][k]*t.rotation.m[j][k]; if(!isfinite(dot)||fabsf(dot-(i==j?1.f:0.f))>.005f)return false;}
    const auto& m=t.rotation.m;
    float d=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
    return fabsf(d-1)<.005f;
}
inline bool Relative(const Transform& parent,const Transform& world,Transform& out) {
    if(!Valid(parent)||!Valid(world))return false;
    Transform inverse=Identity();
    for(int i=0;i<3;++i)for(int j=0;j<3;++j)inverse.rotation.m[i][j]=parent.rotation.m[j][i];
    inverse.scale=1/parent.scale;
    inverse.position=Rotate({-parent.position.x/parent.scale,-parent.position.y/parent.scale,-parent.position.z/parent.scale},inverse.rotation);
    out=Compose(inverse,world); return Valid(out);
}
inline Transform BodyFromCamera(const Transform& optical) {
    Transform body=optical;
    // Raw NiCamera matrix rows are depth, up, right. Our mesh is right,
    // forward, up; this permutation is proper (determinant +1).
    for(int j=0;j<4;++j){body.rotation.m[0][j]=optical.rotation.m[2][j]; body.rotation.m[1][j]=optical.rotation.m[0][j]; body.rotation.m[2][j]=optical.rotation.m[1][j];}
    body.scale=1; return body;
}
inline Transform Pitch(float angle) {
    Transform t=Identity(); float c=cosf(angle),s=sinf(angle);
    t.rotation.m[1][1]=c;t.rotation.m[1][2]=s;t.rotation.m[2][1]=-s;t.rotation.m[2][2]=c;return t;
}
inline Transform Yaw(float angle) {
    Transform t=Identity();float c=cosf(angle),s=sinf(angle);
    t.rotation.m[0][0]=c;t.rotation.m[0][1]=s;t.rotation.m[1][0]=-s;t.rotation.m[1][1]=c;return t;
}
struct Layout { float depth,halfHeight,halfWidth,partScale,chargeScale,chargeZ; };
inline bool Place(const Frustum& f,Layout& l) {
    if(f.ortho||!isfinite(f.nearPlane)||f.nearPlane<=0||f.nearPlane>10000)return false;
    float h=(f.top-f.bottom)*.5f,w=(f.right-f.left)*.5f;
    // The verified NiCamera perspective routine uses 2/(right-left) and
    // 2/(top-bottom): frustum edges are slopes, not near-plane distances.
    if(!isfinite(h)||!isfinite(w)||h<.05f||h>5||w<.05f||w>5)return false;
    const float rearFraction=1-.147f*6*h;
    if(rearFraction<=.05f)return false;
    l.depth=fmaxf(40,f.nearPlane*fmaxf(2.5f,1.15f/rearFraction));l.halfHeight=h*l.depth;
    l.halfWidth=fminf(w,h*4.f/3.f)*l.depth;
    l.partScale=5*l.halfHeight;l.chargeScale=l.partScale*1.2f;
    l.chargeZ=-.49f*h*(l.depth+.14635f*l.chargeScale);
    // Forward-most and rear-most vertices of the selected mesh remain on
    // the camera side of the actual near plane, without changing game FOV.
    return l.depth-.075f*l.partScale>f.nearPlane && l.depth-.147f*l.chargeScale>f.nearPlane;
}
inline Transform Part(int index,const Layout& l,float phase) {
    if(index==4){Transform t=Identity();t.position={0,l.depth,l.chargeZ};t.scale=l.chargeScale;return t;}
    const bool left=index==0||index==2; const bool rotor=index==2||index==3;
    Transform tilt=Pitch(.20f),t=rotor?Compose(tilt,Yaw(left?phase:-phase)):tilt;
    t.position={(left?-1.f:1.f)*1.02f*l.halfWidth,l.depth,-.19f*l.halfHeight};
    if(rotor){Vec3 offset=Rotate({0,0,.009f*l.partScale},tilt.rotation);t.position.y+=offset.y;t.position.z+=offset.z;}
    t.scale=l.partScale;return t;
}
} // namespace fpvview
