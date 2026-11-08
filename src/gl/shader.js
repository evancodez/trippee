// The whole picture is one signed field and one threshold. All mixing happens on the field, before the threshold, so a
// grey crossfade cannot occur. Everything here is a pure function of the numbers in the block: no history, no lighting.
// The text lives in chunks/, one file for each thing the shader does, and is joined here in the order GLSL needs it.
import head from './chunks/head.js';
import surface from './chunks/surface.js';
import matte from './chunks/matte.js';
import hand from './chunks/hand.js';
import moves from './chunks/moves.js';
import carry from './chunks/carry.js';
import fold from './chunks/fold.js';
import fieldImpossible from './chunks/field-impossible.js';
import fieldRiley from './chunks/field-riley.js';
import fields from './chunks/fields.js';
import song from './chunks/song.js';
import xform from './chunks/xform.js';
import handview from './chunks/handview.js';
import space from './chunks/space.js';
import sky from './chunks/sky.js';
import time from './chunks/time.js';
import prepare from './chunks/prepare.js';
import ink from './chunks/ink.js';
import plates from './chunks/plates.js';
import main from './chunks/main.js';

export const VERT = `#version 300 es
out vec2 vUv;
void main(){ vec2 v=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv=v; gl_Position=vec4(v*2.-1.,0.,1.); }`;

export const FRAG = [head, surface, matte, hand, moves, carry, fold, fieldImpossible, fieldRiley, fields, song, xform, handview, space, sky, prepare, ink, time, plates, main].join('');

// Brush pass: paints displacement into a small texture, which springs back on its own.
export const BRUSH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec4 uBrush;   // x,y in uv; z radius (uv height units); w on
uniform vec4 uBrush2;  // dx,dy displacement, aspect, heal rate per frame
in vec2 vUv;
out vec4 o;
void main(){
  vec2 v=texture(uPrev,vUv).xy*(1.-uBrush2.w);
  if(uBrush.w>.5){
    vec2 d=vUv-uBrush.xy; d.x*=uBrush2.z;
    v+=uBrush2.xy*exp(-dot(d,d)/(uBrush.z*uBrush.z));
  }
  o=vec4(v,0.,1.);
}`;
