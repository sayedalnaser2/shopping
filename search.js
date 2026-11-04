/* Search engine for the price-comparison catalogue (no dependencies, runs in the browser).
 *
 *  - inverted index over product names, sizes and categories
 *  - normalisation: case, accents, apostrophes, plurals, spelling variants (yoghurt/yogurt…)
 *  - sizes understood in any spelling: "1.5l" = "1.5 ltr" = "1500 ml"; "2 kg" = "2000g"
 *  - synonyms and Arabic / transliterated words (حليب, laban, khubz → milk, bread …)
 *  - as-you-type prefixes for the last word, typo tolerance for unknown words
 *  - ranking: rarity of each word (IDF), brand-first, phrase order, concise names, sold in more shops
 *  - "-word" excludes; if too few products contain every word, near matches are shown too
 */
(function () {
  "use strict";

  /* ---------- text normalisation ---------- */
  const UNIT = {
    kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
    g: "g", gm: "g", gms: "g", gr: "g", grm: "g", gram: "g", grams: "g", gramme: "g",
    l: "l", lt: "l", ltr: "l", ltrs: "l", lit: "l", litre: "l", litres: "l", liter: "l", liters: "l",
    ml: "ml", mls: "ml", cl: "cl",
    pc: "pc", pcs: "pc", pce: "pc", piece: "pc", pieces: "pc", s: "pc", ct: "pc", count: "pc", pack: "pk", packs: "pk",
    oz: "oz", lb: "lb", lbs: "lb", gal: "gal", gallon: "gal", gallons: "gal", m: "m", mtr: "m", cm: "cm", mm: "mm", ply: "ply", sheets: "sheets", sheet: "sheets",
  };
  const SPELL = { yoghurt: "yogurt", yoghourt: "yogurt", yogourt: "yogurt", yaourt: "yogurt", chilli: "chili", chillies: "chili", chilly: "chili",
    tomatoe: "tomato", mayonaise: "mayonnaise", mayonnaise: "mayo", ketchup: "ketchup", catsup: "ketchup", biscuits: "biscuit", doughnut: "donut",
    aluminium: "aluminum", flavour: "flavor", flavours: "flavor", colour: "color", colours: "color", fibre: "fiber", centre: "center",
    mozarella: "mozzarella", mozzerella: "mozzarella", parmesean: "parmesan", pringle: "pringles", ariel: "ariel", loreal: "loreal", lorial: "loreal",
    nutela: "nutella", pepsi: "pepsi", cocacola: "cola", coke: "cola", fanta: "fanta", cerelac: "cerelac", "cerelac": "cerelac", nestl: "nestle", nesle: "nestle",
    colgat: "colgate", dettol: "dettol", detol: "dettol", pamper: "pampers", lipton: "lipton", liptone: "lipton", nido: "nido", almaraai: "almarai", almari: "almarai", cooky: "cookie", chily: "chili", tomatoe: "tomato" };
  // groups of words that mean the same thing to a shopper (stored in already-normalised form)
  const SYN_GROUPS = [
    ["chip", "crisp", "crisps"], ["soda", "soft drink", "fizzy"], ["diaper", "nappy", "napy"], ["tissue", "napkin", "kleenex"],
    ["laban", "buttermilk", "ayran"], ["haleeb", "halib", "milk", "حليب"], ["khubz", "khobz", "bread", "خبز"], ["roz", "ruz", "rice", "رز", "ارز", "أرز"],
    ["dajaj", "djaj", "chicken", "دجاج", "فراخ"], ["samak", "fish", "سمك"], ["lahm", "lahem", "meat", "لحم"], ["jibn", "jubn", "jebn", "cheese", "جبن", "جبنة"],
    ["zeit", "zait", "oil", "زيت"], ["sukkar", "sukar", "sugar", "سكر"], ["shai", "chai", "tea", "شاي"], ["qahwa", "gahwa", "kahwa", "coffee", "قهوة"],
    ["maya", "moya", "mai", "water", "ماء", "مياه", "ميه"], ["bayd", "baid", "egg", "بيض"], ["tamr", "tamar", "date", "dates", "تمر", "تمور"],
    ["asir", "juice", "عصير"], ["batata", "potato", "بطاطس", "بطاطا"], ["tamatem", "tomato", "طماطم", "بندورة"], ["mawz", "moz", "banana", "موز"],
    ["tuffah", "apple", "تفاح"], ["burtuqal", "orange", "برتقال"], ["basal", "onion", "بصل"], ["thoum", "toum", "garlic", "ثوم"], ["laymoon", "lemon", "ليمون"],
    ["dahn", "ghee", "سمن"], ["tahini", "tahina", "طحينة"], ["hummus", "hommos", "humus", "حمص"], ["shampoo", "shampu", "شامبو"], ["soap", "sabun", "صابون"],
    ["mayo", "mayonnaise"], ["cola", "cocacola"], ["biscuit", "cookie", "cookies"], ["noodle", "noodles", "indomie"], ["detergent", "washing powder", "tide"],
    ["deodorant", "deo", "antiperspirant"], ["toothpaste", "tooth paste"], ["toothbrush", "tooth brush"], ["handwash", "hand wash"], ["cornflakes", "corn flakes"],
    ["icecream", "ice cream"], ["babyfood", "baby food"], ["petfood", "pet food"], ["catfood", "cat food"], ["dogfood", "dog food"],
  ];

  function stem(w) {
    if (w.length > 4 && /^[a-z]+$/.test(w)) {
      if (w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.endsWith("s") && !/(ss|us|is|ous)$/.test(w)) return w.slice(0, -1);
    }
    return w;
  }
  const strip = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٟـ]/g, "").replace(/[’'`´]/g, "").replace(/&/g, " and ");
  // "6x330ml", "6 x 330 ml", "330mlx6" -> "6 330ml": the multiplication sign carries no meaning of its own
  const unx = (s) => s.replace(/(\d)\s*[x×]\s*(?=\d)/g, "$1 ").replace(/(\d\s*(?:ml|gm|gms|gr|g|kg|ltr|l|pcs|pc))\s*x\s*(?=\d)/g, "$1 ");
  const TOKEN_RE = /\d+(?:\.\d+)?|[\p{L}]+/gu;

  /* A size becomes one canonical token: 1.5 l -> 1500ml, 2 kg -> 2000g, 6 pcs -> 6pc */
  function sizeToken(num, unit) {
    let v = parseFloat(num);
    if (!isFinite(v)) return null;
    if (unit === "kg") { v *= 1000; unit = "g"; }
    else if (unit === "l") { v *= 1000; unit = "ml"; }
    else if (unit === "cl") { v *= 10; unit = "ml"; }
    else if (unit === "m") { v *= 100; unit = "cm"; }
    return (Math.round(v * 1000) / 1000) + unit;
  }

  /* Returns the words of a text as terms. */
  function tokenize(text) {
    const raw = unx(strip(text)).match(TOKEN_RE) || [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      if (/^\d/.test(t)) {
        const u = UNIT[raw[i + 1]];
        if (u && u !== "pk" && u !== "sheets" && u !== "ply") {
          const st = sizeToken(t, u);
          if (st) out.push(st);
          i++; // unit consumed
          continue;
        }
        out.push(t.replace(/^0+(?=\d)/, ""));
      } else {
        let w = SPELL[t] || t;
        w = stem(w);
        out.push(SPELL[w] || w);
      }
    }
    return out;
  }

  /* ---------- synonym table ---------- */
  const SYN = new Map();
  for (const g of SYN_GROUPS) {
    const norm = g.map((x) => tokenize(x).join(" ")).filter(Boolean);
    for (const a of norm) {
      if (a.includes(" ")) continue; // only single words are expanded
      const set = SYN.get(a) || new Set();
      for (const b of norm) if (b !== a && !b.includes(" ")) set.add(b);
      SYN.set(a, set);
    }
  }

  /* ---------- Levenshtein (with adjacent swap), bounded ---------- */
  function within(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i; let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur; cur = new Array(lb + 1);
    }
    return prev[lb];
  }

  /* ---------- the index ---------- */
  let N = 0, docs = [];
  let termId = new Map(), terms = [], df = [], post = [];       // name+size postings
  let catPost = new Map();                                       // category words -> doc ids
  let docTerms = [];                                             // term ids of each product's name, in order
  let sortedTerms = [], sortedIds = [];                          // for prefix lookups
  let byLen = [];                                                // length -> term ids (typo search)
  let sizeNums = new Map();                                      // "1.8" -> size terms such as 1800g
  let boost = null;                                              // sold-in-more-shops boost per doc
  let nameLen = null;

  function build(list) {
    docs = list; N = list.length;
    termId = new Map(); terms = []; df = []; const tmp = [];
    docTerms = new Array(N); catPost = new Map(); boost = new Float32Array(N); nameLen = new Uint8Array(N);
    for (let d = 0; d < N; d++) {
      const p = list[d];
      const toks = tokenize(p.name + " " + (sizeInName(p) ? "" : p.size || ""));
      const ids = new Int32Array(toks.length);
      const seen = new Set();
      for (let i = 0; i < toks.length; i++) {
        let id = termId.get(toks[i]);
        if (id === undefined) { id = terms.length; termId.set(toks[i], id); terms.push(toks[i]); df.push(0); tmp.push([]); }
        ids[i] = id;
        if (!seen.has(id)) { seen.add(id); df[id]++; tmp[id].push(d); }
      }
      docTerms[d] = ids; nameLen[d] = Math.min(255, toks.length);
      boost[d] = 1 + 0.25 * Math.min(Math.max(p.n - 1, 0), 3); // products that can be compared across shops come first
      for (const c of tokenize(p.category || "")) {
        let a = catPost.get(c); if (!a) catPost.set(c, (a = []));
        if (a[a.length - 1] !== d) a.push(d);
      }
    }
    post = tmp.map((a) => Int32Array.from(a));
    sizeNums = new Map();
    terms.forEach((t, id) => {
      const m = /^(\d+(?:\.\d+)?)(g|ml)$/.exec(t);
      if (!m) return;
      const v = parseFloat(m[1]);
      for (const x of [v, v / 1000]) {
        if (x === v / 1000 && v < 100) continue;
        const k = String(Math.round(x * 1000) / 1000);
        let a = sizeNums.get(k); if (!a) sizeNums.set(k, (a = []));
        a.push(id);
      }
    });
    const order = terms.map((_, i) => i).sort((a, b) => (terms[a] < terms[b] ? -1 : terms[a] > terms[b] ? 1 : 0));
    sortedIds = order; sortedTerms = order.map((i) => terms[i]);
    byLen = [];
    for (let i = 0; i < terms.length; i++) { const l = terms[i].length; (byLen[l] ||= []).push(i); }
    cache = { q: null, res: null };
  }
  // does the name already say the size? then do not index the separate size field twice
  function sizeInName(p) { return !p.size || strip(p.name).replace(/\s+/g, "").includes(strip(p.size).replace(/\s+/g, "")); }

  const idf = (id) => Math.log(1 + N / (df[id] || 1));
  const isNum = (t) => /^\d/.test(t);

  function lowerBound(prefix) {
    let lo = 0, hi = sortedTerms.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedTerms[m] < prefix) lo = m + 1; else hi = m; }
    return lo;
  }
  function prefixTerms(prefix, cap) {
    const out = [];
    for (let i = lowerBound(prefix); i < sortedTerms.length && sortedTerms[i].startsWith(prefix); i++) out.push(sortedIds[i]);
    out.sort((a, b) => df[b] - df[a]);
    return out.slice(0, cap);
  }
  function fuzzyTerms(t, cap) {
    if (t.length < 4 || isNum(t)) return [];
    const max = t.length <= 6 ? 1 : 2;
    const found = [];
    for (let l = t.length - max; l <= t.length + max; l++) {
      const ids = byLen[l]; if (!ids) continue;
      for (const id of ids) {
        const c = terms[id];
        if (c[0] !== t[0] && c[1] !== t[1]) continue; // cheap filter: first or second letter agrees
        if (isNum(c)) continue;
        const dd = within(t, c, max);
        if (dd <= max) found.push([dd, id]);
      }
    }
    found.sort((a, b) => (a[0] * 3 - Math.log(df[a[1]] + 1)) - (b[0] * 3 - Math.log(df[b[1]] + 1))); // closer AND more common first
    return found.slice(0, cap);
  }

  /* ---------- query parsing ---------- */
  function parse(q) {
    const neg = [], pos = [];
    for (const part of q.trim().split(/\s+/)) {
      if (!part) continue;
      if (part.length > 1 && part[0] === "-") { for (const t of tokenize(part.slice(1))) neg.push(t); }
      else for (const t of tokenize(part)) pos.push(t);
    }
    return { pos, neg, endsNeg: /\s-\S*$/.test(" " + q.trim()) };
  }

  /* Expands each query word to the index terms it can stand for. */
  function expand(pos, asYouType) {
    const exps = []; let corrected = false;
    pos.forEach((t, i) => {
      const e = new Map(); // termId -> weight
      let cap = Infinity;   // longer words that merely start with the typed word never outrank the word itself
      const add = (id, w) => { if (id != null && (e.get(id) || 0) < w) e.set(id, w); };
      const own = termId.get(t);
      if (own !== undefined) { add(own, 1); cap = idf(own) * 1.05; }
      const syn = SYN.get(t);
      if (syn) for (const s of syn) { const id = termId.get(s); if (id !== undefined) add(id, 0.85); }
      let how = own !== undefined ? "exact" : "";
      const last = i === pos.length - 1;
      if ((last && asYouType && t.length >= 2) || (own === undefined && t.length >= 3 && !isNum(t))) {
        const pre = prefixTerms(t, last ? 120 : 40);
        if (own === undefined && pre.length) cap = idf(pre[0]) * 1.05;
        for (const id of pre) add(id, id === own ? 1 : 0.72);
        if (pre.length && !how) how = "prefix";
      }
      if (/^\d+(?:\.\d+)?$/.test(t)) { // a bare "1.8" or "500" also matches sizes such as 1800g (1.8 kg) or 500ml
        const ids = sizeNums.get(t);
        if (ids) for (const id of ids) add(id, 0.7);
      }
      if (!e.size) {
        const fz = fuzzyTerms(t, 6);
        for (const [dd, id] of fz) add(id, dd === 1 ? 0.62 : 0.5);
        if (fz.length) { how = "fuzzy"; corrected = true; }
      }
      exps.push({ t, e, cap, how: how || "none", size: /^\d+(?:\.\d+)?(g|ml|pc|oz|lb|gal|cm|mm)$/.test(t) });
    });
    return { exps, corrected };
  }

  /* ---------- search ---------- */
  let cache = { q: null, res: null };
  function search(q, opts) {
    const asYouType = !opts || opts.asYouType !== false;
    const key = q + "|" + asYouType;
    if (cache.q === key) return cache.res;
    const res = run(q, asYouType);
    cache = { q: key, res };
    return res;
  }

  function run(q, asYouType) {
    const { pos, neg, endsNeg } = parse(q);
    if (endsNeg) asYouType = false;
    const empty = { ids: [], terms: new Set(), words: [], partial: false, corrected: null, exact: 0 };
    if (!pos.length) return empty;
    const { exps, corrected } = expand(pos, asYouType);

    // 1. per word: which products contain a matching term, and how well
    const per = exps.map(() => new Map()); // doc -> score
    exps.forEach((x, i) => {
      const m = per[i];
      for (const [id, w] of x.e) {
        const s = w * Math.min(idf(id), x.cap), arr = post[id];
        for (let k = 0; k < arr.length; k++) { const d = arr[k]; if ((m.get(d) || 0) < s) m.set(d, s); }
      }
      const c = catPost.get(x.t);
      if (c) { const s = 0.35 * Math.log(1 + N / Math.max(1, c.length)); for (const d of c) if ((m.get(d) || 0) < s) m.set(d, s); }
    });

    // 2. products that contain every word; if there are few, relax (size words and one missing word)
    let cand = new Map(), partial = false;
    const need = exps.length;
    const smallest = [...per.keys()].sort((a, b) => per[a].size - per[b].size)[0];
    for (const d of per[smallest].keys()) {
      let sum = 0, hit = 0;
      for (let i = 0; i < need; i++) { const s = per[i].get(d); if (s) { sum += s; hit++; } }
      if (hit === need) cand.set(d, sum);
    }
    const wanted = 10;
    if (cand.size < wanted && need > 1) {
      // allow missing words; each missing word costs its weight. Never let a size word be the only link.
      const all = new Map();
      for (let i = 0; i < need; i++) for (const d of per[i].keys()) if (!all.has(d)) all.set(d, 0);
      const minHit = Math.max(1, need - (need >= 4 ? 2 : 1));
      for (const d of all.keys()) {
        if (cand.has(d)) continue;
        let sum = 0, hit = 0, textHit = 0;
        for (let i = 0; i < need; i++) { const s = per[i].get(d); if (s) { sum += s; hit++; if (!exps[i].size && !isNum(exps[i].t)) textHit++; } }
        const textWords = exps.filter((x) => !x.size && !isNum(x.t)).length;
        if (hit >= minHit && (textWords === 0 || textHit >= Math.max(1, textWords - (textWords >= 2 ? 1 : 0)))) cand.set(d, sum * 0.5);
      }
      partial = cand.size > 0;
    }
    // exclusions
    if (neg.length) {
      for (const t of neg) {
        const id = termId.get(t); if (id === undefined) continue;
        for (const d of post[id]) cand.delete(d);
      }
    }

    // 3. refine order: brand first, phrase, conciseness, shops
    const qTerms = new Map(); // termId -> word index (best weight)
    exps.forEach((x, i) => { for (const [id, w] of x.e) { const o = qTerms.get(id); if (!o || o.w < w) qTerms.set(id, { i, w }); } });
    const list = [];
    let exact = 0;
    for (const [d, base] of cand) {
      const ids = docTerms[d]; let score = base, run = 0, best = 0, prev = -2, firstHit = false, full = 0;
      for (let p = 0; p < ids.length; p++) {
        const h = qTerms.get(ids[p]);
        if (!h) { run = 0; continue; }
        if (p === 0 && h.i === 0) firstHit = true;
        if (h.w >= 0.99) full++;
        run = prev === p - 1 && h.i >= 0 ? run + 1 : 1; prev = p;
        if (run > best) best = run;
      }
      if (firstHit) score += 0.6;
      if (best > 1) score += 0.5 * (best - 1);
      if (best >= exps.length && exps.length > 1) score += 1;
      score *= 1 + 0.9 / (1 + Math.max(0, nameLen[d] - exps.length) * 0.55);       // concise names first
      score *= boost[d];
      if (full === exps.length) exact++;
      list.push([score, d]);
    }
    list.sort((a, b) => b[0] - a[0] || a[1] - b[1]);

    const matched = new Set();
    for (const [id] of qTerms) matched.add(terms[id]);
    const fixes = exps.filter((x) => x.how === "fuzzy").map((x) => {
      let best = null, bw = -1; for (const [id, w] of x.e) if (w > bw || (w === bw && df[id] > df[best])) { best = id; bw = w; }
      return best == null ? x.t : terms[best];
    });
    let correctedText = null;
    if (corrected) {
      const raw = q.trim().split(/\s+/).filter((w) => w[0] !== "-");
      correctedText = exps.map((x, i) => (x.how === "fuzzy" ? fixes.shift() : raw.length === exps.length ? raw[i] : x.t)).join(" ");
    }
    return { ids: list.map((x) => x[1]), terms: matched, words: pos, partial, corrected: correctedText, exact };
  }

  /* ---------- suggestions ---------- */
  function suggest(q, limit) {
    limit = limit || 8;
    const out = [], seen = new Set();
    const push = (o) => { const k = o.type + o.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(o); } };
    const trimmed = q.replace(/\s+$/, "");
    if (!trimmed) return out;
    const hasTrailingSpace = q.length !== trimmed.length;
    const parts = trimmed.split(/\s+/);
    const lastRaw = parts[parts.length - 1];
    const head = parts.slice(0, -1).join(" ");
    if (!hasTrailingSpace && lastRaw.length >= 2 && !lastRaw.startsWith("-")) {
      const lt = tokenize(lastRaw);
      if (lt.length === 1 && !isNum(lt[0])) {
        let ids = prefixTerms(lt[0], 12).filter((id) => df[id] >= 2 && terms[id] !== lt[0]).slice(0, 4);
        if (!ids.length && termId.get(lt[0]) === undefined) ids = fuzzyTerms(lt[0], 3).map((x) => x[1]);
        for (const id of ids) push({ type: "word", text: (head ? head + " " : "") + terms[id] });
      }
    }
    const r = search(trimmed, { asYouType: !hasTrailingSpace });
    const names = new Set();
    for (const d of r.ids) {
      const p = docs[d], k = p.name.toLowerCase();
      if (names.has(k)) continue; names.add(k);
      push({ type: "product", text: p.name, idx: d });
      if (out.length >= limit + 4) break;
    }
    return out.slice(0, limit);
  }

  /* Wraps matched words of a product name in <mark>. esc is the caller's HTML escaper. */
  function highlight(name, matched, esc) {
    if (!matched || !matched.size) return esc(name);
    let out = "", last = 0;
    const re = /[\p{L}\p{N}][\p{L}\p{N}.'’]*/gu;
    let m;
    while ((m = re.exec(name))) {
      const toks = tokenize(m[0]);
      if (toks.length && toks.every((t) => matched.has(t))) {
        out += esc(name.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>"; last = m.index + m[0].length;
      }
    }
    return out + esc(name.slice(last));
  }

  window.Search = { build, search, suggest, highlight, tokenize };
})();
