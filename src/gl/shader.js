// The whole picture is one signed field and one threshold. All mixing happens on the field, before the threshold, so a
// grey crossfade cannot occur. Everything here is a pure function of the numbers in the block: no history, no lighting.
import { GLSL_INDEX, GLSL_SLOT } from '../pattern/layout.js';

export const VERT = `#version 300 es
out vec2 vUv;
void main(){ vec2 v=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv=v; gl_Position=vec4(v*2.-1.,0.,1.); }`;

export const FRAG = `#version 300 es
precision highp float;
precision highp int;
${GLSL_SLOT}
${GLSL_INDEX}
layout(std140) uniform Block { vec4 uG[NSLOTS*SLOT]; vec4 uF[FRAMEV]; };
uniform sampler2D uPush;
in vec2 vUv;
out vec4 outColor;
const float TAU=6.28318530718, PI=3.14159265359;

mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }
float tri(float x){ return 1.-4.*abs(fract(x)-.5); }
float aaOf(float sd){ float w=length(vec2(dFdx(sd),dFdy(sd))); return clamp(.5+sd/max(w,1e-6),0.,1.); }

// A smooth, slow boil: hand-cut paper, not noise
float boil(vec2 x,float t,float seed){
  return .36*(sin(x.x*1.7+x.y*.6+t*.7+seed)+sin(-x.x*.8+x.y*1.9-t*.5+seed*2.1)
     +.6*sin(x.x*3.1-x.y*2.3+t*1.1+seed*3.3)+.4*sin(x.y*4.3+x.x*1.1-t*.9+seed*.7));
}

// ---------------------------------------------------------------- surfaces: where this pixel lands, with no lighting at all
vec3 hitQuadric(int b,vec3 ro,vec3 rd,inout float cover){
  vec4 a0=uG[b+I_q0],a1=uG[b+I_q1],a2=uG[b+I_q2];
  mat4 Q=mat4(a0.x,a0.y,a0.z,a0.w, a0.y,a1.x,a1.y,a1.z, a0.z,a1.y,a1.w,a2.x, a0.w,a1.z,a2.x,a2.y);
  vec4 O=vec4(ro,1.),D=vec4(rd,0.),Qd=Q*D;
  float A=dot(D,Qd),B=dot(O,Qd),C=dot(O,Q*O);
  float disc=B*B-A*C;
  cover*=aaOf(disc);
  float q=-(B+(B<0.?-1.:1.)*sqrt(max(disc,0.)));
  float t1=abs(A)>1e-7?q/A:1e9,t2=abs(q)>1e-7?C/q:1e9;
  float tn=min(t1,t2),tf=max(t1,t2);
  float t=tn>1e-3?tn:tf;
  if(t<=1e-3||t>=1e8) cover=0.;
  return ro+max(t,0.)*rd;
}

vec3 surface(int b,vec2 p,inout float cover,inout float parity){
  vec4 sf=uG[b+I_surf],cam=uG[b+I_cam];
  if(sf.x<.5) return vec3(p,0.);
  float d=cam.w;
  mat2 Rp=rot(cam.x),Ry=rot(cam.y),Rr=rot(cam.z);
  vec3 rd=normalize(vec3(p,-max(d,.05)));
  rd.xy=Rr*rd.xy;
  if(sf.x<1.5){
    vec3 ro=vec3(0.,0.,d);
    rd.yz=Rp*rd.yz; ro.yz=Rp*ro.yz;
    rd.xy=Ry*rd.xy; ro.xy=Ry*ro.xy;
    vec3 h=hitQuadric(b,ro,rd,cover);
    if(sf.y<.5) return h;
    if(sf.y<1.5){ return vec3(atan(h.y,h.x)/TAU*sf.z+sf.w,h.z,0.); }                 // round the z axis: tunnel
    if(sf.y<2.5){ float R=max(length(h),1e-4);                                     // Mercator: conformal, so squares stay square
      float lon=atan(h.x,h.z)+sf.w, lat=asin(clamp(h.y/R,-1.,1.));
      return vec3(lon/TAU*sf.z, log(tan(lat*.5+PI*.25)+1e-5)/TAU*sf.z, 0.); }
    return vec3(atan(h.z,h.x)/TAU*sf.z+sf.w,h.y,0.);                               // round the y axis: tube
  }
  // a room: walls meeting with no outline drawn, only the pattern changing direction
  vec4 q2=uG[b+I_q2],rm=uG[b+I_room];
  float hw=q2.z,hh=q2.w;
  rd=normalize(vec3(p,-max(d*.4,.05)));
  rd.yz=Rp*rd.yz; rd.xz=Ry*rd.xz; rd.xy=Rr*rd.xy;
  float tx=(rd.x>0.?hw:-hw)/max(abs(rd.x),1e-5)*(rd.x>0.?1.:1.);
  tx=hw/max(abs(rd.x),1e-5);
  float ty=hh/max(abs(rd.y),1e-5);
  float tz=rd.z<0.?rm.x/max(-rd.z,1e-5):1e9;
  if(tz<min(tx,ty)){
    if(rm.z<.5) cover*=0.;
    vec3 h=rd*tz;
    return vec3(h.xy,0.);
  }
  if(tx<ty){ vec3 h=rd*tx; parity=rm.y>.5&&rd.x>0.?-parity:parity; return vec3(h.y,-h.z,0.); }
  vec3 h=rd*ty;
  vec2 fl=rot(rm.w)*vec2(h.x,-h.z);
  return vec3(fl,0.);
}

// ---------------------------------------------------------------- a pole: distance and angle, round, square or diamond
vec3 poleOf(vec4 P,vec2 x){
  vec2 d=x-P.xy; d.y*=P.w;
  float l2=length(d),rho;
  if(P.z>0.) rho=mix(l2,max(abs(d.x),abs(d.y)),P.z);
  else if(P.z<0.) rho=mix(l2,(abs(d.x)+abs(d.y))*.70711,-P.z);
  else rho=l2;
  rho=max(rho,1e-4);
  return vec3(rho,log(rho),atan(d.y,d.x)/TAU);
}

float matteOf(int b,vec2 p){
  vec4 m=uG[b+I_matte],sf0=uG[b+I_surf];
  if(sf0.x>.5&&sf0.x<1.5&&sf0.y>.5){ vec4 v=uG[b+I_view]; p=rot(-v.y)*p/max(v.x,1e-5)+v.zw; }   // it stays on the lens with the surface
  if(m.x<.5) return 1.;
  vec4 m2=uG[b+I_matte2],m3=uG[b+I_matte3];
  vec2 q=rot(-m3.x)*(p-m2.xy);
  float sd;
  if(m.x<1.5){
    float e=max(m.z,.5);
    float r=pow(pow(abs(q.x)/max(m2.z,1e-4),e)+pow(abs(q.y)/max(m2.w,1e-4),e),1./e);
    sd=(1.-r)*min(m2.z,m2.w);
  } else {
    // a crack: the wobbling line |g| < eps opening into a field
    float g=q.y-.18*sin(q.x*2.1+m3.y+1.3)-.09*sin(q.x*5.3-m3.y*.7)-.05*sin(q.x*9.1+m3.y*.4+2.);
    sd=m3.w-abs(g);
  }
  if(m.w!=0.) sd+=m.w*boil(p*3.,m3.y,1.1);
  if(m3.z>.5) sd=-sd;
  return aaOf(sd);
}

#ifdef HAND
// ---------------------------------------------------------------- the hand, coming up through the sheet
// A shape and nothing else: no lighting, no look of its own. It only says how high the sheet is at this pixel. main() turns that into
// where the pattern lands and how far its phase has slipped, once, for whichever slots are showing, so it survives a morph.
const vec2 H_LEAN=vec2(.30,.40);        // the ray's lean: a point at height z shows the sheet's point further along by this times z
const vec2 H_TIP=vec2(.29552,.95534);   // sin, cos of how far the hand tips back
const vec3 H_WRIST=vec3(0.,-.1,-.01);   // where the wrist is, on the hand
const vec3 H_ARM=vec3(0.,-.3,-.42);     // where the forearm goes, down into the sheet
const float H_FLARE=.3,H_MELT=.045;     // how wide the forearm melts into the sheet, and everything else
const int HSEG=14;
vec3 hA[HSEG],hB[HSEG]; float hR[HSEG];
int hAct[HSEG],hN; bool hPalm,hArm; float hOff,hOnHand,hProud=0.;

float smin(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float capsule(vec3 p,vec3 a,vec3 b,float r){ vec3 pa=p-a,ba=b-a; return length(pa-ba*clamp(dot(pa,ba)/(dot(ba,ba)+1e-9),0.,1.))-r; }

// Where the bones are for this much curl: four fingers of three bones, and a thumb of two
void handBones(float curl,float spread){
  for(int i=0;i<4;i++){
    float fi=float(i);
    float len=(i==0?.78:i==1?.99:i==2?1.06:.95)*.245;
    float c=curl*(1.+.12*(1.5-fi));
    vec3 a=vec3(-.066+fi*.044,.085,0.);
    vec3 dir=normalize(vec3((fi-1.5)*spread*.2,1.,0.));
    float r=.0225+fi*.0013,seg=.46;
    mat2 R0=rot(c*.55),R1=rot(c*.95);
    for(int j=0;j<3;j++){
      dir.yz=(j==0?R0:R1)*dir.yz;
      vec3 b=a+dir*len*seg;
      int n=i*3+j;
      hA[n]=a; hB[n]=b; hR[n]=r;
      a=b; r*=.9; seg=j==0?.32:.23;
    }
  }
  vec3 a=vec3(.07,-.055,.012),dir=normalize(vec3(.85,.6,.3));
  float r=.03;
  mat2 Rx=rot(curl*.6),Ry=rot(curl*.35);
  for(int j=0;j<2;j++){
    dir.xy=Rx*dir.xy; dir.yz=Ry*dir.yz;
    vec3 b=a+dir*(j==0?.095:.075);
    hA[12+j]=a; hB[12+j]=b; hR[12+j]=r;
    a=b; r*=.85;
  }
}

// The sheet and the hand as one surface. Only the bones this ray can reach are in the sum.
float handField(vec3 q){
  float d=q.y*H_TIP.x+q.z*H_TIP.y+hOff;
  if(hArm) d=smin(d,capsule(q,H_WRIST,H_ARM,.058),H_FLARE);
  float h=1e3;
  if(hPalm){
    vec3 e=abs(q-vec3(0.,-.01,0.))-vec3(.068,.08,.017);
    h=length(max(e,0.))+min(max(e.x,max(e.y,e.z)),0.)-.03;
    h=smin(h,capsule(q,vec3(-.035,-.08,0.),vec3(.04,-.085,0.),.045),.04);
  }
  for(int n=0;n<hN;n++){ int i=hAct[n]; h=smin(h,capsule(q,hA[i],hB[i],hR[i]),.014); }
  hOnHand=.03-1.2*h;       // above nothing but this bone's own surface: the melt into the sheet takes it down to the sheet's
  return smin(d,h,H_MELT);
}

// How high the sheet stands at this pixel, in picture units. 0 away from the hand, and it costs nothing there.
float handHeight(vec2 p){
  vec4 a=uF[F_HAND],b=uF[F_HAND+1];
  float s=max(b.w,1e-3),zw=mix(-.75*s,a.z,a.w);
  vec2 cs=vec2(cos(b.z),sin(b.z));
  vec2 c=p-a.xy; c=vec2(cs.x*c.x+cs.y*c.y,-cs.y*c.x+cs.x*c.y)/s;     // into the hand's own turn, from the wrist
  hOnHand=-1.; hProud=0.;
  if(abs(c.x)>.44||c.y<-.5||c.y>.55) return 0.;
  // from the world to the hand: unturn, untip, unscale
  #define H_IN(v) vec3(cs.x*(v).x+cs.y*(v).y,H_TIP.y*(-cs.y*(v).x+cs.x*(v).y)+H_TIP.x*(v).z,-H_TIP.x*(-cs.y*(v).x+cs.x*(v).y)+H_TIP.y*(v).z)
  vec3 rd=H_IN(normalize(vec3(-H_LEAN,-1.)));
  float ztop=zw+.62*s;
  vec3 w0=vec3(p+H_LEAN*ztop-(a.xy+H_LEAN*zw),ztop-zw);
  vec3 ro=H_IN(w0)/s+H_WRIST;
  hOff=(zw/s)-(H_WRIST.y*H_TIP.x+H_WRIST.z*H_TIP.y);                 // the sheet, from the hand
  float t0=1e3,t1=(ro.y*H_TIP.x+ro.z*H_TIP.y+hOff)/max(-(rd.y*H_TIP.x+rd.z*H_TIP.y),1e-3);     // t1: where it reaches the sheet
  // which parts can this ray touch at all. Mostly none, and then it's the sheet.
  vec3 A=H_WRIST-ro,B=H_ARM-ro; float ta=dot(A,rd),tb=dot(B,rd);
  hArm=capsule(vec3(0.),A-rd*ta,B-rd*tb,.058)<H_FLARE+.01;
  if(hArm) t0=t1-H_FLARE;
  vec3 pc=vec3(0.,-.03,0.)-ro; float tp=dot(pc,rd);
  hPalm=length(pc-rd*tp)<.2;
  if(hPalm) t0=min(t0,tp-.2);
  hN=0;
  if(abs(c.x-.03)<.3&&c.y>-.05&&c.y<.52){
    handBones(b.x,b.y);
    for(int i=0;i<HSEG;i++){
      A=hA[i]-ro; B=hB[i]-ro; ta=dot(A,rd); tb=dot(B,rd);
      if(capsule(vec3(0.),A-rd*ta,B-rd*tb,hR[i])>H_MELT+.012) continue;
      hAct[hN++]=i;
      t0=min(t0,min(ta,tb)-hR[i]-H_MELT);
    }
  }
  if(hN==0&&!hPalm&&!hArm) return 0.;
  float t=max(t0,0.);
  bool hit=false;
  for(int i=0;i<26&&t<t1;i++){
    float d=handField(ro+rd*t);
    if(d<.0007){ hit=true; break; }
    t+=d*.92;
  }
  // a ray still creeping past a finger at the end of this has missed it: it goes on down to the sheet
  vec3 q=ro+rd*(hit?t:t1);
  handField(q);
  float z=q.y*H_TIP.x+q.z*H_TIP.y+hOff;
  // how far this point stands proud of the bone it's on: nothing at the bone's edge, the bone's radius along its top
  hProud=max(z,0.)*s;
  if(hOnHand>-.03){
    // the bones nearest this point, each by how near it is, so the lines don't step where one bone gives way to the next
    float sw=0.,sa=0.;
    if(hPalm){
      vec3 e=vec3(clamp(q.x,-.068,.068),clamp(q.y,-.09,.07),0.);
      float w=exp(-max(length(q-e)-.047,0.)*140.);
      sw=w; sa=w*(e.y*H_TIP.x+e.z*H_TIP.y);
    }
    for(int n=0;n<hN;n++){
      int i=hAct[n]; vec3 pa=q-hA[i],ba=hB[i]-hA[i];
      vec3 k=hA[i]+ba*clamp(dot(pa,ba)/(dot(ba,ba)+1e-9),0.,1.);
      float w=exp(-max(length(q-k)-hR[i],0.)*140.);
      sw+=w; sa+=w*(k.y*H_TIP.x+k.z*H_TIP.y);
    }
    if(sw>1e-6) hProud=mix(hProud,max(z-sa/sw-hOff,0.)*s,smoothstep(-.03,.03,hOnHand));
  }
  return max(z,0.)*s;
}
#endif

float gPh[3*FAM],gGn[3*FAM],gDu[3*FAM]; vec2 gGr[3*FAM]; bool gOn[3*FAM];
float gRnd[3],gSum[3];
bool gBreak=false;
float gRing=0.;                  // what the ripples have done at this pixel, in picture units
float gLift=0.;                  // how far the sheet's phase has slipped at this pixel, in cycles. Each family takes its own share, or a check slipping by half a cycle both ways would look the same
const vec4 LIFT=vec4(1.,.5,.75,.25);

// Everything up to the threshold: where this pixel lands, what each family's phase and gradient are. Returns coverage of the surface.
float prepare(int K,int b,vec2 p){
  float cover=1.,parity=1.,slipY=0.;
  // On a surface wrapped by angle the around-count has to stay a whole number, or there's a seam. So the view can't scale or turn
  // the texture there. It acts on the camera instead, like a lens: zoom and roll, about the same point as everywhere else.
  vec2 p0=p;
  vec4 v=uG[b+I_view],sf0=uG[b+I_surf];
  bool lensView=sf0.x>.5&&sf0.x<1.5&&sf0.y>.5;
  if(lensView) p=rot(-v.y)*p/max(v.x,1e-5)+v.zw;
  vec3 X=surface(b,p,cover,parity);

  // cloth: a rippled sheet seen at an angle, so it hides behind itself where it folds
  vec4 sh=uG[b+I_wSheet];
  if(sh.x!=0.){
    mat2 Rs=rot(sh.w); vec2 q=X.xy;
    for(int i=0;i<3;i++){ vec2 r=Rs*q; float h=sh.x*(sin(sh.y*r.x+sh.z)+.5*sin(1.7*sh.y*r.y-sh.z*.6)+.3*sin(2.9*sh.y*(r.x+r.y)+sh.z*.4)); q=X.xy+vec2(0.,h); }
    X.xy=q;
  }

  // the view: this zooms everything including the warps below
  if(!lensView) X.xy=rot(-v.y)*X.xy/max(v.x,1e-5)+v.zw;

  // mattes that also wrap the pattern
  vec4 rb=uG[b+I_mRibbon];
  if(rb.x>.5){
    vec4 r2=uG[b+I_mRibbon2];
    vec2 q=rot(r2.z)*X.xy; float s=q.x;
    float c=rb.y*sin(r2.x*s*.7+r2.y),Wd=rb.z*cos(rb.w*s+r2.y*.6);
    float vv=(q.y-c)/max(abs(Wd),1e-3);
    cover*=aaOf(abs(Wd)-abs(q.y-c));
    if(Wd<0.) parity=-parity;
    X.xy=vec2(s,asin(clamp(vv,-1.,1.))/1.5708*r2.w*.1);
  }
  vec4 bl=uG[b+I_mBlobs];
  if(bl.x>.5){
    float Gs=0.; vec2 u=vec2(0.);
    for(int i=0;i<3;i++){ vec4 bi=uG[b+I_mBlobA+i]; vec2 d=X.xy-bi.xy; float gi=bi.z*bi.z/(dot(d,d)+1e-4); u+=gi*(rot(bi.w)*d); Gs+=gi; }
    cover*=aaOf(Gs-1.);
    X.xy=u/max(Gs,1e-5); X.z+=bl.y/max(Gs,1e-3);
  }

  // the warp bank: fixed order, amount 0 means skipped, so any pattern can slide into any other
  vec4 w=uG[b+I_wFold];
  if(w.x>=2.){ vec2 c=X.xy-w.zw; float th=atan(c.y,c.x)+w.y,sec=TAU/w.x; th=abs(mod(th,sec)-sec*.5); X.xy=length(c)*vec2(cos(th),sin(th)); }
  w=uG[b+I_wLens];
  if(w.x!=1.){ vec2 c=X.xy-w.yz; float r=max(length(c),1e-5); X.xy=w.yz+c/r*w.w*pow(r,w.x); }
  w=uG[b+I_wSwirl];
  if(w.x!=0.||w.z!=0.){ vec2 c=X.xy-vec2(w.w,0.); float r2=dot(c,c); X.xy=vec2(w.w,0.)+rot(w.x*exp(-r2/max(w.y*w.y,1e-5))+w.z*.5*log(r2+1e-6))*c; }
  w=uG[b+I_wBulge];
  if(w.x!=0.){ vec2 c=X.xy-w.zw; X.xy=w.zw+c/(1.+w.x*exp(-dot(c,c)/max(w.y*w.y,1e-5))); }
  w=uG[b+I_wSqueeze];
  if(w.x!=0.){ mat2 R=rot(-w.w); vec2 q=R*X.xy; q.x+=w.x*atan((q.x-w.y)/max(w.z,1e-4)); X.xy=rot(w.w)*q; }
  w=uG[b+I_wBowtie];
  if(w.x!=0.){ mat2 R=rot(-w.w); vec2 q=R*X.xy; q.y=mix(q.y,q.y*(1.+w.y)/(abs(q.x-w.z)+w.y),w.x); X.xy=rot(w.w)*q; }
  w=uG[b+I_wBend1];
  if(w.x!=0.){ vec2 dir=vec2(cos(w.w),sin(w.w)); X.xy+=vec2(-dir.y,dir.x)*w.x*sin(w.y*dot(X.xy,dir)+w.z); }
  w=uG[b+I_wBend2];
  if(w.x!=0.){ vec2 dir=vec2(cos(w.w),sin(w.w)); X.xy+=vec2(-dir.y,dir.x)*w.x*sin(w.y*dot(X.xy,dir)+w.z); }
  w=uG[b+I_wRipple];
  if(w.x!=0.){ vec2 c=X.xy-vec2(w.w,0.); float r=max(length(c),1e-5); X.xy+=c/r*w.x*sin(w.y*r-w.z); }
  w=uG[b+I_wZig];
  if(w.x!=0.){ X.y+=w.x*tri(w.y*X.x+w.z*floor(w.w*X.y)); }
  w=uG[b+I_wTeeth];
  if(w.x!=0.||w.z!=0.){ float col=floor(w.y*X.x); X.y*=1.+w.x*(.5+.5*tri(w.y*X.x)); slipY=(mod(col,2.)*2.-1.)*w.z; }
  w=uG[b+I_wConf];
  if(w.x!=0.){
    vec4 a=uG[b+I_wConfA],c=uG[b+I_wConfB];
    vec2 z=X.xy, sum=vec2(0.);
    for(int j=0;j<3;j++){
      vec2 aj=j==0?a.xy:(j==1?a.zw:c.zw);
      float cj=j==0?c.x:(j==1?c.y:1.-step(1e-4,abs(c.z)+abs(c.w)));
      if(j==2&&abs(c.z)+abs(c.w)<1e-4) continue;
      if(j==2) cj=c.x;
      if(cj==0.) continue;
      vec2 d=z-aj; float lr=.5*log(dot(d,d)+1e-7),th=atan(d.y,d.x);
      vec2 bz;
      if(abs(w.y)<1e-3) bz=vec2(lr,th);
      else { float e=exp(w.y*lr); bz=(vec2(e*cos(w.y*th),e*sin(w.y*th))-vec2(1.,0.))/w.y; }
      sum+=cj*bz;
    }
    sum=rot(-w.z)*sum*w.w;
    X.xy=mix(z,vec2(sum.y,sum.x),w.x);
  }
  w=uG[b+I_wDroste];
  if(w.x!=0.){
    float r=max(length(X.xy),1e-5),th=atan(X.y,X.x),lr=log(r),k=w.x/TAU;
    float wx=lr+k*th,wy=th-k*lr;
    wx=mod(wx+w.y,w.x);
    X.xy=exp(wx)*vec2(cos(wy),sin(wy));
  }

  // Nothing is ever empty. Past a surface's edge or a shape, the same lines carry on flat, turned: the outline exists only because
  // the pattern changes direction there. When two patterns are bending together the jump in phase shrinks away, so edges dissolve.
  cover*=matteOf(b,p0);
  vec4 bgv=uG[b+I_bg];
  bool seam=false;
  if(bgv.x>.5){
    float inside=step(.5,cover);
    seam=dFdx(inside)!=0.||dFdy(inside)!=0.;
    if(inside<.5){ X=vec3(rot(bgv.y)*p0/(max(bgv.z,1e-4)*max(v.x,1e-5))+vec2(bgv.w,0.),0.); }
    cover=1.;
  }
  if(parity<0.==(uG[b+I_shape].w>.5)) parity=1.; else parity=-1.;

  // the families: each is a phase, each is XOR-ed in. This is the whole pattern language.
  vec4 tn=uG[b+I_tune];
  vec3 b1=poleOf(uG[b+I_p1],X.xy),b2=poleOf(uG[b+I_p2],X.xy);
  vec2 dXx=dFdx(X.xy),dXy=dFdy(X.xy);
  vec4 P1=uG[b+I_p1],P2=uG[b+I_p2];
  vec2 v1=X.xy-P1.xy,v2=X.xy-P2.xy; v1.y*=P1.w; v2.y*=P2.w;
  float i1=1./(TAU*max(dot(v1,v1),1e-9)),i2=1./(TAU*max(dot(v2,v2),1e-9));
  vec2 gT1=vec2(v1.x*dXx.y*P1.w-v1.y*dXx.x,v1.x*dXy.y*P1.w-v1.y*dXy.x)*i1;
  vec2 gT2=vec2(v2.x*dXx.y*P2.w-v2.y*dXx.x,v2.x*dXy.y*P2.w-v2.y*dXy.x)*i2;
  bool wrapped=uG[b+I_surf].y>.5;
  vec2 fq=lensView?vec2(1.,tn.x):vec2(tn.x);          // and the lines knob only changes what runs along it
  for(int i=0;i<FAM;i++){
    vec4 fa=uG[b+3*i],fb=uG[b+3*i+1],fc=uG[b+3*i+2];
    int k=K*FAM+i;
    gOn[k]=fc.w>=.5;
    if(!gOn[k]) continue;
    // the smooth part of the phase; angles are added afterwards, with their exact gradient, so a wrap never shows
    float sm=dot(fa.xyz,vec3(X.xy*fq,X.z))+fb.x*b1.x+fb.y*b1.y+fc.x*b2.x+fc.y*b2.y;
    if(tn.y!=0.) sm+=tn.y*boil(X.xy*tn.z,tn.w,float(i)*2.3+.7);
    sm+=gLift*LIFT[i];
    vec2 g=vec2(dFdx(sm),dFdy(sm));
    // Across the wrap the phase jumps by the around-count, which only that one pixel's gradient sees. Take off exactly that, so a
    // real gradient too fine to draw stays too fine, and doesn't alias into specks at the far end of a tunnel.
    if(lensView){ float J=abs(fa.x)*sf0.z; if(J>1e-3) g-=J*round(g/J); }
    else if(wrapped) g-=round(g);
    g+=fb.z*gT1+fc.z*gT2;
    if(seam){ float gl=length(g); if(gl>.5) g*=.5/gl; }     // the one pixel across a jump between two fields isn't a real gradient
    if(gBreak){ float gl=length(g); if(gl>.2) g*=.2/gl; }   // nor is the one across a finger's edge, or it would draw an outline
    sm+=gRing*min(length(g)*uF[8].y*.5,9.);                 // a ring moves a line by the same distance however big it is, up to a point
    gPh[k]=sm+fb.z*b1.z+fc.z*b2.z+fa.w+fa.y*tn.x*slipY;
    if(parity<0.){ gPh[k]+=.5; parity=1.; }                 // half a cycle on one family inverts the whole XOR
    gGr[k]=g; gGn[k]=max(length(g),1e-5); gDu[k]=fb.w;
  }
  gRnd[K]=uG[b+I_shape].x; gSum[K]=uG[b+I_shape].y;
  return cover;
}

// Exact box filter of a periodic band centred on fract(x)=.5, filling fraction h of the cycle; g is cycles per pixel.
// A one-pixel ramp at coarse lines, hairlines that fade by true area instead of twinkling, exact solids at h=0 and h=1.
float bandI(float x,float h){ float f=floor(x); return f*h+clamp(x-f-.5+.5*h,0.,h); }
float band(float x,float h,float g){ return clamp((bandI(x+.5*g,h)-bandI(x-.5*g,h))/g,0.,1.); }

// k0..k1 is a run of families, XOR-ed together. While two patterns morph it spans both of them.
float inkBand(int k0,int k1,float th){
  float T=abs(th),P=1.,Q=1.;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float d=gDu[k],t=T*(1.-smoothstep(.85,1.,abs(d))),x=gPh[k],g=gGn[k];
    float p=band(x,clamp(.5*(1.-t-d),0.,1.),g);       // tri(x)-d >  t
    float q=band(x+.5,clamp(.5*(1.-t+d),0.,1.),g);    // tri(x)-d < -t
    P*=p+q; Q*=p-q;
  }
  return th>=0.?.5*(P+Q):1.-.5*(P-Q);
}

// Soft path: dots and quasicrystals. Analytic gradient, with a curvature floor so the ramp can't collapse at a crest.
float inkSoft(int k0,int k1,float rnd,float smm,float th){
  float mn=9.,sg=1.,pr=1.,su=0.,nOpen=0.,g1=1e-5,g2=1e-5; vec2 gm=vec2(0.),gp=vec2(0.),gs=vec2(0.);
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float x=gPh[k],d=gDu[k],fr=fract(x);
    float a=mix(1.-4.*abs(fr-.5),-cos(TAU*x),rnd)-d;
    vec2 da=mix(fr<.5?4.:-4.,TAU*sin(TAU*x),rnd)*gGr[k];
    float off=smoothstep(.85,1.,abs(d)),sa=a<0.?-1.:1.;
    sg*=sa;
    if(abs(a)+2.*off<mn){ mn=abs(a)+2.*off; gm=sa*da*(1.-off); }
    float a2=mix(a,sa,off); vec2 da2=da*(1.-off);
    gp=gp*a2+pr*da2; pr*=a2;
    su+=a; gs+=da; nOpen+=1.;
    if(off<.5){ float gg=gGn[k]; if(gg>g1){ g2=g1; g1=gg; } else if(gg>g2) g2=gg; }
  }
  if(g2<=1e-5) g2=g1;
  float nr=1./sqrt(max(nOpen,1.));
  float f=mix(mix(sg*mn,pr,rnd),su*nr,smm);
  vec2 gf=mix(mix(sg*gm,gp,rnd),gs*nr,smm);
  float H=19.74*g1*g1*max(rnd,smm);
  float w=sqrt(dot(gf,gf)+H*H+1e-10);
  float c=clamp(.5+(f-th)/w,0.,1.);
  float A=max(1.-abs(th),0.)/(6.283*g1*g2);            // element area in pixels
  float gain=clamp(A/.5,0.,1.);                        // a vanishing speck keeps its true area
  c=th>=0.?c*gain:1.-(1.-c)*gain;
  return mix(c,.5*(1.-th),smoothstep(.22,.45,g1));     // below Nyquist, the true average
}

float inkOf(int K,int k0,int k1,float th){
  return gRnd[K]>0.||gSum[K]>0.?inkSoft(k0,k1,gRnd[K],gSum[K],th):inkBand(k0,k1,th);
}

#ifdef PLATES
// Beyond: the same pattern printed a second time, its phases moved. No family is evaluated again. Each family runs ahead by its own
// share of the offset, plus a first-order shift, phase + dot(gradient, shift).
float gW[2*FAM],gDv[2*FAM];
void plateMove(int k1){
  float r=uF[5].y; vec2 sh=vec2(uF[5].z,uF[1].a);
  for(int k=0;k<k1;k++){
    if(!gOn[k]) continue;
    float dv=r*gW[k]+dot(gGr[k],sh)*(1.-smoothstep(.25,.5,gGn[k])); dv-=round(dv);   // too fine to draw, the shift would only be noise
    gDv[k]=dv; gPh[k]+=dv;
  }
}
// How much of this pixel the two plates disagree on, once they've moved. Within one family that's two exact bands at its edges; across
// families they XOR, like the ink itself. Only an edge pixel or a hairline needs this: elsewhere the two inks already say.
float plateDis(int k0,int k1){
  float dis=1.;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float dv=gDv[k],d=gDu[k],hp=clamp(.5*(1.-d),0.,1.),h=min(hp,1.-hp),a=abs(dv),e=min(a,h),s=dv<0.?-1.:1.,x=gPh[k]-dv+(hp<=.5?0.:.5),g=gGn[k];
    dis*=1.-2.*clamp(band(x-s*.5*(h-e),e,g)+band(x+s*(.5*(h-e)+a),e,g),0.,1.);
  }
  return .5*(1.-dis);
}
#endif

void main(){
  vec2 res=uF[8].xy;
  vec2 p=(gl_FragCoord.xy-.5*res)/res.y*2.;         // frame coordinates: y runs -1..1
  vec2 p0=p;
  vec4 pr=uF[6];
  if(pr.z!=0.){ vec2 d=p-pr.xy; p+=pr.z*d*exp(-dot(d,d)/max(pr.w*pr.w,1e-5)); }
  if(uF[8].w>.5) p+=texture(uPush,gl_FragCoord.xy/res).xy;

  // twist, pinch, bulge: the sheet wound or drawn about one point, and let go slowly
  float wt=uF[0].w,wp=uF[5].w;
  if(wt!=0.||wp!=0.){
    vec2 d=p-uF[9].yz; float e=exp(-dot(d,d)/max(uF[9].w*uF[9].w,1e-5));
    p=uF[9].yz+rot(wt*e)*d*(1.+wp*e);
  }

  // ripples: rings running out through the sheet, each a little packet of waves that spreads as it goes. They push the lines outward,
  // which alone would miss lines running the same way, and each family's phase slips too, so a ring shows all the way round.
  for(int i=0;i<NRIP;i++){
    vec4 r=uF[F_RIP+i];
    if(r.w==0.) continue;
    vec2 d=p-r.xy; float l=length(d),fr=l-r.z,wd=.16+.1*r.z;
    float wave=sin(fr*21.)*exp(-fr*fr/(wd*wd))*r.w*smoothstep(0.,.12,l);
    p+=d/max(l,1e-4)*wave;
    gRing+=wave;
  }

  // the hand: the height of the sheet here decides where the pattern lands and how far its phase has slipped. Height jumps where a
  // finger stands clear of the sheet, so the lines break there, and that's the whole of its outline.
#ifdef HAND
  if(uF[F_HAND].w>.001){
    float hz=handHeight(p0);
    vec2 slope=vec2(dFdx(hz),dFdy(hz))*res.y*.5;
    float sl=dot(slope,slope);
    // Lines ride up over each bone by how proud of it they are, which is nothing at its edge, so at the outline the slip is the same
    // half a cycle whatever the pattern's size, and the two sides never happen to line up.
    p+=H_LEAN*hProud;
    gLift+=.5*smoothstep(-.03,.03,hOnHand)+.3*hz;
    gBreak=sl>36.;
  }
#endif

  // the song in the sheet: the chord's shape and the pulse are lenses, and the tune travels out through the lines
  for(int i=0;i<4;i++){
    vec4 q=uF[F_POSE+i];
    if(q.z==0.) continue;
    vec2 d=p-q.xy;
    p+=q.z*d*exp(-dot(d,d)/max(q.w*q.w,1e-4));
  }
  vec4 ml=uF[F_MEL];
  if(ml.x!=0.){
    float r=length(p),x=ml.z<.5?r:(ml.z<1.5?abs(p.x):abs(p.y));
    float fi=clamp(x*ml.y,0.,30.99); int mk=int(fi);
    float mv=mix(uF[F_MELS+mk/4][mk%4],uF[F_MELS+(mk+1)/4][(mk+1)%4],fi-float(mk));
    vec2 dir=ml.z<.5?p/max(r,1e-3)*smoothstep(0.,.25,r):(ml.z<1.5?vec2(0.,1.):vec2(1.,0.));
    p+=dir*ml.x*mv;
  }

  float th=uG[I_shape].z,dl=uF[5].x;
  vec4 dv=uF[F_DIVE];
  float o=uG[I_matte].y; if(o==2.) o=0.;
#ifdef PLATES
  bool plates=uF[5].y!=0.;
  if(plates){ int wa=int(uF[3].a),wb=int(uF[4].a); for(int i=0;i<FAM;i++){ gW[i]=float((wa>>(5*i))&31)/14.-1.; gW[FAM+i]=float((wb>>(5*i))&31)/14.-1.; if(dv.w<.5) gW[i]=mix(gW[i],gW[FAM+i],uF[2].a); } }
#endif
  float c,c2,cP,dP=0.;
#ifdef FLIGHT
  if(dv.w>.5){
    // A flight into one element of a pattern: the other pattern is what's inside that element, so there is nothing laid over anything.
    bool bOuter=dv.w>2.5,inWhite=dv.w==1.||dv.w==3.;
    vec2 pz=dv.xy+(p-dv.xy)/dv.z;
    float oB=uG[SLOT+I_matte].y; if(oB==2.) oB=0.;
    float thB=uG[SLOT+I_shape].z;
    float mA=prepare(0,0,bOuter?p:pz),mB=prepare(1,SLOT,bOuter?pz:p);
    float cA=mix(o,inkOf(0,0,FAM,th),mA),cB=mix(oB,inkOf(1,FAM,2*FAM,thB),mB);
    float outer=bOuter?cB:cA,inner=bOuter?cA:cB;
    c=inWhite?outer*inner:1.-(1.-outer)*(1.-inner);
    c2=c; cP=c;
#ifdef PLATES
    if(plates){
      float cA0=cA,cB0=cB;
      for(int i=0;i<FAM;i++) gW[(bOuter?FAM:0)+i]*=uF[2].a;      // the outer pattern's plates are shut by the time its element fills the frame
      plateMove(2*FAM);
      cA=mix(o,inkOf(0,0,FAM,th),mA); cB=mix(oB,inkOf(1,FAM,2*FAM,thB),mB);
      outer=bOuter?cB:cA; inner=bOuter?cA:cB;
      float o0=bOuter?cA0:cB0,i0=bOuter?cB0:cA0;     // the first plate's, for what each pattern contributes here
      cP=inWhite?outer*inner:1.-(1.-outer)*(1.-inner);
      dP=abs(c-cP);
      if(min(c+cP,2.-c-cP)>dP){
        float dOuter=plateDis(bOuter?FAM:0,bOuter?2*FAM:FAM)*(bOuter?mB:mA),dInner=plateDis(bOuter?0:FAM,bOuter?FAM:2*FAM)*(bOuter?mA:mB);
        dP=inWhite?dInner*outer*o0+dOuter*inner*i0:dInner*(1.-outer)*(1.-o0)+dOuter*(1.-inner)*(1.-i0);
      }
    }
#endif
  } else
#endif
  {
    float ma=prepare(0,0,p);
    int k1=FAM;
    if(uF[0].y>.5){
      // Two patterns at once: each family bends into its partner, phase by phase, so each line travels to where it's going.
      float mb=prepare(1,SLOT,p),T=uF[0].x;
      vec4 pa=uF[F_PAIR];
      for(int i=0;i<FAM;i++){
        int j=int(pa[i]);
        if(j<0) continue;
        int qa=i,qb=FAM+j;
        if(!gOn[qa]||!gOn[qb]) continue;
        gPh[qa]=mix(gPh[qa],gPh[qb],T);
        gGr[qa]=mix(gGr[qa],gGr[qb],T);
        gGn[qa]=max(length(gGr[qa]),1e-5);
        gDu[qa]=mix(gDu[qa],gDu[qb],T);
#ifdef PLATES
        gW[qa]=mix(gW[qa],gW[qb],T);
#endif
        gOn[qb]=false;
      }
      k1=2*FAM;
      ma=mix(ma,mb,T);
    }
    c=mix(o,inkOf(0,0,k1,th),ma);
    c2=dl!=0.?mix(o,inkOf(0,0,k1,th+dl),ma):c;
    cP=c;
#ifdef PLATES
    if(plates){
      plateMove(k1); cP=mix(o,inkOf(0,0,k1,th),ma);
      dP=abs(c-cP); if(min(c+cP,2.-c-cP)>dP) dP=plateDis(0,k1)*ma;
    }
#endif
  }
  // the hand's moire: a lifted copy of the same sheet, XOR-ed on top
  vec4 so=uF[7];
  if(so.w>0.){
    float ms=prepare(2,0,rot(so.z)*p+so.xy);
    float cs=mix(o,inkOf(2,2*FAM,3*FAM,th),ms);
    c=mix(c,c+cs-2.*c*cs,so.w); c2=c;
    cP=mix(cP,cP+cs-2.*cP*cs,so.w);
  }
  vec3 col;
  // gamma-correct coverage, so an edge pixel carries half the light rather than looking dark
#ifdef PLATES
  if(plates){
    // Four flat inks by area: neither plate, the first only, the second only, both. Equal plates leave exactly black and white.
    float dd=clamp(dP,abs(c-cP),min(c+cP,2.-c-cP)),both=.5*(c+cP-dd);
    col=pow(max((1.-c-cP+both)*uF[1].rgb+(c-both)*uF[3].rgb+(cP-both)*uF[4].rgb+both*uF[2].rgb,vec3(0.)),vec3(.4545));
  }
  else
#endif
  if(dl==0.) col=mix(uF[1].rgb,uF[2].rgb,pow(c,.4545));
  else {
    float a=pow(max(c,c2),.4545),b=pow(min(c,c2),.4545);
    col=mix(mix(uF[1].rgb,uF[3].rgb,a),uF[2].rgb,b);
  }
  outColor=vec4(col,1.);
}`;

// Brush pass: paints displacement into a small texture, which springs back on its own.
export const BRUSH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec4 uBrush;   // x,y in uv; z radius (uv height units); w on
uniform vec4 uBrush2;  // dx,dy displacement, aspect, heal rate per frame
in vec2 vUv;
out vec4 o;
void main(){
  vec2 v=texture(uPrev,vUv).xy*(1.-uBrush2.w);
  if(uBrush.w>.5){
    vec2 d=vUv-uBrush.xy; d.x*=uBrush2.z;
    v+=uBrush2.xy*exp(-dot(d,d)/(uBrush.z*uBrush.z));
  }
  o=vec4(v,0.,1.);
}`;
