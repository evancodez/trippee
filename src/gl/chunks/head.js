// The top of the fragment shader: the block, and the few small functions everything uses.
import { GLSL_INDEX, GLSL_SLOT } from '../../pattern/layout.js';

export default `#version 300 es
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

#ifdef WORLD
layout(std140) uniform WBlock { vec4 uW[64]; };
uniform sampler2D uWT;
uniform sampler2D uTrace;
#ifdef WORLD_CELLS
float gTh[3];
bool gFlip[3]=bool[3](false,false,false);
#endif
#ifdef WORLD_X
vec2 gX[3];
#endif
#ifdef WORLD_GEN
float gGen[3]=float[3](0.,0.,0.);
#endif
#ifdef WORLD_WALL
float gWall[3]=float[3](0.,0.,0.);
#endif
//@world:defs
#endif
`;
