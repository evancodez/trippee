// The sheet in space: where a pixel lands on a sheet that has left the plane. Only coordinates: what comes out goes into prepare() as if it were a point on the flat frame, so whatever the pattern is
// (warps, surfaces, flows, the song) lies flat on the bent sheet and the box filter works from the real gradient as ever. No lighting, no normals. Everything here is behind #ifdef SPACE, its own programs.
//
// One sheet (a move, a stretch of a song): uG[b+I_spaceK..E], read at the top of prepare().
// Two sheets (a transformation, dive mode 6): uF[F_SPACE..+4], read in main(). Each pixel lands on A or B; irisB says how much of it is B.
//
//   k  kind, amp, f, ph     kind: 1 swell, 2 well, 3 drop, 4 pleat, 5 tube
//   c  pitch, yaw, roll, dist     the camera, about the point it's looking at. With everything else 0 a sheet lying at z = 0 is exactly the frame, whatever dist is.
//   o  x, y, z, a           the point it's looking at. a: each kind's own
//   e  bowl, q, pix, w      bowl: the world curves up away from the camera, so the far ground fills the top of the frame and there's never a horizon. q: heights in steps of this. pix: in square columns this wide. w: each kind's own
//   B  L, x, y, front       L: the level of the flat sheet B. x, y: where B's origin is. front: the tube's join
export default `#ifdef SPACE
float spWave(vec2 u,float ph){ return .62*sin(.8*u.x+.35*u.y+ph)+.38*sin(-.45*u.x+1.1*u.y-.7*ph+1.3)+.22*sin(1.9*u.x-1.3*u.y+.5*ph+.4); }
float spHash(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
const float SP_GONE=-1e4;
// The height of sheet A here. It's solid underneath, except a well, which is a thin sheet with a hole in it: under its rim there's nothing but what's below.
float spA(vec4 k,vec4 o,vec4 e,vec3 X){
  vec2 q=e.z>0.?(floor(X.xy/e.z)+.5)*e.z:X.xy;
  float h=0.;
  if(k.x<1.5) h=k.y*spWave(q*k.z,k.w);
  else if(k.x<2.5){
    float r=length(q),N=max(k.z,1e-3);
    if(k.w>0.&&(r<N||X.z<-k.y/N)) return SP_GONE;       // ph 1: through the neck to whatever's below. ph 0: closed, a horn
    h=-k.y/max(r,N);
  }
  else {
    float r=length(q-o.w*vec2(1.,0.)),u=clamp((k.w-r-e.w*spHash(q))/.3,0.,1.);       // ph: how far the fall has come from the middle. Each column goes when it reaches it, and falls as a thing falls
    h=-k.y*u*u;
  }
  if(e.y>0.) h=floor(h/e.y+.5)*e.y;
  return h;
}
vec3 spRay(vec2 p,vec4 c,vec4 o,out vec3 rd){
  float d=max(c.w,.05);
  rd=normalize(vec3(p,-d));
  rd.xy=rot(c.z)*rd.xy;
  vec3 ro=vec3(0.,0.,d);
  rd.yz=rot(c.x)*rd.yz; ro.yz=rot(c.x)*ro.yz;
  rd.xy=rot(c.y)*rd.xy; ro.xy=rot(c.y)*ro.xy;
  return ro+o.xyz;
}
// Relief: a ray coming down on a height field, and anything flat at level L. Returns the hit. side: how much of it is B, zero with no B.
vec3 spRelief(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e,float L,out float side,out bool edge){
  vec3 rd,ro=spRay(p,c,o,rd);
  vec2 cam=ro.xy;
  float t=0.,prev=0.,fp=1.,fn=1.,top=abs(k.y)*1.3+max(L,0.)+.05+(e.y>0.?e.y:0.);
  if(e.x<=0.&&rd.z<0.) t=prev=max(0.,(ro.z-top)/-rd.z);
  float big=e.z>0.?e.z*.45:1.2;
  bool got=false;
  for(int i=0;i<44;i++){
    vec3 X=ro+rd*t; vec2 dc=X.xy-cam;
    float f=X.z-max(spA(k,o,e,X),L)-e.x*dot(dc,dc);
    if(f<0.){ fn=f; got=true; break; }
    prev=t; fp=f;
    t+=clamp(f*.55,.004+.006*t,big);
  }
  if(got){
    for(int i=0;i<6;i++){
      float m=.5*(prev+t); vec3 X=ro+rd*m; vec2 dc=X.xy-cam;
      float f=X.z-max(spA(k,o,e,X),L)-e.x*dot(dc,dc);
      if(f<0.){ t=m; fn=f; } else { prev=m; fp=f; }
    }
    // What's left is a straight line on any smooth stretch, and this lands exactly on it, so a flat sheet comes out exactly flat. Across a wall it stays between the two.
    t=prev+(t-prev)*clamp(fp/max(fp-fn,1e-6),0.,1.);
  }
  vec3 X=ro+rd*t;
  float hA=spA(k,o,e,X);
  side=L>SP_GONE?aaOf(L-hA):0.;
  if(k.x>1.5&&k.x<2.5&&k.w>0.&&L>SP_GONE){          // the neck has an exact rim
    float N=max(k.z,1e-3),D=-k.y/N;
    if(ro.z<=D) side=1.;
    else if(rd.z<0.){ vec3 Y=ro+rd*((ro.z-D)/-rd.z); side=aaOf(N-length(Y.xy)); }
    else side=0.;
  }
  float w=fwidth(t)/max(t,.05);
  edge=w>.06;
  return X;
}
// Pleats: a sheet in sawtooth folds, its folds running along e.w. Each cell has a face of share a rising to its ridge and a face falling back. These are planes, so it's all exact.
//   amp  ridge height, in cell widths.   f  cells a unit.   ph, a  where the walk has got to, and how wide it is: the share of the first face in each cell comes from these
vec3 spPleat(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e,out float side,out float fS,out bool edge){
  vec3 rd,ro=spRay(p,c,o,rd);
  float an=e.w,n=max(k.z,1e-3); vec2 U=vec2(cos(an),sin(an)),V=vec2(-U.y,U.x);
  float rz=min(rd.z,-.02),t0=ro.z/-rz,s0=dot(ro.xy,U)+t0*dot(rd.xy,U),m=dot(rd.xy,U)/-rz;
  float Hm=k.y/n;
  float a0=n*(s0-m*Hm),a1=n*s0;
  int i0=int(floor(a0)),i1=int(floor(a1)),dir=i1>=i0?1:-1;
  float hz=0.,hS=s0,hA=1.,hI=float(i1); bool onA=true;
  int i=i0;
  for(int g=0;g<9;g++){
    float ci=float(i),si=ci/n,sh=clamp((k.w-(ci+.5)/n)/max(o.w,1e-3),.001,.999),H=Hm*clamp(4.*sh*(1.-sh),0.,1.);
    float sr=si+sh/n,g1=H*n/sh,g2=H*n/(1.-sh);
    float z1=g1*(s0-si)/(1.+g1*m),s1=s0-m*z1;
    float z2=(H-g2*(s0-sr))/(1.-g2*m),s2=s0-m*z2;
    bool v1=s1>=si&&s1<=sr, v2=s2>=sr&&s2<=si+1./n;
    if(v1||v2){
      bool useA=v1&&(!v2||z1>=z2);
      hz=useA?z1:z2; hS=useA?s1:s2; hA=sh; hI=ci; onA=useA;
      break;
    }
    if(i==i1) break;
    i+=dir;
  }
  float si=hI/n,sr=si+hA/n;
  // Where it is in the cell, on the face it's on, 0..1
  float fa=(hS-si)/(hA/n),fb=(hS-sr)/((1.-hA)/n);
  side=onA?0.:1.;
  fS=onA?fa:fb;
  edge=fwidth(side)>0.||fwidth(hI)>0.;
  vec3 X=ro+rd*((ro.z-hz)/-rz);
  float w=dot(X.xy,V);
  vec3 r=vec3(U*si+V*w,hz);
  r.xy+=U*fS/n;
  return r;
}
// A tube: the sheet rolled up towards the camera, along y. Lays no stretch on it: across it's the arc, along it's the axis. amp: 1/its radius, so 0 is flat. f, ph: its bends, ahead. e.w: lines going round it as they go along it
vec3 spTube(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e,out bool edge,out float along){
  vec3 rd,ro=spRay(p,c,o,rd);
  float K=k.y,bA=o.w,bW=k.z,bP=k.w;
  float y0=ro.y,c0=sin(bW*y0+bP),c1=cos(bW*.61*y0+1.1*bP);
  #define SP_F(X) (.5*K*(pow(X.x-bA*(sin(bW*X.y+bP)-c0),2.)+pow(X.z-.6*bA*(cos(bW*.61*X.y+1.1*bP)-c1),2.))-(X.z-.6*bA*(cos(bW*.61*X.y+1.1*bP)-c1)))
  float t=0.,prev=0.,st=.06*max(c.w,.3),fp=1.,fn=1.;
  bool got=false;
  for(int i=0;i<26;i++){
    t+=st; vec3 X=ro+rd*t; float f=SP_F(X);
    if(f>0.){ got=true; fn=f; break; }
    prev=t; fp=f; st*=1.17;
  }
  if(got){
    for(int i=0;i<6;i++){ float m=.5*(prev+t); vec3 X=ro+rd*m; float f=SP_F(X); if(f>0.){ t=m; fn=f; } else { prev=m; fp=f; } }
    t=prev+(t-prev)*clamp(-fp/max(fn-fp,1e-6),0.,1.);
  }
  vec3 X=ro+rd*t;
  float bx=bA*(sin(bW*X.y+bP)-c0),bz=.6*bA*(cos(bW*.61*X.y+1.1*bP)-c1);
  vec2 q=vec2(X.x-bx,X.z-bz);
  float th=K>1e-4?atan(K*q.x,1.-K*q.y):0.;
  float u=K>1e-4?th/K:q.x;
  edge=abs(dFdx(th))>2.||abs(dFdy(th))>2.;
  along=X.y;
  return vec3(u+e.w*X.y,X.y,0.);
}
// One sheet: a stretch of a song. Runs before everything else in prepare().
vec2 spaceOne(int b,vec2 p,out bool edge){
  edge=false;
  vec4 k=uG[b+I_spaceK];
  if(k.x<.5) return p;
  vec4 c=uG[b+I_spaceC],o=uG[b+I_spaceO],e=uG[b+I_spaceE];
  if(k.x<3.5){ float s; return spRelief(p,k,c,o,e,SP_GONE,s,edge).xy; }
  if(k.x<4.5){ float s,f; vec3 r=spPleat(p,k,c,o,e,s,f,edge); return r.xy+vec2(cos(e.w),sin(e.w))*((s>.5?.5+.5*f:.5*f)-f)/k.z; }      // one sheet: each face is half a cell of it, and at a share of half with no height it's exactly flat
  float al; return spTube(p,k,c,o,e,edge,al).xy;
}
// Two sheets: a transformation. pA and pB are where it lands on each, side is how much of it is B.
void spaceTwo(vec2 p,out vec2 pA,out vec2 pB,out float side,out bool edge){
  vec4 k=uF[F_SPACE],c=uF[F_SPACE+1],o=uF[F_SPACE+2],e=uF[F_SPACE+3],B=uF[F_SPACE+4];
  if(k.x<3.5){ vec3 X=spRelief(p,k,c,o,e,B.x,side,edge); pA=X.xy; pB=X.xy-B.yz; }
  else if(k.x<4.5){ float f; vec3 r=spPleat(p,k,c,o,e,side,f,edge); pA=r.xy; pB=r.xy; }
  else { float al; vec3 X=spTube(p,k,c,o,e,edge,al); pA=X.xy; pB=X.xy-B.yz; side=aaOf(al-B.w); }
}
#endif
`;
