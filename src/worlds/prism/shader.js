// Prism's shaders. The colour is a hue that runs along the pattern's own structure: how far across its lines a pixel is, as the lines themselves count it, without the flow that moves them or the whole turns a landing adds.
// So the spectrum lies in the pattern's bands (rings of it round a ring pattern, stripes of it across stripes), rides the sheet wherever the sheet goes, and nothing in it jumps at a landing.
// The white side wears the light wheel, the black side the deep wheel at the mirrored hue (wheel.js): every edge is a pair of two hues, one light and one deep.
export const REACH = 128;      // texels of the state row per turn of colour along the structure: two turns out from where the structure is 0 is the last texel

// For every family k: wO its offset (fa.w, where the flow and a landing's whole turns go), wA its turns about the poles at this pixel, wK what it is (0 lines or rings, 1 spokes, 2 a spiral).
export const DEFS = `float wO[3*FAM],wA[3*FAM]; int wK[3*FAM];
`;

// Read only, so it does nothing to the picture, whatever WGEO is (the rule for a change of world).
export const PHASE = `void worldPhase(int K,int i,vec3 X){
  int b=K==1?SLOT:0,k=K*FAM+i;
  vec4 fb=uG[b+3*i+1],fc=uG[b+3*i+2];
  float w=0.;
  if(fb.z!=0.){ vec4 P=uG[b+I_p1]; vec2 d=X.xy-P.xy; d.y*=P.w; w+=fb.z*atan(d.y,d.x)/TAU; }
  if(fc.z!=0.){ vec4 P=uG[b+I_p2]; vec2 d=X.xy-P.xy; d.y*=P.w; w+=fc.z*atan(d.y,d.x)/TAU; }
  wO[k]=uG[b+3*i].w; wA[k]=w; wK[k]=fb.z==0.&&fc.z==0.?0:fb.x==0.&&fb.y==0.&&fc.x==0.&&fc.y==0.?1:2;
}
`;

// uW[4].x, uW[34].x: each slot's turns of colour per line. .z: its calm (prism.js): the deep side comes towards the light side and the steps from band to band get smaller. uW[4].y: the flow, in turns.
// uW[5], uW[35]: where each family's structure stands at the middle of the frame (prism.js, centreOf). Bands are counted from there.
// Each band is one flat ink. Its colour is how far its cell is from the middle of the frame, counted in bands of every family that's open, each by its own number (cut as lineCells cuts it: duty and threshold both) less its offset.
// So a band is never shaded, its colour moves only as the band does, a landing's whole turns (in the number and the offset alike) change nothing, and it doesn't matter which family is which:
// a relay that swaps two families' parts, or a slide that flips one, draws the same colour as before. A check's cells make diamonds of colour round the middle, stripes mirror about the middle.
// Round a pole, spokes come round by their turns, so the slot's turns of colour per line make that a whole number of turns of colour (prism.js) and there's no cut. A spiral's colour runs along its arms with its turns taken out instead.
// The state row (y 0), by the same count (spirals' turns taken out, so that has no cut either): x the centre hue, y how wide a stretch of the wheel shows, z the tune's bend. A change reaches the bands at the middle first
// and goes on out across the bands, band by band, so it's never a glow across a big flat shape.
// Where the colour would change faster than a pixel can show (the middle of a pole, lines far too fine), it settles to the centre hue instead of going to speckle.
export const COLOR = `// the middle of the band this pixel's in, cut as lineCells cuts it
float wMid(int k,int K){
  float x=gPh[k],d=gDu[k],v=tri(x)-d,th=gTh[K],t=abs(th)*(1.-smoothstep(.85,1.,abs(d)));
  if(abs(d)>=1.) return floor(x)+.5;
  bool w=th>=0.?v>t:v>-t;
  return w?floor(x)+.5:floor(x+.5);
}
vec3 worldColor(int k0,int k1,float c){
  int K=k0/FAM;
  vec4 sl=uW[4+K*30];
  float a=sl.x,calm=sl.z,T=0.;
#ifndef FLIGHT
  bool two=k1>FAM; vec4 pa=uF[F_PAIR];
  if(two){ vec2 res=uF[8].xy; T=xfT((gl_FragCoord.xy-.5*res)/res.y*2.,uF[0].x); a=mix(a,uW[34].x,T); calm=mix(calm,uW[34].z,T); }
#endif
  float u=0.,ud=0.,g=0.;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float wt=1.-smoothstep(.85,1.,abs(gDu[k]));      // a family closing up lets go of the colour as it goes
    if(wt<=0.) continue;
    int ks=k<FAM?0:1,i=k-ks*FAM;
    float o=wO[k],w=wA[k],s0=uW[5+ks*30][i];
#ifndef FLIGHT
    if(two&&k<FAM){ int j=int(pa[k]); if(j>=0){ o=mix(o,wO[FAM+j],T); w=mix(w,wA[FAM+j],T); s0=mix(s0,uW[35][j],T); } }
#endif
    float m=wMid(k,K)-o,e=abs(m-w-s0);
    u+=wt*(wK[k]==1?m:e); ud+=wt*e; g=max(g,wt*gGn[k]);
  }
  // Lines finer than about 12 pixels a cycle at 720 lines (whatever the canvas) give up their colour steps too: there a sheet moving fast sweeps its colours through every tile faster than the eye can follow (MGMT 227 s, a fine floor going by).
  float f=(1.-smoothstep(.015,.05,g*a))*(1.-smoothstep(.04,.1,g*uF[8].y/720.));
  vec4 st=texelFetch(uWT,ivec2(clamp(int(a*ud*f*${REACH}.),0,255),0),0);
  // prism12: a ladder round the wheel, not a fold back and forth: every band one step on from the band inside it, so the whole spectrum lies across the pattern, and on every strong beat each band's colour moves on to the next band (uW[4].y, in bands).
  // The song's size stretches the step (quiet, near neighbours; loud, bigger leaps), except round spokes, where it has to come back to its own colour. A surface going by fast keeps to smaller steps (MGMT 227 s).
  float lk=sl.w;
#ifndef FLIGHT
  if(two) lk=max(lk,uW[34].w);
#endif
  float W=lk>.5?1.:mix(.7,1.5,clamp((st.y-.2)/.58,0.,1.))*(1.-.5*calm);
  float h=st.x+st.z+f*W*a*(u-uW[4].y);
  int i=int(fract(h)*256.)&255;
  vec3 L=texelFetch(uWT,ivec2(i,1),0).rgb;
  if(c>=1.) return gamma(L);
  vec3 D=mix(texelFetch(uWT,ivec2(i,2),0).rgb,L,.55*calm);      // towards the light side, not brighter: a deep red made brighter is a saturated red, a red flash (MGMT 29 s)
  return gamma(c<=0.?D:mix(D,L,c));
}
`;
