// Prints the top results for common shopper searches so ranking can be judged by eye: node scraper/search_eval.js [n] [query...]
global.window = {}; const root = __dirname + "/..";
require(root + "/catalog.js"); require(root + "/search.js");
const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 };
const ALL = window.CATALOG.map((r) => { let n = 0, min = 1e9; const prices = {}; for (const k in SLOT) { const c = r[SLOT[k]]; if (c) { n++; prices[k] = c[0]; if (c[0] < min) min = c[0]; } } return { id: r[0], name: r[1], size: r[2] || "", category: r[3], sub: r[10] || "", n, min, prices }; });
let t = Date.now(); window.Search.build(ALL); const buildMs = Date.now() - t;
const n = +process.argv[2] || 6;
const Q = process.argv.length > 3 ? process.argv.slice(3) : ["milk", "fresh milk", "bread", "rice", "eggs", "chicken", "water", "sugar", "oil", "tea", "coffee", "cheese", "butter", "yogurt", "banana", "tomato", "onion",
  "apple", "potato", "juice", "pepsi", "chips", "chocolate", "biscuit", "shampoo", "soap", "toothpaste", "diaper", "tissue", "detergent", "dishwash", "laban", "flour", "pasta",
  "tuna", "honey", "dates", "ketchup", "nescafe", "almarai milk 1l", "nido", "pampers 4", "tide 3kg", "lurpak butter", "kitkat", "iphone 15", "samsung tv", "dog food",
  "chiken", "shampo", "tomatos", "cofee", "choclate", "ayran", "خبز", "دجاج", "milk powder", "brown bread", "basmati rice 5kg", "olive oil", "frozen chicken", "ice cream"];
let tot = 0;
for (const q of Q) {
  t = Date.now(); const r = window.Search.search(q, { asYouType: false }); const ms = Date.now() - t; tot += ms;
  console.log(`\n## ${q}  (${r.ids.length} results, ${ms}ms${r.corrected ? ", corrected: " + r.corrected : ""}${r.primary ? ", primary: " + r.primary.cat + " > " + r.primary.sub : ""})`);
  for (const i of r.ids.slice(0, n)) { const p = ALL[i]; console.log(`   ${p.name.slice(0, 60).padEnd(60)} ${(p.category + " > " + p.sub).slice(0, 34).padEnd(34)} ${p.n}sh ${p.min.toFixed(3)}`); }
}
console.log(`\nbuild ${buildMs}ms, avg query ${(tot / Q.length).toFixed(1)}ms`);
