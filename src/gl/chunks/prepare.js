// Everything up to the threshold: where a pixel lands, and what each family's phase and gradient are.
export default `float gPh[3*FAM],gGn[3*FAM],gDu[3*FAM]; vec2 gGr[3*FAM]; bool gOn[3*FAM];
float gRnd[3],gSum[3];
bool gBreak=false;
float gRing=0.;                  // what the ripples have done at this pixel, in picture units
float gLift=0.;                  // how far the sheet's phase has slipped at this pixel, in cycles. Each family takes its own share, or a check slipping by half a cycle both ways would look the same
const vec4 LIFT=vec4(1.,.5,.75,.25);
const vec4 DS=vec4(1.,-.5,.75,-.25);   // each family's share of the tune's change in line weight

#ifdef WORLD_PHASE
//@world:phase
#endif
// Everything up to the threshold: where this pixel lands, what each family's phase and gradient are. Returns coverage of the surface.
float prepare(int K,int b,vec2 p){
#ifdef SPACE
  bool spEdge,spBrk=gBreak; p=spaceOne(b,p,spEdge); gBreak=gBreak||spEdge;
#endif
  p=moveCarry(b,p);
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
  X.xy=carryX(b,X.xy);

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
#ifdef WORLD_GEN
    gGen[K]=floor((wx+w.y)/w.x);
#endif
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
#ifdef WORLD_X
  gX[K]=X.xy;
#endif

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
  float sl=moveSlip(b,X.xy,b1),fS=fieldS(b,X.xy),tuneShare=uF[F_SPARE][K==1?3:2];    // how much of the tune's rings this slot has: a slot that's shut has none, or they'd open it
  for(int i=0;i<FAM;i++){
    vec4 fa=uG[b+3*i],fb=uG[b+3*i+1],fc=uG[b+3*i+2];
    int k=K*FAM+i;
    gOn[k]=fc.w>=.5;
    if(!gOn[k]) continue;
    // the smooth part of the phase; angles are added afterwards, with their exact gradient, so a wrap never shows
    float sm=dot(fa.xyz,vec3(X.xy*fq,X.z))+fb.x*b1.x+fb.y*b1.y+fc.x*b2.x+fc.y*b2.y;
    if(tn.y!=0.) sm+=tn.y*boil(X.xy*tn.z,tn.w,float(i)*2.3+.7);
    sm+=gLift*LIFT[i];
    sm+=fS*uG[b+I_fieldK][i];
    vec2 g=vec2(dFdx(sm),dFdy(sm));
    // Across the wrap the phase jumps by the around-count, which only that one pixel's gradient sees. Take off exactly that, so a
    // real gradient too fine to draw stays too fine, and doesn't alias into specks at the far end of a tunnel.
    if(lensView){ float J=abs(fa.x)*sf0.z; if(J>1e-3) g-=J*round(g/J); }
    else if(wrapped) g-=round(g);
    g+=fb.z*gT1+fc.z*gT2;
    if(seam){ float gl=length(g); if(gl>.12) g*=.12/gl; }   // the one pixel across a jump between two fields isn't a real gradient
    if(gBreak){ float gl=length(g); if(gl>.2) g*=.2/gl; }   // nor is the one across a finger's edge, or it would draw an outline
    sm+=gRing*clamp(length(g)*uF[8].y*.5,2.5,9.);           // a ring moves a line by the same distance however big it is, up to a point, and even broad shapes slip enough to show it
    gPh[k]=sm+fb.z*b1.z+fc.z*b2.z+fa.w+fa.y*tn.x*slipY+sl*uG[b+I_slipM][i];
    if(parity<0.){ gPh[k]+=.5; parity=1.; }                 // half a cycle on one family inverts the whole XOR
    gGr[k]=g; gGn[k]=max(length(g),1e-5); gDu[k]=abs(fb.w)<.85?clamp(fb.w+gTune*DS[i]*tuneShare,-.85,.85):fb.w;   // a closed family stays closed
#ifdef WORLD_PHASE
    worldPhase(K,i,X);
#endif
  }
#ifdef WORLD_COVER
  for(int i=K*FAM;i<(K+1)*FAM;i++){ gGn[i]*=uW[1].x; gGr[i]*=uW[1].x; }      // the sound's small coverage draw filters as if drawn full size, as the film's picture it would otherwise have read down from
#endif
#ifdef SPACE
  gBreak=spBrk;
#endif
  gRnd[K]=uG[b+I_shape].x; gSum[K]=uG[b+I_shape].y;
  return cover;
}

`;
