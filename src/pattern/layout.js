// The one table that says where every number of a pattern lives in the GPU block.
// A pattern ("genome") is a flat run of SLOT_VEC4 vec4s, so any pattern can be interpolated into any other number by
// number. The shader reads the same indices, generated from this table, so the two can never disagree.

export const FAMILIES = 4;          // XOR-ed phase families per slot

// [name, vec4 index, component names]
const V = [];
const add = (name, comps) => { V.push([name, V.length, comps]); };
for (let i = 0; i < FAMILIES; i++) {
  add(`f${i}a`, [`f${i}.x`, `f${i}.y`, `f${i}.z`, `f${i}.ph`]);     // phase = x·X + y·Y + z·Z + ph (cycles)
  add(`f${i}b`, [`f${i}.r1`, `f${i}.l1`, `f${i}.t1`, `f${i}.d`]);   // + r1·rho1 + l1·ln(rho1) + t1·theta1/2pi; d is this family's own duty
  add(`f${i}c`, [`f${i}.r2`, `f${i}.l2`, `f${i}.t2`, `f${i}.on`]);  // same for pole 2; on = 0 skips the family
}
add('p1', ['p1.x', 'p1.y', 'p1.q', 'p1.ay']);        // pole 1. q: 0 round, 1 square, -1 diamond. ay: y weight (1 = even)
add('p2', ['p2.x', 'p2.y', 'p2.q', 'p2.ay']);        // pole 2
add('shape', ['round', 'sum', 'theta', 'invert']);   // round: 0 sharp (min), 1 dots (product). sum: towards quasicrystal. theta: the threshold
add('view', ['scale', 'rot', 'tx', 'ty']);           // zooms the whole picture, warps included. scale 2 = twice as large
add('tune', ['freq', 'wob', 'wobF', 'wobT']);        // freq multiplies line density after the warps. wob: hand-cut edge wobble, its size in cycles, frequency, time
add('wSqueeze', ['squeeze.a', 'squeeze.x0', 'squeeze.b', 'squeeze.ang']);   // x += a·atan((x-x0)/b): a band that crushes lines
add('wBend1', ['bend1.a', 'bend1.f', 'bend1.ph', 'bend1.ang']);             // shear along a sine, in direction ang
add('wBend2', ['bend2.a', 'bend2.f', 'bend2.ph', 'bend2.ang']);
add('wRipple', ['ripple.a', 'ripple.f', 'ripple.ph', 'ripple.cx']);         // rings of displacement, r += a·sin(f·r - ph), about (cx, 0)
add('wSwirl', ['swirl.a', 'swirl.sig', 'swirl.log', 'swirl.cx']);           // theta += a·exp(-r²/sig²) + log·ln(r)
add('wBowtie', ['bowtie.a', 'bowtie.eps', 'bowtie.x0', 'bowtie.ang']);      // y /= (|x-x0|+eps), towards a waist
add('wBulge', ['bulge.a', 'bulge.r', 'bulge.cx', 'bulge.cy']);              // a lump: lines crowd round its rim
add('wFold', ['fold.n', 'fold.rot', 'fold.cx', 'fold.cy']);                 // kaleidoscope with n sectors. Change n only while solid
add('wLens', ['lens.c', 'lens.cx', 'lens.cy', 'lens.m']);                   // r -> r^c, with c = 1 meaning off
add('wDroste', ['droste.lnS', 'droste.off', 'droste.tw', 'droste.m']);      // endless spiral corridor
add('wTeeth', ['teeth.a', 'teeth.c', 'teeth.v', 'teeth.k']);                // columns stretched to points that slide against each other
add('wZig', ['zig.a', 'zig.c', 'zig.b', 'zig.n']);                          // chevrons: y += a·tri(c·x + b·floor(n·y))
add('wConf', ['conf.amt', 'conf.lam', 'conf.gam', 'conf.k']);               // pole garden, a conformal map. amt 0 off, lam 1 stripes, 0 rings, -1 tangent circles
add('wConfA', ['conf.x1', 'conf.y1', 'conf.x2', 'conf.y2']);
add('wConfB', ['conf.c1', 'conf.c2', 'conf.x3', 'conf.y3']);
add('wSheet', ['sheet.a', 'sheet.f', 'sheet.t', 'sheet.ang']);              // cloth: a rippled sheet seen at an angle, parallax folds
add('mRibbon', ['ribbon.on', 'ribbon.a', 'ribbon.w', 'ribbon.sig']);        // a twisting ribbon: its outline is a matte, the pattern is wrapped round it
add('mRibbon2', ['ribbon.om', 'ribbon.t', 'ribbon.ang', 'ribbon.k']);
add('mBlobs', ['blobs.on', 'blobs.beta', 'blobs.k', 'blobs.t']);            // zebra blobs in the void
add('mBlobA', ['blobs.x1', 'blobs.y1', 'blobs.r1', 'blobs.a1']);
add('mBlobB', ['blobs.x2', 'blobs.y2', 'blobs.r2', 'blobs.a2']);
add('mBlobC', ['blobs.x3', 'blobs.y3', 'blobs.r3', 'blobs.a3']);
add('cam', ['cam.pitch', 'cam.yaw', 'cam.roll', 'cam.dist']);               // radians; camera for surfaces
add('surf', ['surf.kind', 'surf.map', 'surf.mapR', 'surf.spin']);           // kind: 0 flat, 1 quadric, 2 room. map: 0 solid texture, 1 wrap round axis (tunnel, tube), 2 Mercator (sphere)
add('q0', ['q.xx', 'q.xy', 'q.xz', 'q.xw']);                                // the quadric X'QX = 0 (symmetric)
add('q1', ['q.yy', 'q.yz', 'q.yw', 'q.zz']);
add('q2', ['q.zw', 'q.ww', 'room.hw', 'room.hh']);
add('room', ['room.depth', 'room.wall', 'room.back', 'room.floorRot']);     // room.back: 0 void at the end, 1 back wall
add('matte', ['matte.kind', 'matte.outside', 'matte.q', 'matte.wob']);      // kind: 0 none, 1 superellipse, 2 crack. outside: what shows beyond it: 0 black, 1 white, 2 the other slot
add('matte2', ['matte.cx', 'matte.cy', 'matte.rx', 'matte.ry']);
add('matte3', ['matte.rot', 'matte.t', 'matte.invert', 'matte.eps']);
add('bg', ['bg.on', 'bg.rot', 'bg.scale', 'bg.x']);                      // nothing is ever empty: past a surface or shape, the same lines carry on flat, turned by rot

export const SLOT_VEC4 = V.length;
export const SLOT_FLOATS = SLOT_VEC4 * 4;
export const VEC4_INDEX = Object.fromEntries(V.map(([name, i]) => [name, i]));

// name -> float index within a slot
export const OFF = {};
for (const [, i, comps] of V) comps.forEach((c, k) => { OFF[c] = i * 4 + k; });

// Numbers that must jump, never slide. They take the target's value at the halfway point of a lerp.
export const SNAP = new Set(['surf.kind', 'surf.map', 'matte.kind', 'matte.outside', 'fold.n', 'bg.on',
  ...Array.from({ length: FAMILIES }, (_, i) => `f${i}.on`)].map(n => OFF[n]));

// Frame-wide block, after the two slots.
export const RIPPLES = 8;
export const FRAME_VEC4 = 13 + RIPPLES + 14;
export const FRAME = {
  compose: 0,    // x: level-set mix of A into B (0 = A only), y: B active, z: XOR A with B, w: unused
  paper: 1, ink: 2, band1: 3, band2: 4,      // rgb; a: unused
  plate: 5,      // x: plate offset (0 = pure black and white), y: edge cap, z: 1 = 3 nested plates, w: unused
  press: 6,      // x, y, strength, radius: the ball under the sheet, in picture units
  sheetOfs: 7,   // x, y, rotation, strength: a lifted copy XOR-ed on top (the hand's moire)
  res: 8,        // x, y: drawing size in pixels, z: aspect, w: push texture on
  misc: 9,       // x: time in seconds (only for noise in grain-free boil)
  pair: 10,      // morphing: which family of B each family of A bends into, or -1
  hand: 11,      // x, y, height, on (0..1): a hand coming up through the sheet
  hand2: 12,     // curl, spread, turn, size
  ripple: 13,    // RIPPLES of them: x, y, radius of the ring now, height now (0 = none)
  dive: 21,      // flying into an element of one pattern that has the next one inside it: focus x, y, zoom, mode (0 off, 1/2 A holds B in its white/black, 3/4 B holds A)
  mel: 22,       // the tune travelling through the sheet: amount, samples per unit, mode (0 out from the centre, 1 sideways, 2 up), unused
  melS: 23,      // 8 vec4: 32 samples of the melody, newest first
  pose: 31,      // 4 vec4: lenses in the sheet: x, y, strength, radius (the chord's shape, and the pulse)
};

export const GLSL_INDEX = V.map(([name, i]) => `#define I_${name} ${i}`).join('\n');
export const GLSL_SLOT = `#define SLOT ${SLOT_VEC4}\n#define NSLOTS 2\n#define FAM ${FAMILIES}\n#define FRAMEV ${FRAME_VEC4}\n#define F_PAIR ${FRAME.pair}\n#define F_HAND ${FRAME.hand}\n#define F_RIP ${FRAME.ripple}\n#define NRIP ${RIPPLES}\n#define F_DIVE ${FRAME.dive}\n#define F_MEL ${FRAME.mel}\n#define F_MELS ${FRAME.melS}\n#define F_POSE ${FRAME.pose}`;
