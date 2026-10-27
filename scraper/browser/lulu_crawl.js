// Lulu Hypermarket Bahrain price + picture bot (runs in the browser, no AI).
// Why a browser script: Lulu sits behind Cloudflare and blocks plain HTTP bots, but pages load fine in a real browser.
// How to run: open https://gcc.luluhypermarket.com/en-bh/ in Chrome, press F12, open the Console, paste this
// whole file and press Enter. KEEP THE TAB VISIBLE (background tabs are throttled). It takes ~20 minutes and
// finishes by downloading lulu.json. Move that file to scraper/raw/lulu.json, then run match.py.
// It stops by itself if Cloudflare shows a challenge page (it never tries to get around one).
(async () => {
  const CATS = ["grocery-food-cupboard", "grocery-speciality-food", "grocery-baby-products", "grocery-beauty-wellness",
    "grocery-household", "grocery-household-pets-essentials", "fresh-food-dairy-eggs-cheese", "fresh-food-bakery",
    "fresh-food-delicatessen", "fresh-food-fruits-vegetables", "fresh-food-fresh-meat-poultry",
    "fresh-food-fresh-fish-seafoods", "fresh-food-on-the-go-meals-desserts", "home-living-major-appliances",
    "home-living-kitchen-appliances", "home-living-cooking-dining", "home-living-stationery",
    "home-living-stationery-school-bags", "home-living-luggage", "home-living-toys",
    "home-living-home-furnishing-home-decor", "home-living-home-furnishing-furniture", "home-living-outdoor-accessories",
    "home-living-books", "home-living-sports-fitness-swimming-pool-accessories", "electronics-mobiles-wearables-mobiles",
    "electronics-mobiles-wearables-smartwatches-wearables", "electronics-mobiles-wearables-mobile-accessories",
    "electronics-computer-accessories", "electronics-computer-accessories-pc-accessories", "electronics-tv",
    "electronics-audio", "electronics-it-accessories-printers-scanners-accessories", "electronics-camera",
    "electronics-medical-equipment", "electronics-gaming", "grocery-food-cupboard-breakfast-spreads",
    "grocery-food-cupboard-beverage", "grocery-food-cupboard-frozen-food", "grocery-food-cupboard-world-foods",
    "grocery-food-cupboard-frozen-food-ice-cream", "grocery-beauty-wellness-premium-perfumes"];
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
  const parse = (d, cat) => {
    const out = new Map(), by = new Map();
    d.querySelectorAll('a[href*="/p/"]').forEach((a) => {
      const m = a.getAttribute("href").match(/\/p\/(\d+)/);
      if (m) { if (!by.has(m[1])) by.set(m[1], []); by.get(m[1]).push(a); }
    });
    by.forEach((as, id) => {
      const a = as[0]; let c = a;
      for (let i = 0; i < 8 && c && !/BHD/.test(c.textContent); i++) c = c.parentElement;
      if (!c) return;
      const t = c.textContent, nodes = priceIn(d, c), pm = nodes[0] || t.match(/(\d+\.\d{3})\s*BHD/);
      if (!pm) return;
      const was = nodes[1] || (nodes.length ? null : t.slice(t.indexOf(pm[0]) + pm[0].length).match(/^\s*(\d+\.\d{3})/));
      let name = as.map((x) => x.textContent.trim()).sort((x, y) => y.length - x.length)[0];
      if (!name) name = t.slice(0, t.indexOf(pm[0])).replace(/^\d+/, "").trim();
      const im = [...c.querySelectorAll("img")].find((i) => !/hover image$/i.test(i.alt || "") && /\/products\//.test(i.getAttribute("src") || i.getAttribute("srcset") || ""));
      let img = null;
      if (im) { const m2 = (im.getAttribute("srcset") || "").match(/(\S+)\s+256w/); img = m2 ? m2[1] : im.getAttribute("src"); }
      out.set(id, { i: id, n: name, p: parseFloat(pm[1]), w: was && parseFloat(was[1]) > parseFloat(pm[1]) ? parseFloat(was[1]) : null,
        c: cat, u: a.getAttribute("href").split("?")[0], im: img });
    });
    return out;
  };
  const data = new Map();
  let blocked = false;
  for (const cat of CATS) {
    if (blocked) break;
    const seen = new Set();
    for (let pg = 1; pg < 400; pg++) {
      const r = await fetch(`/en-bh/${cat}/?page=${pg}`), html = await r.text();
      if (!r.ok || /cf-challenge|Just a moment|Attention Required/i.test(html.slice(0, 3000))) { console.warn("Blocked at", cat, pg, "- stopping"); blocked = true; break; }
      let fresh = 0;
      parse(new DOMParser().parseFromString(html, "text/html"), cat).forEach((v, k) => { if (!seen.has(k)) { seen.add(k); fresh++; if (!data.has(k)) data.set(k, v); } });
      if (!fresh) break;
    }
    console.log(cat, "-> total", data.size);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...data.values()])], { type: "application/json" }));
  a.download = "lulu.json"; a.click();
  console.log("done:", data.size, "products");
})();
