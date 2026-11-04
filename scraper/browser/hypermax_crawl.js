// HyperMax Bahrain price + picture bot (runs in the browser, no AI).
// Why a browser script: hypermax.com.bh blocks plain HTTP bots, but the pages work normally in a real browser.
// How to run: open https://www.hypermax.com.bh/mafbhr/en in Chrome, press F12, open the Console, paste this
// whole file and press Enter. KEEP THE TAB VISIBLE (background tabs are throttled). It takes ~20-30 minutes and
// finishes by downloading hypermax.json. Move that file to scraper/raw/hypermax.json, then run match.py.
(async () => {
  const LOC = "latitude=26.20926164864932&longitude=50.45117116051133";
  const parse = (h, cat, sub) => {
    // Product pictures are not in the card HTML; they are in the page's embedded data as <id>_main.jpg
    const imgs = {};
    for (const m of h.matchAll(/(?:https?:)?(?:\\*\/){2}cdn\.mafrservices\.com[^"'\s\\]*?\/(\d+)_main\.(?:jpg|png|jpeg|webp)/g)) {
      let u = m[0].replace(/\\+\//g, "/"); if (u.startsWith("//")) u = "https:" + u; imgs[m[1]] = u;
    }
    // Price = the text node that holds just "1.234 BHD". Reading the whole block's text glued neighbouring digits
    // (pack counts, shade numbers, item codes) onto the price, e.g. "60" + "3.250" -> 603.25. Fixed 2026-10-27.
    const priceIn = (d, c) => {
      const w = d.createTreeWalker(c, 4), found = [];
      for (let n = w.nextNode(); n && found.length < 2; n = w.nextNode()) {
        const m = n.data.match(/^\s*(\d+\.\d{3})\s*(?:BHD)?\s*$/);
        if (m) found.push(m);
      }
      return found;
    };
    const d = new DOMParser().parseFromString(h, "text/html"), out = new Map();
    d.querySelectorAll('a[href*="/p/"]').forEach((a) => {
      const name = a.textContent.trim(), m = a.getAttribute("href").match(/\/p\/(\d+)/);
      if (!name || !m) return;
      let c = a.parentElement;
      for (let i = 0; i < 8 && c && !/BHD/.test(c.textContent); i++) c = c.parentElement;
      if (!c) return;
      const t = c.textContent, nodes = priceIn(d, c), pm = nodes[0] || t.match(/(\d+\.\d{3})\s*BHD/);
      if (!pm) return;
      const was = nodes[1] || (nodes.length ? null : t.slice(t.indexOf(pm[0]) + pm[0].length).match(/^\s*(\d+\.\d{3})/));
      const size = t.slice(t.indexOf(name) + name.length, Math.max(t.indexOf(name) + name.length, t.indexOf(pm[0]))).replace(/\d+$/, "").trim();
      out.set(m[1], { i: m[1], n: name, s: size, p: parseFloat(pm[1]),
        w: was && parseFloat(was[1]) > parseFloat(pm[1]) ? parseFloat(was[1]) : null,
        c: cat, sc: sub, u: a.getAttribute("href").split("?")[0], im: imgs[m[1]] || null });
    });
    return out;
  };
  const data = new Map();
  const crawl = async (id, top, name) => { // a category page lists at most ~1200 items, so also crawl its sub-categories
    const seen = new Set();
    for (let pg = 1; pg < 100; pg++) {
      const r = await fetch(`/mafbhr/en/c/${id}?currentPage=${pg}`);
      if (!r.ok) break;
      let fresh = 0;
      parse(await r.text(), top, name).forEach((v, k) => { if (!seen.has(k)) { seen.add(k); fresh++; if (!data.has(k)) data.set(k, v); } });
      if (!fresh) break;
    }
  };
  const menu = await (await fetch(`/api/v1/menu?lang=en&${LOC}`)).json();
  const walk = (n) => [n, ...(n.subcategories || []).flatMap(walk)];
  for (const top of menu.foodCategories) {
    for (const n of walk(top)) await crawl(n.id, top.name, n.name);
    console.log(top.name, "-> total", data.size);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...data.values()])], { type: "application/json" }));
  a.download = "hypermax.json"; a.click();
  console.log("done:", data.size, "products");
})();
