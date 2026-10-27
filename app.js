(() => {
  const { STORES } = window;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toFixed(3) + " BD";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const meta = window.CATALOG_META || {};
  const PAGE = 48;
  const SITE = { lulu: "https://gcc.luluhypermarket.com", carrefour: "https://www.hypermax.com.bh", jazira: "https://www.aljazirasupermarkets.com",
    megamart: "https://megamart.bh", ramez: "https://ramezshopping.com" };
  const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 }; // position of each shop in a catalog row
  const store = Object.fromEntries(STORES.map((s) => [s.id, s]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // Catalog (catalog.js): Row = [id, name, size, category, image, lulu, hypermax, jazira, megamart, ramez]; store = [price, was, path]
  const ALL = (window.CATALOG || []).map((r) => {
    const prices = {}, was = {}, links = {};
    let min = Infinity, max = 0, n = 0, disc = 0, discBD = 0, cheapest = null;
    for (const id in SLOT) {
      const c = r[SLOT[id]];
      if (!c) continue;
      prices[id] = c[0]; links[id] = SITE[id] + c[2]; n++;
      if (c[0] < min) { min = c[0]; cheapest = id; }
      if (c[0] > max) max = c[0];
      if (c[1] && c[1] > c[0]) { was[id] = c[1]; const d = (c[1] - c[0]) / c[1]; if (d > disc) { disc = d; discBD = c[1] - c[0]; } }
    }
    const spread = n > 1 ? max - min : 0;
    return { id: r[0], name: r[1], size: r[2] || "", category: r[3], image: r[4], prices, was, links, n, min, max, cheapest, spread,
      spreadPct: n > 1 && max > 0 ? spread / max : 0, suspect: n > 1 && min > 0 && max / min > 3, disc, discBD, _q: (r[1] + " " + (r[2] || "")).toLowerCase() };
  });
  const byId = Object.fromEntries(ALL.map((p) => [p.id, p]));
  const ACTIVE = STORES.filter((s) => ALL.some((p) => p.prices[s.id] != null));

  /* ---------- header facts ---------- */
  $("notice").innerHTML = (meta.updated ? `Prices updated <strong>${esc(new Date(meta.updated).toLocaleString())}</strong>. ` : "") +
    `Prices are read from each shop's own website; a shop is left out of a product when it does not list it. ` +
    `Always check the shop's page (tap a price) before you go.`;
  const counts = Object.fromEntries(ACTIVE.map((s) => [s.id, ALL.filter((p) => p.prices[s.id] != null).length]));
  const multi = ALL.filter((p) => p.n > 1).length;
  $("stats").innerHTML = `<div class="stat"><b>${ALL.length.toLocaleString()}</b><span>products</span></div>` +
    `<div class="stat"><b>${multi.toLocaleString()}</b><span>in 2+ shops</span></div>` +
    ACTIVE.map((s) => `<div class="stat"><b>${counts[s.id].toLocaleString()}</b><span><i style="background:${s.color}"></i>${esc(s.short)}</span></div>`).join("");

  /* ---------- state ---------- */
  const F = { q: "", cat: "All", sort: "rel", stores: new Set(), multi: false, sale: false, fav: false, pmin: null, pmax: null };
  let cart = ls.get("cart", {});
  for (const id of Object.keys(cart)) if (!byId[id]) delete cart[id]; // product no longer in the catalog
  let favs = new Set(ls.get("favs", []).filter((id) => byId[id]));
  let cartStores = new Set(ls.get("cartStores", ACTIVE.map((s) => s.id)).filter((id) => ACTIVE.some((s) => s.id === id)));
  if (!cartStores.size) cartStores = new Set(ACTIVE.map((s) => s.id));
  const saveCart = () => { ls.set("cart", cart); };

  const cats = ["All", ...[...new Set(ALL.map((p) => p.category))].sort()];
  $("category").innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join("");
  $("store-chips").innerHTML = `<span class="found" style="margin:0">Sold at:</span>` + ACTIVE.map((s) =>
    `<button type="button" class="sc" data-store="${s.id}" aria-pressed="false"><i style="background:${s.color}"></i>${esc(s.short)}</button>`).join("");

  /* ---------- URL hash <-> filters ---------- */
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    F.q = h.get("q") || ""; F.cat = cats.includes(h.get("cat")) ? h.get("cat") : "All";
    F.sort = ["rel", "save", "savepct", "disc", "low", "high", "az"].includes(h.get("sort")) ? h.get("sort") : "rel";
    F.multi = h.get("multi") === "1"; F.sale = h.get("sale") === "1";
    F.stores = new Set((h.get("at") || "").split(",").filter((x) => ACTIVE.some((s) => s.id === x)));
    F.pmin = h.get("min") ? +h.get("min") : null; F.pmax = h.get("max") ? +h.get("max") : null;
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (F.q) h.set("q", F.q); if (F.cat !== "All") h.set("cat", F.cat); if (F.sort !== "rel") h.set("sort", F.sort);
    if (F.multi) h.set("multi", "1"); if (F.sale) h.set("sale", "1"); if (F.stores.size) h.set("at", [...F.stores].join(","));
    if (F.pmin != null) h.set("min", F.pmin); if (F.pmax != null) h.set("max", F.pmax);
    const s = h.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }
  function syncControls() {
    $("search").value = F.q; $("category").value = F.cat; $("sort").value = F.sort;
    $("f-multi").checked = F.multi; $("f-sale").checked = F.sale; $("f-fav").checked = F.fav;
    $("pmin").value = F.pmin ?? ""; $("pmax").value = F.pmax ?? "";
    $("clear-search").hidden = !F.q;
    document.querySelectorAll(".sc").forEach((b) => b.setAttribute("aria-pressed", F.stores.has(b.dataset.store)));
    $("fav-count").textContent = favs.size ? `(${favs.size})` : "";
  }

  /* ---------- product list ---------- */
  const SORTS = {
    save: (a, b) => b.spread - a.spread || b.n - a.n,
    savepct: (a, b) => b.spreadPct - a.spreadPct || b.spread - a.spread,
    disc: (a, b) => b.disc - a.disc || b.discBD - a.discBD,
    low: (a, b) => a.min - b.min,
    high: (a, b) => b.min - a.min,
    az: (a, b) => a.name.localeCompare(b.name),
  };
  let filtered = [], shown = PAGE;
  function applyFilters() {
    const words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = ALL.filter((p) => {
      if (F.cat !== "All" && p.category !== F.cat) return false;
      if (F.multi && p.n < 2) return false;
      if (F.sale && !p.disc) return false;
      if (F.fav && !favs.has(p.id)) return false;
      for (const s of F.stores) if (p.prices[s] == null) return false;
      if (F.pmin != null && p.min < F.pmin) return false;
      if (F.pmax != null && p.min > F.pmax) return false;
      for (const w of words) if (!p._q.includes(w)) return false;
      return true;
    });
    if (F.sort !== "rel") {
      if (F.sort === "save" || F.sort === "savepct") list = list.filter((p) => p.n > 1 && !p.suspect);
      if (F.sort === "disc") list = list.filter((p) => p.disc > 0);
      list = list.sort(SORTS[F.sort]);
    } else if (words.length) {
      const q = words.join(" ");
      const rank = (p) => (p._q.startsWith(q) ? 0 : p._q.includes(" " + words[0]) ? 1 : 2) * 10 - Math.min(p.n, 5);
      list = list.map((p) => [rank(p), p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    }
    filtered = list; shown = PAGE;
  }

  const pic = (p) => p.image
    ? `<img class="pic" loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(p.image)}">`
    : `<div class="pic none" aria-hidden="true">🛒</div>`;

  function card(p) {
    const ids = ACTIVE.map((s) => s.id).filter((id) => p.prices[id] != null).sort((a, b) => p.prices[a] - p.prices[b]);
    const rows = ids.map((id) => {
      const s = store[id], v = p.prices[id], best = p.n > 1 && v === p.min;
      return `<a class="pl ${best ? "best" : ""}" href="${esc(p.links[id])}" target="_blank" rel="noopener" title="Open at ${esc(s.name)}">` +
        `<i style="background:${s.color}"></i><span class="nm">${esc(s.short)}</span>` +
        `<span class="pr">${p.was[id] ? `<s>${p.was[id].toFixed(3)}</s>` : ""}${v.toFixed(3)}</span></a>`;
    }).join("");
    const badges = (p.suspect ? `<span class="badge sale" title="Shops disagree by more than 3×: the shops may list different sizes or one price may be wrong. Open the shop page to check.">⚠ check prices</span>` : "") +
      (p.n > 1 && !p.suspect && p.spread >= 0.005 ? `<span class="badge">Save ${p.spread.toFixed(3)} BD (${Math.round(p.spreadPct * 100)}%)</span>` : "") +
      (p.disc >= 0.01 ? `<span class="badge sale">−${Math.round(p.disc * 100)}% off</span>` : "") +
      (p.n === 1 ? `<span class="hint" style="font-size:.72rem;color:var(--muted)">only at ${esc(store[ids[0]].short)}</span>` : "");
    const q = cart[p.id] || 0;
    const act = q
      ? `<span class="stepper"><button data-dec="${esc(p.id)}" aria-label="Remove one">−</button><b>${q}</b><button data-inc="${esc(p.id)}" aria-label="Add one">+</button></span>`
      : `<button class="add" data-inc="${esc(p.id)}">+ Add to cart</button>`;
    return `<article class="card" data-card="${esc(p.id)}"><button class="fav" data-fav="${esc(p.id)}" aria-pressed="${favs.has(p.id)}" aria-label="Favourite" title="Favourite">${favs.has(p.id) ? "♥" : "♡"}</button>` +
      `<div class="head">${pic(p)}<div><h3>${esc(p.name)}</h3><small>${esc(p.size)}</small><div class="badges">${badges}</div></div></div>` +
      `<div class="plist">${rows}</div><div class="foot"><span class="hint">${p.n > 1 ? `Cheapest: ${esc(store[p.cheapest].short)}` : ""}</span>${act}</div></article>`;
  }

  function renderProducts(append) {
    const list = filtered.slice(append ? shown - PAGE : 0, shown);
    const html = list.map(card).join("");
    if (append) $("products").insertAdjacentHTML("beforeend", html);
    else $("products").innerHTML = html || `<p class="empty" style="grid-column:1/-1">No products match. Try fewer words or press Reset.</p>`;
    $("found").textContent = `${filtered.length.toLocaleString()} product${filtered.length === 1 ? "" : "s"}` +
      (F.sort === "save" || F.sort === "savepct" ? " sold in 2+ shops (suspicious price gaps left out)" : "");
    $("sentinel").innerHTML = filtered.length > shown ? `<button class="more" data-more>Show more (${(filtered.length - shown).toLocaleString()} left)</button>` : "";
  }
  function refresh() { applyFilters(); syncControls(); writeHash(); renderProducts(); }

  // Refresh one card in place (keeps the scroll position while adding to the cart).
  function updateCard(id) {
    const el = document.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (el) el.outerHTML = card(byId[id]);
  }

  /* ---------- cart ---------- */
  function totalsFor(ids) {
    const act = ACTIVE.filter((s) => cartStores.has(s.id));
    const totals = act.map((s) => {
      let total = 0; const missing = [];
      for (const id of ids) { const v = byId[id].prices[s.id]; if (v == null) missing.push(byId[id].name); else total += v * cart[id]; }
      return { store: s, total, missing };
    });
    const complete = totals.filter((t) => !t.missing.length).sort((a, b) => a.total - b.total);
    const ranked = [...totals].sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
    let splitTotal = 0; const byStore = {}; const unpriced = [];
    for (const id of ids) {
      const p = byId[id];
      const s = act.filter((s) => p.prices[s.id] != null).sort((a, b) => p.prices[a.id] - p.prices[b.id])[0];
      if (!s) { unpriced.push(p.name); continue; }
      splitTotal += p.prices[s.id] * cart[id];
      (byStore[s.name] ||= []).push(`${cart[id]}× ${p.name}`);
    }
    return { totals, complete, ranked, splitTotal, byStore, unpriced };
  }

  function renderCart() {
    const ids = Object.keys(cart).filter((id) => cart[id] > 0);
    const n = ids.reduce((a, id) => a + cart[id], 0);
    $("count").textContent = ids.length ? `(${n})` : "";
    $("count-badge").textContent = n;
    if (!ids.length) {
      $("cart-items").innerHTML = `<p class="empty">Your cart is empty.<br>Add products to see which shop is cheapest for your basket.</p>`;
      $("results").innerHTML = ""; return;
    }
    $("cart-items").innerHTML = ids.map((id) => {
      const p = byId[id];
      return `<div class="crow">${pic(p)}<span class="nm">${esc(p.name)}<br><small>${esc(p.size)}${p.n > 1 ? ` · cheapest ${p.min.toFixed(3)} @ ${esc(store[p.cheapest].short)}` : ""}</small></span>` +
        `<span class="stepper"><button data-dec="${esc(id)}" aria-label="Remove one">−</button><b>${cart[id]}</b><button data-inc="${esc(id)}" aria-label="Add one">+</button></span>` +
        `<button class="rm" data-rm="${esc(id)}" aria-label="Remove">✕</button></div>`;
    }).join("");

    const r = totalsFor(ids);
    let html = `<div class="sel">Compare these shops:</div><div class="chips" style="margin-top:0">` + ACTIVE.map((s) =>
      `<button type="button" class="sc" data-cs="${s.id}" aria-pressed="${cartStores.has(s.id)}"><i style="background:${s.color}"></i>${esc(s.short)}</button>`).join("") + `</div>`;
    if (r.complete.length) {
      const w = r.complete[0], worst = r.complete[r.complete.length - 1];
      html += `<div class="winner">✅ Cheapest single shop<br><b>${esc(w.store.name)}</b> — ${fmt(w.total)}` +
        (worst !== w ? `<br><small>Saves ${fmt(worst.total - w.total)} vs ${esc(worst.store.name)}</small>` : "") + `</div>`;
    } else {
      html += `<div class="winner no">No single shop stocks everything in your cart.</div>`;
    }
    if (Object.keys(r.byStore).length > 1 && r.splitTotal < (r.complete[0]?.total ?? Infinity) - 0.0005) {
      const saving = r.complete.length ? ` — saves ${fmt(r.complete[0].total - r.splitTotal)} more` : "";
      html += `<div class="split"><b>💡 Best split basket: ${fmt(r.splitTotal)}</b>${saving}<ul>` +
        Object.entries(r.byStore).map(([s, items]) => `<li><b>${esc(s)}:</b> ${items.map(esc).join(", ")}</li>`).join("") + `</ul></div>`;
    }
    if (r.unpriced.length) html += `<p class="warn">No selected shop has a price for: ${r.unpriced.map(esc).join(", ")}</p>`;
    html += `<table><tr><th>Shop</th><th>Total</th></tr>` + r.ranked.map((t, i) =>
      `<tr class="${!t.missing.length && t === r.ranked[0] ? "top" : ""}"><td>${esc(t.store.name)}${t.missing.length ? `<div class="warn">missing ${t.missing.length} item(s)</div>` : ""}</td>` +
      `<td>${fmt(t.total)}</td></tr>`).join("") + `</table>` +
      `<div class="tools"><button data-copy>📋 Copy list</button><button data-wa>💬 WhatsApp</button><button data-print>🖨 Print</button><button data-clear>🗑 Clear</button></div>`;
    $("results").innerHTML = html;
  }

  function cartText() {
    const ids = Object.keys(cart).filter((id) => cart[id] > 0);
    const r = totalsFor(ids);
    let t = "🛒 My shopping list\n";
    for (const id of ids) t += `• ${cart[id]}× ${byId[id].name}${byId[id].size ? " (" + byId[id].size + ")" : ""}\n`;
    if (r.complete.length) t += `\nCheapest single shop: ${r.complete[0].store.name} — ${fmt(r.complete[0].total)}`;
    if (Object.keys(r.byStore).length > 1) {
      t += `\nBest split: ${fmt(r.splitTotal)}\n` + Object.entries(r.byStore).map(([s, it]) => `${s}: ${it.join(", ")}`).join("\n");
    }
    return t;
  }

  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800); }
  const setCart = (open) => { document.body.classList.toggle("cart-open", open); $("scrim").hidden = !open; };

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a"); if (!t) return;
    const d = t.dataset;
    if ("more" in d) { shown += PAGE; renderProducts(true); return; }
    if (d.inc != null || d.dec != null || d.rm != null) {
      const id = d.inc ?? d.dec ?? d.rm;
      if (d.inc != null) cart[id] = (cart[id] || 0) + 1;
      else if (d.dec != null) { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
      else delete cart[id];
      saveCart(); renderCart(); updateCard(id); return;
    }
    if (d.fav != null) {
      favs.has(d.fav) ? favs.delete(d.fav) : favs.add(d.fav); ls.set("favs", [...favs]);
      $("fav-count").textContent = favs.size ? `(${favs.size})` : "";
      if (F.fav) refresh(); else updateCard(d.fav); return;
    }
    if (d.store) { F.stores.has(d.store) ? F.stores.delete(d.store) : F.stores.add(d.store); refresh(); return; }
    if (d.cs) { cartStores.has(d.cs) ? cartStores.delete(d.cs) : cartStores.add(d.cs); if (!cartStores.size) cartStores.add(d.cs); ls.set("cartStores", [...cartStores]); renderCart(); return; }
    if ("clear" in d) { const old = Object.keys(cart); cart = {}; saveCart(); renderCart(); old.forEach(updateCard); return; }
    if ("copy" in d) { (navigator.clipboard ? navigator.clipboard.writeText(cartText()) : Promise.reject()).then(() => toast("List copied"), () => toast("Copy not allowed here")); return; }
    if ("wa" in d) { window.open("https://wa.me/?text=" + encodeURIComponent(cartText()), "_blank", "noopener"); return; }
    if ("print" in d) { window.print(); return; }
    if (t.id === "open-cart") setCart(true);
    if (t.id === "close-cart") setCart(false);
    if (t.id === "theme") {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; ls.set("theme", next);
    }
    if (t.id === "clear-search") { F.q = ""; refresh(); $("search").focus(); }
    if (t.id === "reset") { Object.assign(F, { q: "", cat: "All", sort: "rel", stores: new Set(), multi: false, sale: false, fav: false, pmin: null, pmax: null }); refresh(); }
  });
  $("scrim").addEventListener("click", () => setCart(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setCart(false);
    if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("search").focus(); }
  });
  // A picture that fails to load (broken or blocked link) falls back to the placeholder.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && t.classList.contains("pic")) {
      const d = document.createElement("div"); d.className = "pic none"; d.textContent = "🛒"; t.replaceWith(d);
    }
  }, true);
  let timer;
  $("search").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { F.q = e.target.value.trim(); refresh(); }, 160); });
  $("category").addEventListener("change", (e) => { F.cat = e.target.value; refresh(); });
  $("sort").addEventListener("change", (e) => { F.sort = e.target.value; refresh(); });
  $("f-multi").addEventListener("change", (e) => { F.multi = e.target.checked; refresh(); });
  $("f-sale").addEventListener("change", (e) => { F.sale = e.target.checked; refresh(); });
  $("f-fav").addEventListener("change", (e) => { F.fav = e.target.checked; refresh(); });
  const num = (v) => (v === "" || isNaN(+v) ? null : +v);
  $("pmin").addEventListener("change", (e) => { F.pmin = num(e.target.value); refresh(); });
  $("pmax").addEventListener("change", (e) => { F.pmax = num(e.target.value); refresh(); });
  // Endless scrolling
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en) => { if (en[0].isIntersecting && filtered.length > shown) { shown += PAGE; renderProducts(true); } }, { rootMargin: "600px" }).observe($("sentinel"));
  }
  window.addEventListener("hashchange", () => { readHash(); refresh(); });

  const theme = ls.get("theme", null); if (theme) document.documentElement.dataset.theme = theme;
  readHash(); refresh(); renderCart();
})();
