// The hand coming up through the sheet. Only in programs built with HAND.
export default `#ifdef HAND
// ---------------------------------------------------------------- the hand, coming up through the sheet
// A shape and nothing else: no lighting, no look of its own. It only says how high the sheet is at this pixel. main() turns that into
// where the pattern lands and how far its phase has slipped, once, for whichever slots are showing, so it survives a morph.
const vec2 H_LEAN=vec2(.30,.40);        // the ray's lean: a point at height z shows the sheet's point further along by this times z
const vec2 H_TIP=vec2(.29552,.95534);   // sin, cos of how far the hand tips back
const vec3 H_WRIST=vec3(0.,-.1,-.01);   // where the wrist is, on the hand
const vec3 H_ARM=vec3(0.,-.3,-.42);     // where the forearm goes, down into the sheet
const float H_FLARE=.12,H_MELT=.012;    // how wide the forearm melts into the sheet, and everything else
const int HSEG=14;
vec3 hA[HSEG],hB[HSEG]; float hR[HSEG];
int hAct[HSEG],hN; bool hPalm,hArm; float hOff,hOnHand,hBody,hEdge=-1.,hProud=0.;

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
  // the thumb starts inside the palm, so there's no gap to it, and lies in against the side of it
  vec3 a=vec3(.062,-.05,.012),dir=normalize(vec3(.62,.72,.22));
  float r=.031;
  mat2 Rx=rot(curl*.6),Ry=rot(curl*.35);
  for(int j=0;j<2;j++){
    dir.xy=Rx*dir.xy; dir.yz=Ry*dir.yz;
    vec3 b=a+dir*(j==0?.085:.062);
    hA[12+j]=a; hB[12+j]=b; hR[12+j]=r;
    a=b; r*=.86;
  }
}

// The sheet and the hand as one surface. Only the bones this ray can reach are in the sum.
float handField(vec3 q){
  float d=q.y*H_TIP.x+q.z*H_TIP.y+hOff,d0=d,arm=1e3;
  if(hArm){ arm=capsule(q,H_WRIST,H_ARM,.058); d=smin(d,arm,H_FLARE); }
  float h=1e3;
  if(hPalm){
    vec3 e=abs(q-vec3(0.,-.01,0.))-vec3(.068,.08,.017);
    h=length(max(e,0.))+min(max(e.x,max(e.y,e.z)),0.)-.03;
    h=smin(h,capsule(q,vec3(-.035,-.08,0.),vec3(.04,-.085,0.),.045),.04);
  }
  for(int n=0;n<hN;n++){ int i=hAct[n]; h=smin(h,capsule(q,hA[i],hB[i],hR[i]),.014); }
  hOnHand=.03-1.2*h;       // above nothing but this bone's own surface: the melt into the sheet takes it down to the sheet's
  hBody=smin(h,arm,.02); hEdge=d0-hBody;   // nearer the hand than the flat sheet: that's on the hand. It changes sign exactly at the outline, all the way round
  return smin(d,h,H_MELT);
}

// How high the sheet stands at this pixel, in picture units. 0 away from the hand, and it costs nothing there.
float handHeight(vec2 p){
  vec4 a=uF[F_HAND],b=uF[F_HAND+1];
  float s=max(b.w,1e-3),zw=mix(-.25*s,a.z,a.w);
  vec2 cs=vec2(cos(b.z),sin(b.z));
  vec2 c=p-a.xy; c=vec2(cs.x*c.x+cs.y*c.y,-cs.y*c.x+cs.x*c.y)/s;     // into the hand's own turn, from the wrist
  hOnHand=-1.; hEdge=-1.; hProud=0.;
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
  float near=1e3;      // how close this ray came to the hand, in the hand's own units: what a pixel just outside its outline needs to smooth it
  for(int i=0;i<26&&t<t1;i++){
    float d=handField(ro+rd*t);
    near=min(near,hBody);
    if(d<.0007){ hit=true; break; }
    t+=d*.92;
  }
  // a ray still creeping past a finger at the end of this has missed it: it goes on down to the sheet
  vec3 q=ro+rd*(hit?t:t1);
  handField(q);
  near=min(near,hBody);
  hEdge=max(hEdge,0.)>0.?hEdge:-max(near,0.);
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

`;
