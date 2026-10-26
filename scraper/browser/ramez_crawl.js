// Ramez Bahrain price + picture bot (runs in the browser, no AI).
// Ramez is a single-page app whose product service needs the page's own session, so this bot reads what the page
// shows: it opens every category / sub-category page in a hidden frame and presses "Load more" until the list ends.
// How to run: open https://ramezshopping.com/products/category/Drinks/bh/store/7263?category=235 in Chrome (Bahrain
// store), press F12, open the Console, paste this whole file and press Enter. KEEP THE TAB VISIBLE while it works
// (~20-40 minutes). It finishes by downloading ramez.json. Move that file to scraper/raw/ramez.json, then run match.py.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await sleep(250); } return false; };
  const num = (t) => { const m = (t || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const data = new Map();
  const collect = (doc, top, sub) => {
    doc.querySelectorAll("article.rx-card").forEach((c) => {
      const a = c.querySelector('a[href*="/product/"]'); if (!a) return;
      const m = a.getAttribute("href").match(/\/product\/(\d+)\//); if (!m) return;
      const p = num((c.querySelector(".rx-price-now") || {}).textContent);
      if (!(p > 0)) return;
      const was = num((c.querySelector(".rx-price-old, .rx-price-was, del, s") || {}).textContent);
      const img = c.querySelector("img");
      if (!data.has(m[1])) data.set(m[1], { i: m[1], n: ((c.querySelector(".rx-card__name") || a).textContent || "").trim().replace(/\s+/g, " "),
        s: "", p, w: was && was > p ? was : null, c: top, sc: sub, u: a.getAttribute("href"), im: img ? img.getAttribute("src") : null });
    });
  };
  // every category and sub-category link in the page's menu
  const links = [...new Set([...document.querySelectorAll('a[href*="/products/category/"], a[href*="/products/subcategory/"]')]
    .map((a) => a.getAttribute("href")))];
  console.log(links.length, "category links");
  let next = 0;
  const worker = async () => {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:0;top:0;width:1200px;height:900px;opacity:0.01;pointer-events:none";
    document.body.appendChild(f);
    while (next < links.length) {
      const href = links[next++];
      const label = decodeURIComponent(href.split("/")[3] || "").trim();
      const top = href.includes("/subcategory/") ? "" : label; // sub-category links do not say which category they sit under
      f.src = href;
      await new Promise((res) => { f.onload = res; setTimeout(res, 15000); });
      const d = () => f.contentDocument;
      await waitFor(() => d().querySelectorAll("article.rx-card").length > 0, 8000);
      await sleep(1500); // the "Load more" button appears a moment after the first products
      const more = () => [...d().querySelectorAll("a")].find((e) => /^\s*load more\s*$/i.test(e.textContent));
      let n = d().querySelectorAll("article.rx-card").length, stale = 0;
      for (let i = 0; i < 400 && stale < 2; i++) { // press "Load more" until nothing new appears
        collect(d(), top, label);
        await waitFor(more, 1500);
        const btn = more();
        if (!btn) break;
        btn.click();
        const grew = await waitFor(() => d().querySelectorAll("article.rx-card").length > n, 8000);
        stale = grew ? 0 : stale + 1;
        n = d().querySelectorAll("article.rx-card").length;
        await sleep(300);
      }
      collect(d(), top, label);
      console.log(label, "-> total", data.size);
    }
    f.remove();
  };
  await Promise.all([worker(), worker(), worker()]); // three frames at a time
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...data.values()])], { type: "application/json" }));
  a.download = "ramez.json"; a.click();
  console.log("done:", data.size, "products");
})();
