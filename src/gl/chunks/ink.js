// From phases to ink: the exact band filter and the soft path for dots.
export default `// Exact box filter of a periodic band centred on fract(x)=.5, filling fraction h of the cycle; g is cycles per pixel.
// A one-pixel ramp at coarse lines, hairlines that fade by true area instead of twinkling, exact solids at h=0 and h=1.
float bandI(float x,float h){ float f=floor(x); return f*h+clamp(x-f-.5+.5*h,0.,h); }
// The period is taken off first: a phase can run to hundreds of cycles over a song, and with a broad line (a small g) the rounding at that size, divided by g, leaves a filled pixel
// a little short of 1. Black is 1-P-style when theta is below 0, and through the gamma that shortfall is a dim speckle all over it. The nudge takes up what rounding is left, so it's exactly 1.
float band(float x,float h,float g){ x=fract(x); float n=bandI(x+.5*g,h)-bandI(x-.5*g,h); return clamp((n+(n>0.?4e-7:0.))/g,0.,1.); }

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

`;
