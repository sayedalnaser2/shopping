// Megamart Bahrain price + picture bot (runs in the browser, no AI).
// How to run: open https://megamart.bh/en/ in Chrome, press F12, open the Console, paste this whole file and press
// Enter. KEEP THE TAB VISIBLE (background tabs are throttled). It takes ~15-20 minutes and finishes by downloading
// megamart.json. Move that file to scraper/raw/megamart.json, then run match.py.
// Pages are public server-rendered listings; the script stops by itself if a bot-check page appears.
(async () => {
  const num = (t) => { const m = (t || "").replace(/,/g, "").match(/\d+\.\d+|\d+/); return m ? parseFloat(m[0]) : null; };
  const parse = (d, cat) => {
    const out = new Map();
    d.querySelectorAll(".text-action-wrapper").forEach((b) => {
      const a = b.closest("a"); if (!a) return;
      const m = (a.getAttribute("href") || "").match(/_(\d+)\/?$/); if (!m) return;
      const name = (b.querySelector(".excerpt span") || {}).textContent;
      const i = b.querySelector(".intiger"), dec = b.querySelector(".decimal");
      if (!name || !i || !dec) return;
      const p = parseFloat(i.textContent.trim() + dec.textContent.trim());
      if (!(p > 0)) return;
      const was = num((b.querySelector(".oldPrice") || {}).textContent);
      const img = a.querySelector("img");
      out.set(m[1], { i: m[1], n: name.trim().replace(/\s+/g, " "), s: ((b.querySelector(".qtyInfo") || {}).textContent || "").trim(),
        p, w: was && was > p ? was : null, c: cat, u: a.getAttribute("href"),
        im: img ? (img.getAttribute("src") || img.getAttribute("data-src") || null) : null });
    });
    return out;
  };
  const data = new Map();
  let blocked = false;
  const crawl = async (path, cat) => {
    const seen = new Set();
    for (let pg = 1; pg < 500 && !blocked; pg++) {
      const r = await fetch(`${path}?page=${pg}`), html = await r.text();
      if (r.status === 403 || r.status === 429 || /cf-challenge|Just a moment|Attention Required/i.test(html.slice(0, 3000))) { console.warn("Blocked at", path, pg, "- stopping"); blocked = true; break; }
      if (!r.ok) break;
      let fresh = 0;
      parse(new DOMParser().parseFromString(html, "text/html"), cat).forEach((v, k) => { if (!seen.has(k)) { seen.add(k); fresh++; if (!data.has(k)) data.set(k, v); } });
      if (!fresh) break;
    }
  };
  // 1) every top-level category (gives each product a category name)
  const home = new DOMParser().parseFromString(await (await fetch("/en/")).text(), "text/html");
  const tops = [...new Set([...home.querySelectorAll('a[href^="/en/catalogue/category/"]')].map((a) => a.getAttribute("href")))]
    .filter((h) => h.replace(/\/$/, "").split("/").length === 5);
  for (const h of tops) { await crawl(h, h.split("/")[4].replace(/_\d+$/, "").replace(/-/g, " ")); console.log(h, "-> total", data.size); }
  // 2) the whole catalogue, to catch anything not under a top-level category
  await crawl("/en/catalogue/", "other"); console.log("whole catalogue -> total", data.size);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...data.values()])], { type: "application/json" }));
  a.download = "megamart.json"; a.click();
  console.log("done:", data.size, "products");
})();
