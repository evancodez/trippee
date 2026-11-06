export default async ({ page, log, save }) => {
  const r = await page.eval(() => { const T = window.trippee; const list = T.list(); const bad = []; for (const p of list) { try { T.still(p.id, 0.5); } catch (e) { bad.push(p.id + ': ' + e.message); } } return { n: list.length, fams: [...new Set(list.map(p => p.family))], bad, v: T.version }; });
  log(JSON.stringify(r));
};
