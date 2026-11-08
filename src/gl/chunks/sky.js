// The sheet as a world (kinds 9 and up of the sheet in space): it curls up round you into a ball you're inside, gathers into a ball under you with a sky round it, or folds into a canyon of steps.
// Only coordinates, as in space.js: what comes out goes into prepare() as if it were a point on the flat frame, so whatever the pattern is lies flat on it. No lighting, no normals.
// Every surface here is met by a ray in closed form (a sphere is a quadratic, a step is a plane), so there's no marching. It's behind its own program bit (SKY in src/gl/renderer.js), and the
// sheet-in-space programs don't have it: a ride or a swell costs what it did, and these don't pay for those.
//
// The slot's own space numbers, uG[b+I_spaceK..E]:
//   k  kind, amp, f, ph     kind: 9 dome, 10 planet, 11 canyon
//   c  pitch, yaw, roll, lens     the camera's turn, and its lens. Looking straight down (all 0) from a height of the lens, a flat sheet at z = 0 is exactly the frame.
//   o  x, y, z, a           where the camera is. a: each kind's own
//   e  four of each kind's own. e.xy is always how far the sheet has travelled under it, in frame units
//
// A ball is laid out about the point where it touches the plane, by how far along it each point is in its own direction: no stretch going out from there, so the sheet near you is the sheet, and
// the whole of it closes up at the far side into one point, where everything is too fine to draw and closes to solid (prepare). That point is overhead in the dome, and on the far side of the planet.
export default `#ifdef SKY
const float SK_STEPS=14.;      // the canyon's steps either side; past them it's flat
vec3 skRay(vec2 p,vec4 c){ vec3 rd=normalize(vec3(p,-max(c.w,.05))); rd.xy=rot(c.z)*rd.xy; rd.yz=rot(c.x)*rd.yz; rd.xy=rot(c.y)*rd.xy; return rd; }
// X on a sphere of curvature K that touches the plane at the origin, laid flat: the arc to it, in the direction it lies. The chord is |X|, the arc 2/K asin(K|X|/2).
vec2 skFlat(vec3 X,float K){
  float r=length(X),u=min(.5*K*r,1.),s=u>1e-4?r*asin(u)/u:r;
  return X.xy*(s/max(length(X.xy),1e-6));
}
// The nearer meeting of the ray with K|X|^2 + 2 sg X.z = 0, a sphere touching the plane at the origin, its middle below (sg 1) or above (sg -1). In the form that's still exact as K goes to 0, where it's the plane.
// From outside: -1 if it misses. From inside it always meets it.
float skMeet(vec3 E,vec3 rd,float K,float sg,bool inside){
  float B=K*dot(E,rd)+sg*rd.z,C=K*dot(E,E)+2.*sg*E.z,D=B*B-K*C;
  if(inside) return -C/max(B+sqrt(max(D,0.)),1e-7);
  return D>=0.&&B<0.?C/(-B+sqrt(D)):-1.;
}
// The dome: the sheet curled up all round you into a ball you're inside, closing overhead. amp: its curvature. The sheet travels under you by e.xy, so it pours out of the point overhead, down one side, under you and back up the other.
vec2 skDome(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e){
  vec3 rd=skRay(p,c);
  float t=skMeet(o.xyz,rd,k.y,-1.,true);
  return skFlat(o.xyz+rd*t,k.y)+e.xy;
}
// The planet: the sheet gathered into a ball under you, amp its curvature, in a sky that's the same sheet gathered round it as a bigger ball, f over the top of it. The sky's lines are turned by ph and o.a times
// the size, and it travels by e.zw. The ball is laid out about its top, so it closes up on its far side; the sky about its bottom, so it closes up overhead: neither is ever in front of you. Where it's the ball against the sky is a silhouette: the one pixel across isn't a real gradient.
vec2 skPlanet(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e,out bool edge){
  vec3 rd=skRay(p,c);
  float t=skMeet(o.xyz,rd,k.y,1.,false),on=step(0.,t);
  edge=fwidth(on)>0.;
  if(t>=0.) return skFlat(o.xyz+rd*t,k.y)+e.xy;
  float Ks=k.y/(1.+k.y*k.z);
  vec3 Y=o.xyz-vec3(0.,0.,k.z);
  vec3 Sh=Y+rd*skMeet(Y,rd,Ks,1.,true);
  if(o.w>0.) Sh.z+=2./max(Ks,1e-6);      // laid out about the sky's bottom, under the ball, so the point it closes up into is overhead, behind you. o.a below 0: about its top, for skimming low under it
  return rot(k.w)*skFlat(Sh,Ks)/max(abs(o.w),.05)+e.zw;
}
// The canyon: the sheet folded into steps going up either side of a floor, along y. amp: how high each step is, f: how wide, ph: how high the sheet was folded for, so a step jumping up on a beat stretches its wall
// and the lines on its tread stay put. e.z: half the floor's width. Each face is a plane, so this steps from one to the next along x and solves each exactly.
// The world curves up away from the camera by o.a, which is the same as each ray coming down on a parabola: there's never a horizon. The sheet is unfolded across the steps, so it lies flat on every tread and down
// every wall, and its lines change direction at each fold.
float skEdgeX(float j,float dir,float cw,float w){ float n=abs(j)+(j==0.||sign(j)==dir?0.:-1.); return (j==0.?dir:sign(j))*(cw+n*w); }      // where cell j ends, going dir: step j spans |x| from cw + (|j|-1) w to cw + |j| w
vec2 skCanyon(vec2 p,vec4 k,vec4 c,vec4 o,vec4 e,out bool edge){
  vec3 rd=skRay(p,c),E=o.xyz;
  float q=k.y,w=max(k.z,.05),qr=k.w>0.?k.w:q,cw=max(e.z,.5*w),be=o.a*dot(rd.xy,rd.xy);
  float ax=abs(E.x),j=ax<cw?0.:sign(E.x)*(floor((ax-cw)/w)+1.),dir=rd.x>=0.?1.:-1.,ta=0.,t=-1.,U=0.,face=0.;
  for(int i=0;i<34;i++){
    // past the last step it's a flat top, as far as it goes
    float top=min(abs(j),SK_STEPS),out_=j!=0.&&sign(j)==dir?1.:0.,tb=abs(j)>=SK_STEPS&&out_>.5?1e9:abs(rd.x)>1e-6?(skEdgeX(j,dir,cw,w)-E.x)/rd.x:1e9;
    float dz=E.z-top*q;
    // the descending root of dz + rd.z t - be t^2 = 0, in the form that holds as be goes to 0
    float th=2.*dz/max(sqrt(max(rd.z*rd.z+4.*be*dz,0.))-rd.z,1e-7);
    if(th>=ta&&th<=tb){ t=th; U=abs(E.x+rd.x*t)+top*qr; face=j; break; }
    float jn=j+dir;
    // going out, the next step is higher: it meets that step's wall if it's below its top there
    if(abs(jn)>abs(j)&&abs(j)<SK_STEPS){
      float zb=E.z+rd.z*tb-be*tb*tb;
      if(zb<abs(jn)*q){ t=tb; U=cw+abs(j)*w+abs(j)*qr+max(zb-abs(j)*q,0.)*qr/max(q,1e-6); face=jn; break; }
    }
    j=jn; ta=tb;
  }
  if(t<0.){ t=ta; U=abs(E.x+rd.x*t)+min(abs(j),SK_STEPS)*qr; face=j; }
  vec3 X=E+rd*t;
  edge=fwidth(t)/max(t,.05)>.06;
  return vec2((face!=0.?sign(face):sign(X.x+1e-7))*U,X.y)+e.xy;
}
vec2 skyOf(vec4 k,vec4 c,vec4 o,vec4 e,vec2 p,out bool edge){
  edge=false;
  if(k.y==0.&&c.xyz==vec3(0.)&&o.xyz==vec3(0.,0.,c.w)) return p+e.xy;      // flat, and looked straight down at from the height of its lens: exactly the frame, moved by how far it's gone
  if(k.x<9.5) return skDome(p,k,c,o,e);
  if(k.x<10.5) return skPlanet(p,k,c,o,e,edge);
  return skCanyon(p,k,c,o,e,edge);
}
#ifdef FLIGHT
// Inside prepare(): each pattern of a flight on its own sheet, as spaceOne
vec2 skyOne(int b,vec2 p,out bool edge){
  edge=false;
  vec4 k=uG[b+I_spaceK];
  return k.x<8.5?p:skyOf(k,uG[b+I_spaceC],uG[b+I_spaceO],uG[b+I_spaceE],p,edge);
}
#else
// Once, in main(), as spaceMain: two patterns gliding are on the same kind, and its numbers glide with them
vec2 skyMain(vec2 p,out bool edge){
  edge=false;
  vec4 k=uG[I_spaceK],kB=uG[SLOT+I_spaceK];
  bool two=uF[0].y>.5;
  if(k.x<8.5&&!(two&&kB.x>8.5)) return p;
  float T=two?uF[0].x:0.;
  return skyOf(vec4(k.x>8.5?k.x:kB.x,mix(k.yzw,kB.yzw,T)),mix(uG[I_spaceC],uG[SLOT+I_spaceC],T),mix(uG[I_spaceO],uG[SLOT+I_spaceO],T),mix(uG[I_spaceE],uG[SLOT+I_spaceE],T),p,edge);
}
#endif
#endif
`;
