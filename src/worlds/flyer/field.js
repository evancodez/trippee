// Flyer's own shaders. docs/MODES.md, section 3. The rule of this world: nothing is lit and nothing fades. A pixel is paper, or it's got ink on it, and every in-between is dots.
//
// The numbers, in slot A's block whichever slot's being drawn (U.a[4*n + i] in src/worlds/flyer.js, uW[4+n] here):
//   n 0-7   the wave: 32 samples of what's sounding, as far gone as the guitars are. The field's edges are this.
//   n 8     where the two spot plates have got to, as a share of the frame's height: A in xy, B in zw. The drums knock them out of register.
//   n 9     the par cans: x, y the angle of each, z how wide (0 off), w where they hang
//   n 10    x how hollow the toner goes, y a change of edition's progress, z which way it travels, w how wide it is
//   n 11-15 this edition: stock (a: which schedule), ink A at one end of the fountain (a: fountain x), at the other (a: fountain y), ink B (a: fountain offset), toner
//   n 16-20 the next edition
//   n 21    The Fill: x how many strips (0 off), y which way they lie
//   n 22-23 how far along each strip is
// And each slot's own, n 24-25: the stencil's centre, size, turn, and how much of it is cut (through dots), and which page it's on.
//
// The pattern's own numbers. field.a how many times the wave goes round a ring (SNAP: it only changes while the ring's round), field.b the motif on each pole, four bits a pole, field.ph how deep the edges go,
// field.scale how the wave winds with the radius, field._1 how rings melt together, field._2 how much the rings swell going out (0 a plain target, 1 log), field.k0 lines per unit.
// spare.a plates: 0 by line number, 1 each family on a drum of its own. spare.b the cap at a pole. spare.c the screen. spare.d the stencil and star._1 the field's kind: 0 rings, 1 flames, 2 ridges. star._2 what that kind asks for. star._3 k again, for the stripes under the field.
export const FIELD = `
float wFlyWave(float x){ x=fract(x)*32.; int i=int(x),j=(i+1)&31; return mix(uW[4+i/4][i%4],uW[4+j/4][j%4],x-float(i)); }
vec4 wFlyPole(int b,int i){ return i==0?uG[b+I_mBlobA]:i==1?uG[b+I_mBlobB]:i==2?uG[b+I_mBlobC]:i==3?uG[b+I_p1]:uG[b+I_p2]; }
#ifdef WORLD_FULL
float wFlySpike(float a,float rho,float be){ float s=rho*sin(be); return s/(s*cos(a)+(1.-rho*cos(be))*sin(a)); }
// A motif is its radius in each direction, so every ring is the shape again at another size, and corners stay corners all the way out.
float wFlyMotif(int m,vec2 v,float th,float n){
  vec2 w=vec2(abs(v.x),v.y);
  if(m==1){ float be=PI/5.; return 1.2*wFlySpike(abs(mod(th-PI/2.+be,2.*be)-be),.42,be); }      // a rock star: five straight points
  if(m==2){ float be=PI/max(n,3.); return 1.25*wFlySpike(abs(mod(th+be,2.*be)-be),.58,be); }      // a comic book's bang
  if(m==3){ w.y=-w.y; if(w.y<-.125*w.x) return min(.82/dot(w,vec2(.759,-.651)),w.x<.1?2.:9.); float B=dot(w,vec2(.52,.28)); return B+sqrt(max(B*B+.0356,0.)); }      // a spade: a heart the other way up
  if(m==4) return 1./(abs(v.x)/.82+abs(v.y)/1.25);      // a diamond
  if(m==5) return 1./max(max(abs(v.x)*.72,abs(v.y)*.72),(abs(v.x)+abs(v.y))*.5);      // an octagon: a stop sign
  if(m==6){ float h=max(w.x*.8+w.y*.5,-w.y); return .72/max(h,.04); }      // a triangle
  if(m==7) return 1./max(w.x,abs(v.y)*1.5);      // a stage: a rectangle, so its echoes nest
  return 1.;
}
vec2 wFlyTile(vec2 X,float lat){ lat=max(lat,.08); return (.5-abs(fract(lat*X/2.+.25)*2.-1.))/lat; }
float wFlyPetal(float x,float fat){ return pow((.5+.5*cos(x)+.004)/1.004,.5*fat); }
#endif
// Rings round the poles. The wave goes round each, and a kick lifts them all.
float wFlyRings(int b,vec2 X,vec4 f,vec4 f2,float e){
  float a=f.w,n=f.y,kap=f2.y,be=f2.z,lg=f2.w,sum=0.;
#ifdef WORLD_FULL
  int kinds=int(f.z);
  float ms=f2.x;
#endif
  for(int i=0;i<5;i++){
    vec4 P=wFlyPole(b,i);
    float r=P.z;
    if(r<1e-4) continue;
    vec2 d=X-P.xy;
    float q=dot(d,d),er=e*r,D=q+er*er,rho=sqrt(D)/r,u=q/D,th=atan(d.y,d.x)+P.w;
#ifdef WORLD_FULL
    int m=(kinds>>(4*i))&15;
    if(m>0&&ms>0.){ float l0=sqrt(q)+1e-5; vec2 v=rot(P.w)*d/l0; rho/=max(1.+ms*u*u*(wFlyMotif(m,v,atan(v.y,v.x),n)-1.),.25); }
#endif
    if(a!=0.) rho/=max(1.+a*u*wFlyWave(n*th/TAU+kap*.5*log(q+1e-5)),.2);
    float l=mix(rho,log(rho+.12),lg)+.13*mod(float(i)*2.,5.);
    sum+=exp(-be*l);
  }
  return sum>0.?-log(sum)/be:0.;
}
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2],sp=uG[b+I_spare];
  float lines=dot(uG[b].xy,X*uG[b+I_tune].x)/uG[b+I_star2].w;      // the stripes under the field, which it takes away. So with the field gone there are lines, and never a solid.
#ifdef WORLD_FULL
  float kind=uG[b+I_star2].y,lat=uG[b+I_mBlobs].y;
  if(kind>1.5){
    // Ridges: lines up the frame, each one the wave, and the wave's stood up where the middle of the frame is, as far as the frame's edges take it away again. Every line is what's sounding now.
    float en=f2.w>0.?exp(-X.x*X.x/(f2.w*f2.w)):1.;
    float wx=f.y*X.x+.5*sin(1.3*X.x+.7)+f2.y*X.y;
    return X.y+f.w*en*(wFlyWave(wx-.05)+wFlyWave(wx)+wFlyWave(wx+.05))/3.-lines;      // a little rounded: a wall that's straight up would send every line in the frame up it, in hairlines
  }
  if(kind>.5){
    // Flame job: a flower laid on its side, its petals licking up the frame. Bigger on one side.
    float lobes=uG[b+I_star2].z;
    return X.y+log(1.+f.w*(.55+.45*sin(1.7*X.x+1.3))*wFlyPetal(lobes*X.x+f2.y*X.y,f2.w))-lines;
  }
  if(lat>0.) X=wFlyTile(X,lat);
#endif
  return wFlyRings(b,X,f,f2,sp.y)-lines;
}
`;

// The Fill: a change of pattern runs through the frame one strip to the next, each on a drum hit. It's the transformation's own T, in strips. Hard between them: that's a cut with a knife, and it's gone when they're all across.
export const T_HOOK = `float gFlyT=-1.;      // how far this pixel's change has got, for the screens: dots ride both sheets at once, and land on the next one
float worldT(vec2 p0,float T){
  vec4 m=uW[25];
  if(m.x<.5||WGEO<.999){ gFlyT=T; return T; }
  gDT=vec2(0.);
  float u=clamp(.5+.5*dot(p0,vec2(cos(m.y),sin(m.y)))/m.z,0.,.9999);
  int i=int(u*m.x);
  float s=uW[26+i/4][i%4];
  gFlyT=s*s*s*(s*(s*6.-15.)+10.);
  return gFlyT;
}
`;

// The print. Three drums and a sheet of paper: toner, and two spot inks, each with a coverage of its own, and each is laid over what's under it. Multiplying: ink's a filter, and two of them make a third.
export const COLOR = `
float wFlyEdge(int k0,int k1){
  float T=abs(gTh[k0/FAM]),best=1e5;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float d=gDu[k];
    if(abs(d)>=1.) continue;
    best=min(best,(abs(tri(gPh[k])-d)-T*(1.-smoothstep(.85,1.,abs(d))))/(4.*gGn[k]));
  }
  return best;
}
// The same picture, off by this many pixels. Nothing's drawn twice: each line's where it would be, from its own gradient.
float wFlyShift(int k0,int k1,vec2 off){
  float was[8];
  for(int k=k0;k<k1;k++){ was[k-k0]=gPh[k]; if(gOn[k]) gPh[k]+=dot(gGr[k],off); }
  int K=k0/FAM;
  float v=inkOf(K,k0,k1,gTh[K]);
  for(int k=k0;k<k1;k++) gPh[k]=was[k-k0];
  return gFlip[K]?1.-v:v;
}
// One family alone, on a drum of its own.
float wFlyDrum(int k,vec2 off){
  if(!gOn[k]||abs(gDu[k])>=1.) return gOn[k]&&gDu[k]>=1.?0.:1.;
  return band(gPh[k]+dot(gGr[k],off),clamp(.5*(1.-gDu[k]),0.,1.),gGn[k]);
}
// Which family a drum's on. In a bend the next pattern's family has no place of its own until it's been paired, so a plate that's opening is over there.
int wFlyWhich(int k0,int k1,int i){ int a=k0+i,b=k0+FAM+i; if(k1-k0<=FAM) return a; if(gOn[a]&&gOn[b]) return gFlyT<.5?a:b; return gOn[b]?b:a; }
// A screen: dots riding the sheet. tone 0 nothing, 1 solid, and between them hard dots, by a pixel's worth of edge. Too small to see, they're the tone they stand for.
float wFlyDots(vec2 X,float co,float si,float F,float tone,float px){
  if(tone<=.004) return 0.;
  if(tone>=.996) return 1.;
  vec2 q=vec2(co*X.x-si*X.y,si*X.x+co*X.y)*F;
  float h=.5+.25*(cos(TAU*q.x)+cos(TAU*q.y)),w=max(px*F*2.2,1e-4);
  float t=mix(.02,.98,tone);
  return mix(clamp(.5+(t-h)/w,0.,1.),tone,smoothstep(.22,.5,px*F));
}
float wFlyHash(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec3 wFlyPrint(int o,ivec2 n,float cK,float cA,float cB,vec2 X,vec2 p,float F,float px,float hol,float mode,float fA,float fB,float fK,float st,float ld){
  vec3 stock=uW[o].rgb,inkA=uW[o+1].rgb,inkA2=uW[o+2].rgb,inkB=uW[o+3].rgb,toner=uW[o+4].rgb;
  int sc=8*int(uW[o].a);
  float f=clamp(.5+.5*(dot(p,vec2(uW[o+1].a,uW[o+2].a))+uW[o+3].a),0.,1.);
  inkA=mix(inkA,inkA2,f);
  float sA,sB,sK;
  // By line: each line's number says how much of each ink is on it, on each side of its edge.
  if(mode<1.){
    vec4 tw=cK>0.||cA>0.||cB>0.?texelFetch(uWT,ivec2(n.x+sc,0),0):vec4(0.),tb=cK<1.||cA<1.||cB<1.?texelFetch(uWT,ivec2(n.y+sc,1),0):vec4(0.);
    sA=mix(wFlyDots(X,.7071,.7071,F,tb.x,px),wFlyDots(X,.7071,.7071,F,tw.x,px),cA);
    sB=mix(wFlyDots(X,.9659,.2588,F*1.14,tb.y,px),wFlyDots(X,.9659,.2588,F*1.14,tw.y,px),cB);
    sK=mix(wFlyDots(X,.2588,.9659,F*.94,tb.z,px),wFlyDots(X,.2588,.9659,F*.94,tw.z,px),cK);
  } else { sA=1.-fA; sB=1.-fB; sK=1.-fK; }
#ifdef WORLD_FULL
  if(ld>0.){
    float dt=wFlyDots(X,.7071,.7071,F,min(texelFetch(uWT,ivec2(n.x+sc,0),0).x,.5),px);
    float lA=mix(1.-cA+cA*dt,cA,st),lK=st*(1.-cK);
    sA=mix(sA,lA,ld); sB*=1.-ld; sK=mix(sK,lK,ld);
  }
#endif
  sK*=hol;
  return stock*mix(vec3(1.),inkA,sA)*mix(vec3(1.),inkB,sB)*mix(vec3(1.),toner,sK);
}
vec3 worldColor(int k0,int k1,float c){
  int K=k0/FAM,bs=K==1?SLOT:0;
  vec2 res=uF[8].xy,fc=gl_FragCoord.xy,p=(fc-.5*res)/res.y*2.,X=gFlyT>=0.?mix(gX[0],gX[1],gFlyT):gX[K];
  float rs=res.y/720.,px=max(length(dFdx(X)),length(dFdy(X)));
  ivec2 n=lineRows(k0,k1);
  bool soft=gRnd[K]>0.||gSum[K]>0.;
  float e=soft?0.:wFlyEdge(k0,k1);
  vec2 oA=uW[12].xy*res.y,oB=uW[12].zw*res.y;
  float cA=c,cB=c;
  if(e<=length(oA)+1.) cA=wFlyShift(k0,k1,oA);
  if(e<=length(oB)+1.) cB=wFlyShift(k0,k1,oB);
  // The par cans. A beam doesn't light anything: it flips ink A's plate where it goes.
  vec4 bm=uW[13];
  if(bm.z>0.){
    vec2 d=p-vec2(0.,bm.w);
    float y=-d.y,b1=sin(bm.x)*y-cos(bm.x)*d.x,b2=sin(bm.y)*y-cos(bm.y)*d.x,w=bm.z*y;
    float on=max(clamp(.5+(w-abs(b1))*res.y*.5,0.,1.),clamp(.5+(w-abs(b2))*res.y*.5,0.,1.));
    cA=mix(cA,1.-cA,on);
  }
  float s=0.,ld=0.,F0=gFlyT>=0.?mix(uG[I_spare].z,uG[SLOT+I_spare].z,gFlyT):uG[bs+I_spare].z,gut=1.;
  if(F0<1.) F0=6.;      // the film's own have no screen of their own
  int blk=15,blkWas=15;
  float hopV=1.;
#ifdef WORLD_FULL
  // The stencil: a shape cut out of rubylith. A sheet with one on it is a ladder of three values, paper, ink, toner: outside the shape it's the top two and inside it the bottom two, whichever line it's on. So it has a hard outline all the way round on anything, and what it shows is whatever's going by.
  vec4 sa=uW[28+30*K],sb=uW[29+30*K];
  if(sb.x>0.){
    // In and out through dots: how much of the sheet's been printed this way.
    ld=sb.x>=1.?1.:clamp(.5+(sb.x-(.5+.25*(cos(TAU*F0*p.x)+cos(TAU*F0*p.y))))*res.y*.04,0.,1.);
    // A Warhol: the frame's panels, the shape in each, each panel in inks of its own. One panel takes new inks on each strong beat, through its dots, and they chase round.
    vec2 cc=vec2(0.);
    vec4 gd=uW[30+30*K];
    if(gd.x>0.){
      float asp=res.x/res.y,N=gd.x*gd.y;
      vec2 cell=vec2(2.*asp/gd.x,2./gd.y),u=(p+vec2(asp,1.))/cell,i=floor(u),f=u-i;
      cc=(i+.5)*cell-vec2(asp,1.);
      gut=min(min(f.x,1.-f.x)*cell.x,min(f.y,1.-f.y)*cell.y);
      if(ld>.5){
        float k=mod(i.x+i.y*gd.x,N),hops=floor((gd.z+N-1.-k)/N);
        blk=34+5*int(mod(k+hops,4.));
        if(gd.w<1.&&mod(gd.z-1.,N)==k&&hops>0.){ blkWas=34+5*int(mod(k+hops-1.,4.)); hopV=gd.w; }
        else blkWas=blk;
      }
    }
    vec2 q=rot(sa.w)*(p-cc-sa.xy)/sa.z;
    vec2 uv=(vec2(q.x/sb.w,q.y)*.5+.5)*vec2(255.,125.);
    float d=20.;
    if(uv.x>0.&&uv.x<255.&&uv.y>0.&&uv.y<125.){
      ivec2 i=ivec2(uv); vec2 u=uv-vec2(i); int r0=int(sb.y);
      float a0=texelFetch(uWT,ivec2(i.x,r0+i.y),0).r,a1=texelFetch(uWT,ivec2(i.x+1,r0+i.y),0).r,a2=texelFetch(uWT,ivec2(i.x,r0+i.y+1),0).r,a3=texelFetch(uWT,ivec2(i.x+1,r0+i.y+1),0).r;
      d=mix(mix(a0,a1,u.x),mix(a2,a3,u.x),u.y);
    }
    float pxT=sa.z*res.y/125.;      // screen pixels in a texel of the page
    s=clamp(.5-d*pxT,0.,1.);
  }
#endif
  // Toner piles up at the edges of a solid, where the charge is steepest. The middle goes hollow, and the sheet's own dirt shows there, fixed in the frame.
  float hol=1.;
  float hollow=uW[14].x;
  if(hollow>0.){
    vec2 g=floor(fc/(1.5*rs));
    float ee=e/rs,dirt=wFlyHash(g),blot=.5+.5*sin(fc.x*.011/rs+2.*sin(fc.y*.017/rs))*sin(fc.y*.023/rs+1.7*sin(fc.x*.009/rs));
    hol=1.-hollow*smoothstep(10.,38.,ee)*step(dirt,.05+.5*blot*blot);
  }
  float G0=c<=0.||c>=1.?c:pow(c,.4545),G1=cA<=0.||cA>=1.?cA:pow(cA,.4545),G2=cB<=0.||cB>=1.?cB:pow(cB,.4545);
  // Which drums: by line, or a family to each. Going from one to the other goes by the dots.
  float over=gFlyT>=0.?mix(uG[I_spare].x,uG[SLOT+I_spare].x,gFlyT):uG[bs+I_spare].x,F=F0,o=0.,fA=1.,fB=1.,fK=1.;
  if(over>0.){
    float h=.5+.25*(cos(TAU*F*X.x)+cos(TAU*F*X.y));
    o=over>=1.?1.:clamp(.5+(over-h)/max(px*F*2.2,1e-4),0.,1.);
    if(o>0.){ fK=wFlyDrum(k0,vec2(0.)); fA=wFlyDrum(wFlyWhich(k0,k1,1),oA); fB=wFlyDrum(wFlyWhich(k0,k1,2),oB); }
  }
  vec3 here=o<1.?wFlyPrint(blk,n,G0,G1,G2,X,p,F,px,hol,0.,1.,1.,1.,s,ld):vec3(0.);
  if(o>0.) here=mix(here,wFlyPrint(blk,n,G0,G1,G2,X,p,F,px,hol,1.,fA,fB,fK,s,ld),o);
  if(hopV<1.&&blkWas!=blk){
    vec2 q=vec2(.8192*p.x-.5736*p.y,.5736*p.x+.8192*p.y)*F*.8;
    float h=.5+.25*(cos(TAU*q.x)+cos(TAU*q.y));
    here=mix(wFlyPrint(blkWas,n,G0,G1,G2,X,p,F,px,hol,0.,1.,1.,1.,s,ld),here,clamp(.5+(mix(-.02,1.02,hopV)-h)*res.y*.03,0.,1.));
  }
  // A new edition: it comes in through its own dots, the old one's paper and all, across the frame.
  float wp=blk==15?uW[14].y:0.;
  if(wp>0.){
    float W=uW[14].w,u=dot(p,vec2(cos(uW[14].z),sin(uW[14].z)))/2.2+.5,v=clamp((wp*(1.+W)-u)/W,0.,1.);
    if(v>0.){
      vec3 next=o<1.?wFlyPrint(20,n,G0,G1,G2,X,p,F,px,hol,0.,1.,1.,1.,s,ld):vec3(0.);
      if(o>0.) next=mix(next,wFlyPrint(20,n,G0,G1,G2,X,p,F,px,hol,1.,fA,fB,fK,s,ld),o);
      if(v>=1.) here=next;
      else {
        vec2 q=vec2(.8192*X.x-.5736*X.y,.5736*X.x+.8192*X.y)*F*.8;
        float h=.5+.25*(cos(TAU*q.x)+cos(TAU*q.y));
        here=mix(here,next,clamp(.5+(mix(-.02,1.02,v)-h)/max(px*F*1.8,1e-3),0.,1.));
      }
    }
  }
  if(gut<.016) here=mix(uW[blk].rgb,here,clamp((gut-.012)*res.y*.5+.5,0.,1.));      // a panel's edge is bare paper
  return here;
}
`;
