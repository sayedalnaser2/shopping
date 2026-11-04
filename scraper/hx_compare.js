// Compares our search order with Hypermax's own website search (ground truth in work/hx_rank.json, product ids).
// For each query: take our ranking, keep only products Hypermax sells, and measure how many of Hypermax's top-N appear in our top-N.
global.window = {}; require("../catalog.js"); require("../search.js");
const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 };
const ALL = window.CATALOG.map((r) => { let n = 0, min = 1e9; for (const k in SLOT) { const c = r[SLOT[k]]; if (c) { n++; if (c[0] < min) min = c[0]; } }
  return { id: r[0], name: r[1], size: r[2] || "", category: r[3], sub: r[10] || "", n, min, prices: {}, hx: r[6] ? (r[6][2].match(/\/p\/(\d+)/) || [])[1] : null }; });
window.Search.build(ALL); if (process.argv[4] === "hx") window.Search.setProfile("hx");
const GT = require("./work/hx_rank.json"), N = +process.argv[2] || 10, verbose = process.argv[3] === "v";
let tot = 0, cnt = 0, top1 = 0;
for (const q in GT) {
  const truth = GT[q].split(",").slice(0, N), known = new Set(ALL.map((p) => p.hx).filter(Boolean));
  const t = truth.filter((id) => known.has(id)); if (t.length < 3) continue;
  const mine = window.Search.search(q).ids.map((i) => ALL[i].hx).filter(Boolean).slice(0, N);
  const hit = t.filter((id) => mine.includes(id)).length / t.length;
  tot += hit; cnt++; if (mine[0] === truth[0]) top1++;
  if (verbose) console.log(q.padEnd(20), (hit * 100).toFixed(0).padStart(3) + "%", "first:", ALL.find((p) => p.hx === mine[0])?.name, "| Hypermax first:", ALL.find((p) => p.hx === truth[0])?.name);
}
console.log(`overlap@${N}: ${(100 * tot / cnt).toFixed(1)}%  same #1: ${top1}/${cnt}`);
