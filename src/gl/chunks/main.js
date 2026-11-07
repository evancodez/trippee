// main(): the sheet's warps, then one pattern, a flight or a bend, then the threshold, then colour.
import { FRAME } from '../../pattern/layout.js';

export default `#ifdef WORLD
//@world:helpers
#endif
void main(){
#ifdef HAND
  float hInk=0.;
#endif
  vec2 res=uF[8].xy;
  vec2 p=(gl_FragCoord.xy-.5*res)/res.y*2.;         // frame coordinates: y runs -1..1
  vec2 p0=p;
  vec4 pr=uF[6];
  if(pr.z!=0.){ vec2 d=p-pr.xy; p+=pr.z*d*exp(-dot(d,d)/max(pr.w*pr.w,1e-5)); }
  if(uF[8].w>.5) p+=texture(uPush,gl_FragCoord.xy/res).xy;
#ifdef WORLD_WARP
  p=worldWarp(p0,p);
#endif

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
    vec2 d=p-r.xy; float l=length(d),fr=l-r.z,wd=.22+.14*r.z;
    float wave=sin(fr*34.)*exp(-fr*fr/(wd*wd))*r.w*smoothstep(0.,.12,l);
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
    gLift+=.3*hz;
    gBreak=sl>36.;
    hInk=clamp(.5+hEdge*uF[F_HAND+1].w*res.y*.5,0.,1.);
  }
#endif

  // How hard the picture follows the song (src/score/hear.js): a camera in front of the whole sheet, so it goes on answering through every transformation. The lenses are the bloom and the notes. All zero, and this is four comparisons.
  vec4 cam=uF[F_HEAR];
  if(cam!=vec4(0.)) p=rot(cam.y)*(p/(1.+cam.x))+cam.zw;
  for(int i=1;i<5;i++){
    vec4 q=uF[F_HEAR+i];
    if(q.z==0.) continue;
    vec2 d=p-q.xy;
    p+=q.z*d*exp(-dot(d,d)/max(q.w*q.w,1e-4));
  }
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
    float fi=clamp(x*ml.y,0.,30.99); if(ml.w>.5) fi=clamp(x*x*x*ml.y,0.,30.99);     // ml.w: the tune in the present, hearing 2. Its age goes as x^3, so the middle of the frame is now and only the far edges are behind
    int mk=int(fi);
    float mv=mix(uF[F_MELS+mk/4][mk%4],uF[F_MELS+(mk+1)/4][(mk+1)%4],fi-float(mk));
    vec2 dir=ml.z<.5?p/max(r,1e-3)*smoothstep(0.,.25,r):(ml.z<1.5?vec2(0.,1.):vec2(1.,0.));
    p+=dir*ml.x*mv;
  }
  p=handView(p);

  songField(p0);
#ifdef WORLD_SHARE
  float th=uG[I_shape].z-gBeat*uF[F_WEIGHT].x*uW[0].y,dl=uF[5].x;      // uW[0].y: how much of the beat goes to the threshold. gBeat is there for the world either way.
#else
  float th=uG[I_shape].z-gBeat*uF[F_WEIGHT].x,dl=uF[5].x;
#endif
  vec4 dv=uF[F_DIVE];
  float o=uG[I_matte].y; if(o==2.) o=0.;
#ifdef PLATES
  bool plates=uF[5].y!=0.;
  if(plates){ int wa=int(uF[3].a),wb=int(uF[4].a); for(int i=0;i<FAM;i++){ gW[i]=float((wa>>(5*i))&31)/14.-1.; gW[FAM+i]=float((wb>>(5*i))&31)/14.-1.; if(dv.w<.5) gW[i]=mix(gW[i],gW[FAM+i],uF[2].a); } }
#endif
  float c,c2,cP,dP=0.;
#ifdef FLIGHT
  // A flight into one element of a pattern: the other pattern is what's inside that element, so there is nothing laid over anything. A GPU pays for
  // each call site on every pixel, so there is one prepare and one inkOf here, in loops. This program only ever draws flights, so the plain path is left out of it.
  bool bOuter=dv.w>2.5,inWhite=dv.w==1.||dv.w==3.;
  vec2 pz=dv.xy+(p-dv.xy)/dv.z,pA=p;
  // The iris (src/score/xform/iris.js): A is wound on a tube, and flat inside it. B lies flat outside it. Each leans in to the tube where they meet. What's wound comes from further out, so one prepare each still does.
  bool iris=dv.w>4.5,rolled=false,limb=false;
  float irisB=0.;
#ifdef SPACE
  bool spEdge2=false;
  if(dv.w>5.5){ spaceTwo(p,pA,pz,irisB,spEdge2); limb=spEdge2; }
  else
#endif
  if(iris){
    vec2 d=p-dv.xy; vec4 xa=uF[F_XF2]; float q=length(d),Rt=xa.z,s=q-dv.z;
    pz=p-d*xa.y*exp(-max(s-Rt,0.)/xa.x);
    irisB=aaOf(s-Rt);
    rolled=s>=-Rt;
    pA=rolled?dv.xy+rot(uF[F_XF].y)*d/max(q,1e-4)*(dv.z+Rt*(PI-asin(clamp(s/Rt,-1.,1.)))):p+d*xa.w*exp((s+Rt)/xa.x);
    float rf=rolled?1.:0.; limb=dFdx(rf)!=0.||dFdy(rf)!=0.;      // the tube's inner edge: the pixels across it aren't a real gradient
  }
  float oB=uG[SLOT+I_matte].y; if(oB==2.) oB=0.;
#ifdef WORLD_SHARE
  float thB=uG[SLOT+I_shape].z-gBeat*uF[F_WEIGHT].y*uW[0].y;
#else
  float thB=uG[SLOT+I_shape].z-gBeat*uF[F_WEIGHT].y;
#endif
  vec4 so=uF[7];
  float mm[3],cc[5];
  for(int j=0;j<(so.w>0.?3:2);j++){
#ifdef SPACE
    bool brk=gBreak; if((j==0||dv.w>5.5)&&limb) gBreak=true;
#else
    bool brk=gBreak; if(j==0&&limb) gBreak=true;
#endif
    mm[j]=prepare(j,j==1?SLOT:0,j==2?rot(so.z)*p+so.xy:(j==0)==bOuter?pA:pz);
    gBreak=brk;
  }
#ifdef WORLD_PREINK
  for(int j=0;j<(so.w>0.?3:2);j++) worldPreInk(j);
#endif
  // Going round the edge of the tube the lines get too fine to draw, and they close up to solid, or they'd be a thin grey ring.
  if(rolled) for(int i=0;i<FAM;i++) if(gOn[i]&&abs(gDu[i])<=1.01) gDu[i]+=smoothstep(.16,.42,gGn[i]);
#ifdef SPACE
  if(dv.w>5.5) for(int i=0;i<2*FAM;i++) if(gOn[i]&&abs(gDu[i])<=1.01) gDu[i]+=smoothstep(.16,.42,gGn[i]);
#endif
  // The outer one first, each time: what it shows at this pixel decides how far the inner one has opened here. Then one threshold does for both sides of an edge.
  // In order: outer, inner, the same two on colour's second plate, and the hand's lifted sheet.
  for(int n=0;n<5;n++){
    if(n==4){ if(so.w<=0.) break; }
#ifdef PLATES
    else if(n>=2&&!plates) continue;
    if(n==2){
      if(!iris) for(int i=0;i<FAM;i++) gW[(bOuter?FAM:0)+i]*=uF[2].a;      // the outer pattern's plates are shut by the time its element fills the frame
      plateMove(2*FAM);
    }
#else
    else if(n>=2) continue;
#endif
    bool isOuter=(n&1)==0&&n<4;
    int j=n==4?2:isOuter==bOuter?1:0;
    float t=j==1?thB:th;
    if(n<4&&!isOuter&&!iris) t=mix(uF[${FRAME.spare}].x,t,inWhite?cc[n-1]:1.-cc[n-1]);
    // The last of a dive, the first of a rise: what's left of the outer pattern shuts as a shape closing up, with a hard edge. Faded instead, it'd be a grey panel laid over the picture.
    if(isOuter&&!iris) t=mix(t,inWhite?-1.:1.,uF[${FRAME.spare}].y);
#ifdef WORLD
    if(n<2) gTh[j]=t;
#endif
    float v=mix(j==1?oB:o,inkOf(j,j*FAM,(j+1)*FAM,t),mm[j]);
    // What's closing up ends in hairlines thinner than a twentieth of a pixel, which through the XOR and the gamma would be a dim salt: this small stretch closes them.
    // And the frame the camera arrives the outer one is exactly its element's colour, whatever phase it stopped in, and the inner one exactly itself, so the next frame, on the plain path, changes nothing.
    cc[n]=iris&&n<4?v:mix(clamp((v-.05)/.9,0.,1.),isOuter?(uF[${FRAME.spare}].y>=1.?(inWhite?1.:0.):clamp((v-.05)/.9,0.,1.)):v,uF[${FRAME.spare}].y);
  }
  // Each sits in the other's phase: crossing the outer one's edge flips the inner one and changes how far it has opened, so the same lines run through both sides and
  // neither side is ever flat. At the end the frame is wholly inside the element, or the inner one has closed up to that element's colour, and one pattern is left alone.
  c=iris?mix(cc[1],cc[0],irisB):cc[0]+cc[1]-2.*cc[0]*cc[1]; if(inWhite) c=1.-c;
  c2=c; cP=c;
#ifdef PLATES
  if(plates&&iris){
    // Each flat sheet has its own plates. They're shut on the tube, where they'd only be noise.
    cP=mix(rolled?cc[1]:cc[3],cc[2],irisB);
    dP=abs(c-cP);
    if(min(c+cP,2.-c-cP)>dP) dP=mix(rolled?0.:plateDis(0,FAM)*mm[0],plateDis(FAM,2*FAM)*mm[1],irisB);
  }
  else if(plates){
    cP=cc[2]+cc[3]-2.*cc[2]*cc[3]; if(inWhite) cP=1.-cP;
    dP=abs(c-cP);
    if(min(c+cP,2.-c-cP)>dP){
      float dOuter=plateDis(bOuter?FAM:0,bOuter?2*FAM:FAM)*(bOuter?mm[1]:mm[0]),dInner=plateDis(bOuter?0:FAM,bOuter?FAM:2*FAM)*(bOuter?mm[0]:mm[1]);
      dP=dOuter+dInner-2.*dOuter*dInner;           // a disagreement in either one, and not in both, is one in the XOR
    }
  }
#endif
#else
  if(uF[F_XF2].w!=0.) p=xfPush(p0,p);
  float ma=prepare(0,0,p);
  int k1=FAM;
  if(uF[0].y>.5){
    // Two patterns at once: each family bends into its partner, phase by phase, so each line travels to where it's going.
    float mb=prepare(1,SLOT,p),T=xfT(p0,uF[0].x);
#ifdef WORLD_T
    T=worldT(p0,T);
#endif
    vec4 pa=uF[F_PAIR];
    // With time local to the pixel, a family with no partner closes up behind the front, and one the next pattern needs opens there. Closed is d=-1, nothing at all to the XOR.
    // Both ends are exact: a family that's done with is off altogether.
    if(uF[F_XF].x>.5){
      gRnd[0]=mix(gRnd[0],gRnd[1],T); gSum[0]=mix(gSum[0],gSum[1],T);
      for(int i=0;i<FAM;i++){
        if(int(pa[i])<0&&gOn[i]){ if(abs(gDu[i])<=1.01) gDu[i]=mix(gDu[i],-1.,1.-(1.-T)*(1.-T)); if(T>=1.) gOn[i]=false; }       // it gets through its last thin lines quickly
      }
      for(int j=0;j<FAM;j++){
        int q=FAM+j; bool taken=int(pa[0])==j||int(pa[1])==j||int(pa[2])==j||int(pa[3])==j;
        if(!taken&&gOn[q]){ if(abs(gDu[q])<=1.01) gDu[q]=mix(-1.,gDu[q],T*T); if(T<=0.) gOn[q]=false; }
      }
    }
    for(int i=0;i<FAM;i++){
      int j=int(pa[i]);
      if(j<0) continue;
      int qa=i,qb=FAM+j;
      if(!gOn[qa]||!gOn[qb]) continue;
      gGr[qa]=mix(gGr[qa],gGr[qb],T)+(gPh[qb]-gPh[qa])*gDT;
      gPh[qa]=mix(gPh[qa],gPh[qb],T);
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
#ifdef WORLD_PREINK
  worldPreInk(0);
#endif
#ifdef WORLD_CELLS
  gTh[0]=th;
#endif
  c=mix(o,inkOf(0,0,k1,th),ma);
  c2=dl!=0.?mix(o,inkOf(0,0,k1,th+dl),ma):c;
  cP=c;
#ifdef PLATES
  if(plates){
    plateMove(k1); cP=mix(o,inkOf(0,0,k1,th),ma);
    dP=abs(c-cP); if(min(c+cP,2.-c-cP)>dP) dP=plateDis(0,k1)*ma;
  }
#endif
#endif
#ifdef HAND
  // The hand is the same pattern in negative, so it has a hard outline all the way round on anything, wherever the lines happen to fall
  if(hInk>0.){ c=mix(c,1.-c,hInk); c2=mix(c2,1.-c2,hInk); cP=mix(cP,1.-cP,hInk); }
#endif
  // the hand's moire: a lifted copy of the same sheet, XOR-ed on top
#ifndef FLIGHT
  vec4 so=uF[7];
#endif
  if(so.w>0.){
#ifdef FLIGHT
    float cs=cc[4];
#else
    float ms=prepare(2,0,rot(so.z)*p+so.xy);
    float cs=mix(o,inkOf(2,2*FAM,3*FAM,th),ms);
#endif
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
#ifndef WORLD
  if(dl==0.) col=mix(uF[1].rgb,uF[2].rgb,pow(c,.4545));
  else {
    float a=pow(max(c,c2),.4545),b=pow(min(c,c2),.4545);
    col=mix(mix(uF[1].rgb,uF[3].rgb,a),uF[2].rgb,b);
  }
#else
#ifdef WORLD_COVER
  col=vec3(c);
#else
  // The colour stage. c is already what the planner, the sound and the hand read, and it stays exact: colour is worked out beside it, never instead of it. uW[0].x: the coverage draw, as the film draws it, for the planner's look.
#ifdef FLIGHT
  vec3 wFilm=film(c);
  col=wFilm;
  if(uW[0].x<.5){
    int jo=bOuter?1:0;
    gFlip[jo]=!iris&&(cc[1]>.5)!=inWhite; gFlip[1-jo]=!iris&&(cc[0]>.5)!=inWhite;      // in the XOR, where the other pattern is white the sides of c are this one's, swapped
    wAcross=fract(2.*length(p0-dv.xy));      // with no bands to go by, across rings round the focus
    float wc=wBand(jo*FAM,(jo+1)*FAM),wv=1.;      // the outer pattern's band here: each changes at its own edges, in its own time
    // A change of world: this world's inks drain from the film, or arrive in it, band by band. Past the end of either it's exactly the film's frame, and nothing's worked out.
    if(uW[1].z!=0.){ wv=wFront(wShare(uW[0].z,uW[0].w,wc,p0,dv.xy)); if(uW[1].z<0.) wv=1.-wv; }
    if(wv>0.){
      float ws=wFront(wShare(uW[1].w,.6,wc,p0,dv.xy));
      vec3 wa=ws<1.?worldColor(0,FAM,c):vec3(0.),wb=ws>0.?worldColor(FAM,2*FAM,c):vec3(0.);
      col=mix(wFilm,mix(wa,wb,ws),wv);
    }
  }
#else
  col=uW[0].x>.5?film(c):worldColor(0,k1,c);
#endif
#endif
#endif
  outColor=vec4(col,1.);
}`;
