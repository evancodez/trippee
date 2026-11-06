// Every way two patterns can become each other, by the kind a plan names.
//   export default { id, plan(a, b, ctx) {}, enter(st) {}, write(st, A, B, F) {} };
// plan returns null if it can't, or a plan whose kind is its id. ctx: { R, aspect, D, rise, xform, m } (m: matchFamilies in plan.js).
// enter runs with both slots filled, and sets st.theta, thetaB, solid, moveA, moveB. write runs last, after the song and the hand.
// The director sets G.xform = { id, ... } and plan.js tries that first, then the usual order.
import slide from './slide.js';
import bend from './bend.js';
import flight, { fall } from './flight.js';
import shock from './shock.js';
import iris from './iris.js';

export const XFORMS = { slide, bend, flight, dive: flight, rise: flight, shock, iris, fall };
export const xformOf = kind => XFORMS[kind];
// How a director asks for one: wearShock moves G's end, so that the hit lands where it's told, and wearFall lands on G's end as it stands. Each returns a falsy value and touches nothing if it can't.
export { canShock, shockFit, wearShock } from './shock.js';
export { wearFall } from './flight.js';
