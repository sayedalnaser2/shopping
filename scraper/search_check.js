// Quick quality check of search.js against the real catalog: node scraper/search_check.js
// Each line: query, text that must appear in the names of the top 5 results (or a "cat:Main > Sub" for the category of the top 5)
global.window = {}; const root = __dirname + "/..";
require(root + "/catalog.js"); require(root + "/search.js");
const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 };
const ALL = window.CATALOG.map((r) => { let n = 0, min = 1e9; const prices = {}; for (const k in SLOT) { const c = r[SLOT[k]]; if (c) { n++; prices[k] = c[0]; if (c[0] < min) min = c[0]; } } return { id: r[0], name: r[1], size: r[2] || "", category: r[3], sub: r[10] || "", n, min, prices }; });
window.Search.build(ALL);
const T = [
  ["nido 1.8kg", "nido"], ["yoghurt", "yog"], ["yogurt", "yog"], ["coffee", "cat:Beverages > Coffee"], ["diapers", "cat:Baby > Diapers"], ["pampers size 4", "pampers"],
  ["toothpaste", "toothpaste"], ["colgate", "colgate"], ["pepsi 6x330ml", "pepsi"], ["water 1.5 litre", "water"], ["حليب", "milk"], ["laban", "laban"], ["chicken breast", "chicken"],
  ["iphone", "iphone"], ["tide detergent", "tide"], ["milk under 1", "milk"], ["rice at ramez", "rice"], ["nutela", "nutella"], ["coca cola", "cola"], ["almarai milk -powder", "almarai"],
  ["shampoo dandruff", "shampoo"], ["tuna", "tuna"], ["lipton tea bags", "lipton"], ["dates", "date"], ["eggs", "egg"],
];
let bad = 0;
for (const [q, want] of T) {
  const r = window.Search.search(q), top = r.ids.slice(0, 5).map((i) => ALL[i]);
  let ok;
  if (want.startsWith("cat:")) { const [m, s] = want.slice(4).split(" > "); ok = top.filter((p) => p.category === m && p.sub.startsWith(s)).length >= 3; }
  else ok = top.filter((p) => p.name.toLowerCase().includes(want)).length >= 3;
  if (!ok) { bad++; console.log("FAIL", q, "->", top.map((p) => p.name.slice(0, 30)).join(" | ")); }
}
const it = (q) => JSON.stringify(window.Search.search(q).intent);
console.log("intents:", it("milk under 1"), it("rice at ramez"), it("coffee between 1 and 3"), it("milk 1 litre"));
console.log(bad ? bad + " of " + T.length + " checks failed" : "all " + T.length + " checks passed");
