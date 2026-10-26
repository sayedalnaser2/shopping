// Al Jazira Supermarket Bahrain price + picture bot (runs in the browser, no AI).
// How to run: open https://www.aljazirasupermarkets.com/ in Chrome, press F12, open the Console, paste this whole
// file and press Enter. Keep the tab visible. It takes a few minutes and finishes by downloading jazira.json.
// Move that file to scraper/raw/jazira.json, then run match.py.
// The site's own product list (Wave Grocery) answers pages of 100 products; prices there are in fils (1000 = 1 BD).
(async () => {
  const API = "https://aljazira.api.wavegrocery.com/api/v3.1", H = { headers: { appid: "aljazira-web" } };
  // Category names live in the page itself (the category tree is embedded in /categories/grocery-dry/).
  const txt = (await (await fetch("/categories/grocery-dry/")).text()).replace(/\\"/g, '"');
  const cats = {};
  for (const m of txt.matchAll(/"_id":"([0-9a-f]{24})","name":"([^"]*)","parentCategoryIds":\[([^\]]*)\][^{}]*?"slug":"([^"]+)"[^{}]*?"isOffer":(true|false)[^{}]*?"fullSlug":"([^"]+)"/g))
    cats[m[1]] = { n: m[2].replace(/\\u0026/g, "&"), top: !m[3], offer: m[5] === "true", f: m[6].replace(/^categories\//, "") };
  const PROMO = /reward points|new arrivals|best sellers|exclusive brands/i;
  const pick = (ids) => { // deepest real category of a product (skips promo groupings like "2 REWARD POINTS")
    const c = ids.map((i) => cats[i]).filter((c) => c && !c.offer && !PROMO.test(c.n));
    c.sort((a, b) => b.f.split("/").length - a.f.split("/").length);
    return c[0];
  };
  const data = new Map();
  for (let pg = 0; pg < 400; pg++) {
    const r = await fetch(`${API}/products?available=true&pageNumber=${pg}&pageSize=100&categorySearchType=ALL_LEVELS`, H);
    if (!r.ok) { console.warn("stopped at page", pg, r.status); break; }
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) break;
    let fresh = 0;
    for (const x of list) {
      if (!x.available || !(x.finalPrice > 0) || data.has(x._id)) continue;
      fresh++;
      const c = pick(x.categoryIds || []);
      const pi = x.primaryImage, v = pi && pi.imageVariants;
      const img = v ? `${pi.baseURL}/${(v.variants && (v.variants["2x"] || v.variants["1.5x"])) || v.original}` : null;
      data.set(x._id, { i: x._id, n: (x.brand && !x.name.toLowerCase().includes(x.brand.toLowerCase()) ? x.brand + " " : "") + x.name,
        s: x.unitOfMeasurement || "", p: x.finalPrice / 1000, w: x.beginPrice > x.finalPrice ? x.beginPrice / 1000 : null,
        c: c ? c.f.split("/")[0] : "", sc: c ? c.n : "", u: c ? `/products/${c.f}/${x.slug}-${x._id}/` : `/products/${x.slug}-${x._id}/`, im: img });
    }
    console.log("page", pg, "-> total", data.size);
    if (list.length < 100) break;
    if (!fresh && pg > 3) break;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...data.values()])], { type: "application/json" }));
  a.download = "jazira.json"; a.click();
  console.log("done:", data.size, "products");
})();
