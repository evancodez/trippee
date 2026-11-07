// What Dusk's lines are: the level sets of one field per pattern, all in cycles, with the bright side of a crest always upward or outward. A family's phase is exactly this: field.k0 is 1, and star._3 says so.
// Under every field are plain stripes, which the field takes away again: with the field let go (the middle of a change of world) it's stripes, and never a solid.
//   field.a    which field, stepped: see KIND in patterns.js
//   field.ph, field.spin, field.scale, field._1, field._2, spare.a..d    its numbers, as each says below
export const FIELD = `// A ridge. sharp 0 rolling hills, 1 peaks, 2 dunes, -1 crowns: a row of scallops with a cusp in each valley.
float wShape(float x,float sharp){
  float roll=sin(x)+.5*sin(2.31*x+1.7)+.24*sin(5.13*x+.6);
  if(sharp==0.) return roll;
  if(sharp>1.){ float y=x+.9*sin(x); return mix(roll,1.2*sin(y)+.32*sin(2.17*x+1.1),sharp-1.); }
  if(sharp>0.){ float r=1.-abs(sin(.5*x+.3)),q=1.-abs(sin(1.37*x+1.9)); return mix(roll,2.5*r*r+1.05*q*q-1.5,sharp); }
  float s=pow(abs(sin(.5*x)),.6); return mix(roll,2.*s-1.+.22*sin(1.31*x+.4),-sharp);
}
// Land: seven crests, far to near, each lying over the ones behind it. Each is further down, bigger and faster than the last, and goes by at its own speed, so it's a real view from a train: the near hills pass the far ones.
// Going up from a crest it's mist getting thinner, so a hill's top is dark against the bright mist in the valley behind it. Above the farthest crest it's sky, with broad bands in it.
//   field.spin the farthest crest's height, field.scale how much bigger each is than the last, field._1 how far down the first is, field._2 how long its hills are, field.ph how tall, spare.a sharp, spare.b how far the train's gone, spare.d the seed.
float wLand(int b,vec2 X,vec4 f,vec4 f2,vec4 sp){
  float q=f2.y,D=f2.z,fr=f2.w,amp=f.w*(1.+.3*uW[9].x),y0=f2.x,s=1.,best=-1.,bd=0.,R0=y0,I=0.;
  for(int i=0;i<7;i++){
    float R=y0+amp*D*wShape((X.x/s+sp.y)*fr+sp.w*(I*1.73+.4),sp.x);
    if(i==0) R0=R;
    if(X.y<=R){ best=I; bd=(R-X.y)/D; wAlong[b==0?0:1]=X.x/s+sp.y; wHasAlong[b==0?0:1]=true; }
    y0-=D; D*=q; s*=q; I+=1.;
  }
  wSky[b==0?0:1]=best<0.?1.:.25*exp(-.6*best);
  if(best<0.) return (X.y-R0)/(1.4*f2.z);
  return -best-.97*(1.-exp(-2.6*bd));
}
// The sea, to a horizon. Waves are wider and taller the nearer they are, and the sky has the same bands, the other way up.
float wSea(vec2 X,vec4 f,vec4 f2,vec4 sp){
  float u=f2.x-X.y,au=abs(u),wave=sp.z*X.x/(au+.3);
  u+=f.w*au*(sin(wave+sp.y)+.55*sin(1.73*wave-1.31*sp.y+1.1));
  float m=log(1.+abs(u)/f2.z);
  wSky[0]=wSky[1]=u>0.?.6:1.;
  return f2.w*(u>=0.?-m:m);
}
// A log-distance ring about a point, with room in the middle.
float wRing(vec2 d,float e){ return log(sqrt(dot(d,d)+e*e)); }
#ifdef WORLD_FULL
// Things that are more than a line at a time.
float wDapple(int b,vec2 X,vec4 f,vec4 f2,vec4 sp){
  float lat=sp.z; if(lat>0.) X=(.5-abs(fract(lat*X/2.+.25)*2.-1.))/lat;
  float be=f2.y,sum=0.;
  for(int i=0;i<3;i++){ vec4 P=uG[b+I_mBlobA+i]; if(P.z<=0.) continue; vec2 d=X-P.xy; sum+=pow((dot(d,d)+.002)/(P.z*P.z),-.5*be); }
  for(int i=0;i<2;i++){ vec4 P=i==0?uG[b+I_p1]:uG[b+I_p2]; if(P.z<=0.) continue; vec2 d=X-P.xy; sum+=pow((dot(d,d)+.002)/(P.z*P.z),-.5*be); }
  return f2.w*(sum>0.?-log(sum)/be:0.);
}
#endif
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2],sp=uG[b+I_spare];
  float lines=dot(uG[b].xy,X*uG[b+I_tune].x)/uG[b+I_star2].w,S=0.;
  int kind=int(f.y);
  if(kind==1) S=wLand(b,X,f,f2,sp);
  else if(kind==2) S=wSea(X,f,f2,sp);
  else if(kind==3){ float u=2.*fract(X.x*sp.z+sp.y)-1.; S=f2.w*(X.y+f.w*(1.+.35*X.y)*u*u); }                      // wires: field.ph sag, field._2 lines per unit, spare.z poles per unit, spare.y how far the train's gone
  else if(kind==4){ vec2 v=vec2(f2.x-X.x,X.y-f2.y); float d=sqrt(v.x*v.x+f2.z*f2.z); S=sp.z*(v.y-f.w*d*sin(sp.x*log(d)+sp.y))/d; wSky[0]=wSky[1]=1.; }     // a road: everything runs to a point, in an S
  else if(kind==5){ vec2 v=X-f2.xy; float a=v.y>0.?length(v):max(abs(v.x),-v.y*1.7); S=f2.w*log(a+f2.z); }          // a cloister: arches inside arches, flat on the floor
  else if(kind==6) S=f2.w*wRing(X-f2.xy,f2.z);                                                                       // the low sun's own rings
  else if(kind==7){ float a=length(X-f2.xy)/sp.x,c=length(X-sp.yz)/sp.w; S=f2.w*log(max(a,1./max(c,.05))+f2.z); }    // a crescent: inside one disc and outside the other, and every echo of it is another moon
  else if(kind==8){ float y=asin(sin(X.y*f2.z))/f2.z; S=f2.w*y/(1.+f.w*sin(sp.z*X.x-sp.y)); }                       // tremolo: bands that swell and thin along their length, and the swell goes by
  else if(kind==9){ float a=sp.z*X.x+sp.x*X.y+sp.y; S=f2.w*X.x+f.w*(sin(a)+.5*sin(1.71*a-.6*sp.x*X.y+1.)); }        // a curtain, folding
  else if(kind==10) S=f2.w*(X.y+f.w*abs(X.x-sp.z)+sp.x*X.x);                                                         // blinds: slats of light, turning a corner of the wall
  else if(kind==11){ float u=f2.x-X.y; S=f2.w*(X.x-sp.z)/sqrt(u*u+f2.z*f2.z); wSky[0]=wSky[1]=1.; }                  // furrows: rows running to a point on the horizon
#ifdef WORLD_FULL
  else if(kind==12) S=wDapple(b,X,f,f2,sp);
#endif
  else S=lines;
  return S-lines;
}
`;
