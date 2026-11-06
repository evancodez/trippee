// Beyond's second plate. Only in programs built with PLATES.
export default `#ifdef PLATES
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

`;
