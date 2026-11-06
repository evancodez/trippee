// What rhythm of pulses did each song get? SONGS="/media/ppp.mp3,/media/mgmt.mp3" node tools/lab.mjs tests/rhythm.mjs --out lab-out/me
export default async ({ page, log }) => {
  for (const src of (process.env.SONGS || '/media/ppp.mp3').split(',')) {
    const r = await page.eval(`(async()=>{ const s = await window.trippee.song(${JSON.stringify(src)}, { seed: 11 }); const R = s.score.react, A = s.analysis, P = R.pulses;
      const gaps = P.slice(1).map((t, i) => t - P[i]).sort((a, b) => a - b);
      const cs = R.choices.map(c => c.label + ':' + c.every + (c.start ? '+' + c.start : ''));
      const pk = Array.from(R.pulse).sort((a, b) => a - b);
      return { bpm: +A.bpm.toFixed(1), meter: A.meter, sections: cs.join(' '), pulses: P.length, medGap: +gaps[gaps.length >> 1].toFixed(2), minGap: +gaps[0].toFixed(2), maxGap: +gaps[gaps.length - 1].toFixed(2), p95: +pk[Math.floor(pk.length * 0.95)].toFixed(2) }; })()`);
    log(src, JSON.stringify(r));
  }
};
