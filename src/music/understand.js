// What a song is, as a listener hears it: home, the harmony's place and tension, the phrase's breath, rests, arrivals, and who's leading.
// Stub returning neutral data: no rests, one even clock, nobody leads. See docs/NEXT.md 2.5.
//   M = { home: { root, minor }, runs: [{ t0, t1, c }], place(c) -> [x, y], tension(c), breath: { beats, t: [...] }, rests: [{ a, b, db }],
//         C(t), arrival: [per bar], gains(t) -> { drums, tune, tone, harm } }
const EVEN = Object.freeze({ drums: 1, tune: 1, tone: 1, harm: 1 });

export function understand(A) {
  return {
    home: { root: 0, minor: 0 }, runs: [], place: () => [0, 0], tension: () => 0,
    breath: { beats: 0, t: [] }, rests: [], C: t => t, arrival: [], gains: () => EVEN,
  };
}
