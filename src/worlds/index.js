// The worlds, by id. A file at src/worlds/<id>.js that default-exports a world (docs/MODES.md, "The world's shape") is all it takes for one to appear: there's nothing to register here, and until its file loads a world is hidden.
//
// The shape, as built. Everything is optional but id and name. mirror.js has the two smallest there are.
//   id, name, chips: [[r,g,b]...]        sRGB, for the strip
//   pool: [patterns], borrow: [ids]      its own patterns, ordinary pattern objects, plus any from the library by id. Both empty: it draws from the library. They never go in the library itself, or the film's draws would change.
//   glsl: { defs, field, surface, phase, warp, preInk, T, color }    strings, each a whole function:
//     defs      anything, at the end of the head, before everything else. It can use uW, uG, uF and tri, rot, boil.
//     color     vec3 worldColor(int k0,int k1,float c)           The colour stage: what to show, in display values. k0..k1 is a run of families, and in a flight it's called once per pattern. k0/FAM is which slot.
//                                                                 Use lineRows(k0,k1), never 0 and FAM. inkRow(row,side) is linear, so gamma() it. film(c) is what the film draws. c is the picture and nothing may change it.
//     field     float worldField(int b,vec2 X,vec4 f)            For field.kind >= 4: b is the slot's offset in uG, f its field numbers. Goes into each family's phase times its field.k.
//     surface   vec3 worldSurface(int b,vec2 p,inout float cover,inout float parity)     For surf.kind >= 3. May write gWall[b==0?0:1].
//     phase     void worldPhase(int K,int i,vec3 X)              After a family's gradient: may change gPh, gGn, gDu at K*FAM+i.
//     warp      vec2 worldWarp(vec2 p0,vec2 p)                   Where the sheet's push is read.
//     preInk    void worldPreInk(int K)                          Before coverage is worked out from gPh, gGn, gDu. Called for each slot.
//     T         float worldT(vec2 p0,float T)                    A bend's time, local to the pixel.
//   Naming gX[K] (the pattern coordinate), gGen[K] (droste generation) or gWall[K] in any of these turns on capturing it. WGEO (the geometry share), WROWS, WROLL and WEIGHTS are there in all of them.
//   THE RULE. A program only has its own world's hooks, and at the middle of a change of world the program changes. So phase, warp, preInk, T and surface must do exactly nothing when WGEO is 0, or that frame jumps.
//   A field needs nothing done: the engine takes it down. Colour needs nothing done either. tests/worlds.mjs, STAGE=change, has the byte check to copy.
//   ink: { R, fams: [0], roll: false, weights }   numbers its lines: family i in fams counts weights[i] (default 1,2,3,5) towards a line's row, mod R. Slides and bends that would move or flip one of these families become flights.
//   table: { h, fill(tex, ctx) }         uWT, RGBA16F, 256 wide, h high. tex.set(x, y, r, g, b, a). Return false when nothing changed. Pure.
//   uniforms(U, ctx)                     each frame, pure: U.a and U.b are slot A's and B's 120 numbers, read as uW[4+K*30+n]. ctx: t, c, x, T, kind, G, from, to, plan, geo, A, B, F, tables, at(c) = the song's reactAt anywhere, change.
//   tables(A, M)                         at compose: from the analysis and what understand() heard. It's ctx.tables.
//   motion: { len: [a,b], morph: [a,b], slower, glide, rise, front, xform: 'name', keep: ['name'], xforms: { name: { id, plan, enter, write, levers } } }    front: true for xfU mode 3, a straight front along uW[3].w
//     xform     what a gesture with no transformation of its own goes by, whoever made it: the film, the wander, a hand. A plan that can't (it returned null) still falls through to the usual order.
//     keep      transformations a rehearsal that's watched a flash mustn't take away. It tries what the transformation offers, then taking longer. The judge's limits don't move, so a kept one has to pass as it stands.
//     levers    { name: (G, N) => undo }, on a transformation: things a rehearsal may try inside it, in order, each kept only if there's less flashing. Whatever a lever sets on G is what enter and write read back (st.from). Undo puts it back. Return nothing if it has nothing to try.
//   hear: { pulse, melody, tone, harmony, lung, threshold }    gains on the song, 1 by default. threshold: how much of the strong beats moves the threshold (gBeat is there either way).
//   needs: ['wave']                      extras it waits for: they're in A.x by the time tables() runs. direct(score, A, M): its own director.
//   fuller(slot)                         does this slot need the world's code that most of its patterns don't? That code goes in #ifdef WORLD_FULL in any hook, and is built into programs of its own. A program pays for its peak on every pixel, used or not.
// Dusk, Flyer and Pearl are out of the strip for now: their files are all still here, and adding an id back brings one back.
export const WORLDS = ['flower', 'prism'];
// Test worlds. They load like any other, and are only in the strip with ?worlds=test.
export const TEST = ['mirror', 'numbers'];

const loaded = new Map();
// A world's module, or null if it has no file yet. The file is looked for first so that a mistake in one that's there says so, and isn't just a world that doesn't show up.
export async function load(id) {
  if (loaded.has(id)) return loaded.get(id);
  let W = null;
  if (id === 'numbers' || id === 'mirror') {
    const m = await import('./mirror.js');
    W = id === 'mirror' ? m.default : m.numbers;
  } else {
    const url = new URL(`./${id}.js`, import.meta.url);
    const there = await fetch(url, { method: 'HEAD' }).then(r => r.ok && /javascript/.test(r.headers.get('content-type') ?? ''), () => false);
    if (there) { try { W = (await import(url.href)).default; } catch (e) { console.error(`world ${id} failed to load:`, e); } }
  }
  loaded.set(id, W);
  return W;
}

// Those there are, in the strip's order.
export async function available({ test = false } = {}) {
  const ids = test ? [...TEST, ...WORLDS] : WORLDS, all = await Promise.all(ids.map(load));
  return all.filter(Boolean);
}
