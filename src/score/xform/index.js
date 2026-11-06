// Every way two patterns can become each other, by the kind a plan names.
//   export default { id, plan(a, b, ctx) {}, enter(st) {}, write(st, A, B, F) {} };
// plan returns null if it can't, or a plan whose kind is its id. ctx: { R, aspect, D, rise, xform, m } (m: matchFamilies in plan.js).
// enter runs with both slots filled, and sets st.theta, thetaB, solid, moveA, moveB. write runs last, after the song and the hand.
// The director sets G.xform = { id, ... } and plan.js tries that first, then the usual order.
import slide from './slide.js';
import bend from './bend.js';
import flight from './flight.js';
import shock from './shock.js';
import iris from './iris.js';

export const XFORMS = { slide, bend, flight, dive: flight, rise: flight, shock, iris };
export const xformOf = kind => XFORMS[kind];
