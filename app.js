(() => {
  const { STORES } = window;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bd = (n) => n.toFixed(3);
  const fmt = (n) => n.toFixed(3) + " BD";
  const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const meta = window.CATALOG_META || {};
  const PAGE = 48;
  const SITE = { lulu: "https://gcc.luluhypermarket.com", carrefour: "https://www.hypermax.com.bh", jazira: "https://www.aljazirasupermarkets.com",
    megamart: "https://megamart.bh", ramez: "https://ramezshopping.com" };
  const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 }; // position of each shop in a catalog row
  const store = Object.fromEntries(STORES.map((s) => [s.id, s]));
  const initials = (s) => s.short.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const slogo = (id, cls = "") => `<span class="slogo ${cls}" style="background:${store[id].color}" aria-hidden="true">${esc(initials(store[id]))}</span>`;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // Catalog (catalog.js): Row = [id, name, size, category, image, lulu, hypermax, jazira, megamart, ramez, sub]; store = [price, was, path]
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
    return { id: r[0], name: r[1], size: r[2] || "", category: r[3], sub: r[10] || "", image: r[4], prices, was, links, n, min, max, cheapest, spread,
      spreadPct: n > 1 && max > 0 ? spread / max : 0, suspect: n > 1 && min > 0 && max / min > 3, disc, discBD };
  });
  const byId = Object.fromEntries(ALL.map((p) => [p.id, p]));
  Search.build(ALL); // search engine (search.js): ALL[i] is document i
  const ACTIVE = STORES.filter((s) => ALL.some((p) => p.prices[s.id] != null));
  const counts = Object.fromEntries(ACTIVE.map((s) => [s.id, ALL.filter((p) => p.prices[s.id] != null).length]));
  const multiCount = ALL.filter((p) => p.n > 1).length;

  /* ---------- categories ---------- */
  const CAT_ORDER = ["Fruit & Vegetables", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Snacks & Sweets", "Beverages", "Baby",
    "Personal Care", "Household", "Health & Wellness", "Pets", "Home & Kitchen", "Electronics", "Toys & Stationery", "Fashion & Luggage", "Other"];
  const CAT_ICON = { "Fruit & Vegetables": "🥬", "Meat & Seafood": "🥩", "Dairy & Eggs": "🥛", Bakery: "🥖", Frozen: "🧊", Pantry: "🥫", "Snacks & Sweets": "🍫",
    Beverages: "🥤", Baby: "🍼", "Personal Care": "🧴", Household: "🧽", "Health & Wellness": "💊", Pets: "🐾", "Home & Kitchen": "🍳", Electronics: "🔌",
    "Toys & Stationery": "🧸", "Fashion & Luggage": "👜", Other: "📦" };
  const CAT_TINT = { "Fruit & Vegetables": "#e3f6e4", "Meat & Seafood": "#fde4e4", "Dairy & Eggs": "#e6f0fd", Bakery: "#fbefdc", Frozen: "#e0f4fb", Pantry: "#fdf1d6",
    "Snacks & Sweets": "#f6e6dc", Beverages: "#e4f3ef", Baby: "#fde8f1", "Personal Care": "#eee7fb", Household: "#e5f1f8", "Health & Wellness": "#fbe5e9", Pets: "#f1ece3",
    "Home & Kitchen": "#f3ede6", Electronics: "#e8eaf1", "Toys & Stationery": "#fdf3d9", "Fashion & Luggage": "#f5e8ef", Other: "#eef0f3" };
  const present = new Set(ALL.map((p) => p.category));
  const cats = ["All", ...CAT_ORDER.filter((c) => present.has(c)), ...[...present].filter((c) => !CAT_ORDER.includes(c)).sort()];
  const catTotal = {}; for (const p of ALL) catTotal[p.category] = (catTotal[p.category] || 0) + 1;
  const SUBS = {};
  for (const p of ALL) if (p.sub) (SUBS[p.category] = SUBS[p.category] || new Set()).add(p.sub);

  /* ---------- state ---------- */
  const blank = () => ({ q: "", cat: "All", sub: "", sort: "rel", stores: new Set(), multi: false, sale: false, fav: false, pmin: null, pmax: null, all: false });
  const F = blank();
  let openProduct = null;
  let cart = ls.get("cart", {});
  for (const id of Object.keys(cart)) if (!byId[id]) delete cart[id]; // product no longer in the catalog
  let favs = new Set(ls.get("favs", []).filter((id) => byId[id]));
  let cartStores = new Set(ls.get("cartStores", ACTIVE.map((s) => s.id)).filter((id) => ACTIVE.some((s) => s.id === id)));
  if (!cartStores.size) cartStores = new Set(ACTIVE.map((s) => s.id));
  const saveCart = () => ls.set("cart", cart);
  const isHome = () => !F.all && F.cat === "All" && !F.q.trim() && !F.multi && !F.sale && !F.fav && !F.stores.size && F.pmin == null && F.pmax == null && F.sort === "rel";

  /* ---------- URL hash <-> state ---------- */
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    Object.assign(F, blank());
    F.q = h.get("q") || ""; F.cat = cats.includes(h.get("cat")) ? h.get("cat") : "All";
    F.sub = F.cat !== "All" && SUBS[F.cat] && SUBS[F.cat].has(h.get("sub")) ? h.get("sub") : "";
    F.sort = ["rel", "hx", "save", "savepct", "disc", "low", "high", "az"].includes(h.get("sort")) ? h.get("sort") : "rel";
    F.multi = h.get("multi") === "1"; F.sale = h.get("sale") === "1"; F.fav = h.get("fav") === "1"; F.all = h.get("all") === "1";
    F.stores = new Set((h.get("at") || "").split(",").filter((x) => ACTIVE.some((s) => s.id === x)));
    F.pmin = h.get("min") ? +h.get("min") : null; F.pmax = h.get("max") ? +h.get("max") : null;
    openProduct = byId[h.get("p")] ? h.get("p") : null;
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (F.q) h.set("q", F.q); if (F.cat !== "All") h.set("cat", F.cat); if (F.sub) h.set("sub", F.sub); if (F.sort !== "rel") h.set("sort", F.sort);
    if (F.multi) h.set("multi", "1"); if (F.sale) h.set("sale", "1"); if (F.fav) h.set("fav", "1"); if (F.stores.size) h.set("at", [...F.stores].join(","));
    if (F.pmin != null) h.set("min", F.pmin); if (F.pmax != null) h.set("max", F.pmax);
    if (F.all && isHomeish()) h.set("all", "1");
    if (openProduct) h.set("p", openProduct);
    const s = h.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }
  const isHomeish = () => F.cat === "All" && !F.q.trim() && !F.multi && !F.sale && !F.fav && !F.stores.size && F.pmin == null && F.pmax == null && F.sort === "rel";

  /* ---------- filtering ---------- */
  const SORTS = {
    save: (a, b) => b.spread - a.spread || b.n - a.n,
    savepct: (a, b) => b.spreadPct - a.spreadPct || b.spread - a.spread,
    disc: (a, b) => b.disc - a.disc || b.discBD - a.discBD,
    low: (a, b) => a.min - b.min,
    high: (a, b) => b.min - a.min,
    az: (a, b) => a.name.localeCompare(b.name),
  };
  let filtered = [], shown = PAGE;
  let lastRes = null, catCount = {}, subCount = {};
  function applyFilters() {
    Search.setProfile(F.sort === "hx" ? "hx" : "");
    lastRes = F.q.trim() ? Search.search(F.q) : null;
    const iv = lastRes && lastRes.intent;   // "milk under 1", "rice at ramez": price and shop words typed in the search box
    const pass = (p) => {
      if (iv) {
        if (iv.max != null && p.min > iv.max + 1e-9) return false;
        if (iv.min != null && p.min < iv.min - 1e-9) return false;
        for (const s of iv.stores) if (p.prices[s] == null) return false;
      }
      if (F.multi && p.n < 2) return false;
      if (F.sale && !p.disc) return false;
      if (F.fav && !favs.has(p.id)) return false;
      for (const s of F.stores) if (p.prices[s] == null) return false;
      if (F.pmin != null && p.min < F.pmin) return false;
      if (F.pmax != null && p.min > F.pmax) return false;
      return true;
    };
    let base = [];
    if (lastRes) { for (const i of lastRes.ids) if (pass(ALL[i])) base.push(ALL[i]); } // already in best-match order
    else base = ALL.filter(pass);
    catCount = {}; subCount = {};
    for (const p of base) {
      catCount[p.category] = (catCount[p.category] || 0) + 1;
      if (p.category === F.cat) subCount[p.sub] = (subCount[p.sub] || 0) + 1;
    }
    let list = F.cat === "All" ? base : base.filter((p) => p.category === F.cat && (!F.sub || p.sub === F.sub));
    if (F.sort !== "rel" && F.sort !== "hx") {
      if (F.sort === "save" || F.sort === "savepct") list = list.filter((p) => p.n > 1 && !p.suspect);
      if (F.sort === "disc") list = list.filter((p) => p.disc > 0);
      list = list.sort(SORTS[F.sort]);
    }
    filtered = list; shown = PAGE;
  }
  const hl = (name) => (lastRes ? Search.highlight(name, lastRes.terms, esc) : esc(name));

  /* ---------- product card ---------- */
  const img = (p, cls) => p.image
    ? `<img class="${cls || ""}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="${esc(p.image)}">`
    : `<div class="noimg ${cls || ""}" aria-hidden="true">${CAT_ICON[p.category] || "🛒"}</div>`;
  const shopsOf = (p) => ACTIVE.map((s) => s.id).filter((id) => p.prices[id] != null).sort((a, b) => p.prices[a] - p.prices[b]);
  function actionHTML(p, big) {
    const q = cart[p.id] || 0;
    return q
      ? `<div class="stepper"><button type="button" data-dec="${esc(p.id)}" aria-label="Remove one">−</button><b>${q} in basket</b><button type="button" data-inc="${esc(p.id)}" aria-label="Add one">+</button></div>`
      : `<button type="button" class="add" data-inc="${esc(p.id)}">${icon("cart")}${big ? "Add to basket" : "Add"}</button>`;
  }
  function card(p, plain) {
    const ids = shopsOf(p);
    const tags = (p.suspect ? `<span class="tag warn" title="Shops disagree by more than 3×: they may list different sizes. Open the product to check.">Check sizes</span>` : "") +
      (p.n > 1 && !p.suspect && p.spread >= 0.005 && p.spreadPct >= 0.02 ? `<span class="tag save">Save ${Math.round(p.spreadPct * 100)}%</span>` : "") +
      (p.disc >= 0.01 ? `<span class="tag sale">−${Math.round(p.disc * 100)}% off</span>` : "");
    const wasBest = p.was[p.cheapest];
    const chips = ids.map((id) => `<a class="sp${p.n > 1 && p.prices[id] === p.min ? " best" : ""}" href="${esc(p.links[id])}" target="_blank" rel="noopener" title="${esc(store[id].name)}: ${bd(p.prices[id])} BD, open the shop page">${slogo(id, "xs")}${bd(p.prices[id])}</a>`).join("");
    return `<article class="card" data-card="${esc(p.id)}">` +
      `<div class="tags">${tags}</div><button type="button" class="heart" data-fav="${esc(p.id)}" aria-pressed="${favs.has(p.id)}" aria-label="Save to favourites">${icon(favs.has(p.id) ? "heart-fill" : "heart")}</button>` +
      `<button type="button" class="media" data-open="${esc(p.id)}" aria-label="Details: ${esc(p.name)}">${img(p)}</button>` +
      `<div class="body"><h3 data-open="${esc(p.id)}">${plain ? esc(p.name) : hl(p.name)}</h3><div class="size">${esc(p.size)}</div>` +
      `<div class="priceline"><span class="price">${bd(p.min)}<small>BD</small></span>${wasBest ? `<span class="was">${bd(wasBest)}</span>` : ""}</div>` +
      `<div class="where">${p.n > 1 ? `Cheapest at ${slogo(p.cheapest, "xs")}<b>${esc(store[p.cheapest].short)}</b>` : `<span class="only">Only at ${esc(store[ids[0]].short)}</span>`}</div>` +
      (p.n > 1 ? `<div class="shops">${chips}</div>` : "") +
      `<div class="act">${actionHTML(p)}</div></div></article>`;
  }
  // Refresh every copy of a card in place (home rows and the grid can both show it).
  function updateCard(id) {
    document.querySelectorAll(`[data-card="${CSS.escape(id)}"]`).forEach((el) => { el.outerHTML = card(byId[id], !!el.closest("#home")); });
    if (openProduct === id) renderProductActions();
  }

  /* ---------- home ---------- */
  function dedupe(list, n) {
    const out = [], seen = new Set();
    for (const p of list) {
      const k = p.name.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
      if (seen.has(k)) continue; seen.add(k); out.push(p);
      if (out.length >= n) break;
    }
    return out;
  }
  const GROCERY = new Set(["Fruit & Vegetables", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Snacks & Sweets", "Beverages", "Baby", "Personal Care", "Household"]);
  const HOME = {
    savings: dedupe(ALL.filter((p) => GROCERY.has(p.category) && p.n > 1 && !p.suspect && p.image && p.spread >= 0.1 && p.min >= 0.2 && p.max <= 30 && p.spreadPct <= 0.45)
      .sort((a, b) => b.spread * (0.5 + b.spreadPct) - a.spread * (0.5 + a.spreadPct)), 18),
    deals: dedupe(ALL.filter((p) => GROCERY.has(p.category) && !p.suspect && p.disc >= 0.12 && p.disc <= 0.6 && p.image && p.min >= 0.2).sort((a, b) => b.n - a.n || b.disc - a.disc), 18),
    staples: (() => {
      const out = [], used = new Set();
      for (const q of ["fresh milk", "white bread", "eggs 30", "basmati rice 5kg", "drinking water 12", "whole chicken", "sugar 2kg", "sunflower oil 1.5", "tea bags",
        "banana", "tomato", "laban", "cheddar cheese", "butter", "tissue", "dishwash"]) {
        const r = Search.search(q, { asYouType: false });
        const pick = r.ids.map((i) => ALL[i]).find((p) => p.n >= 2 && p.image && !p.suspect && !used.has(p.id));
        if (pick) { used.add(pick.id); out.push(pick); }
      }
      return out;
    })(),
  };
  function row(id, title, sub, list, see) {
    if (!list.length) return "";
    return `<div class="sect-h"><div><h2>${title}</h2><p>${sub}</p></div>${see ? `<button type="button" class="see" data-see="${see}">See all${icon("chev")}</button>` : ""}</div>` +
      `<div class="carousel"><button type="button" class="car-btn prev" data-car="-1" aria-label="Scroll left" disabled>${icon("chev")}</button>` +
      `<div class="track" id="track-${id}">${list.map((p) => card(p, true)).join("")}</div>` +
      `<button type="button" class="car-btn next" data-car="1" aria-label="Scroll right">${icon("chev")}</button></div>`;
  }
  function renderHome() {
    $("hero-shops").innerHTML = ACTIVE.map((s) => `<button type="button" class="hs" data-shop="${s.id}">${slogo(s.id)}<div><b>${esc(s.short)}</b><small>${counts[s.id].toLocaleString()} products</small></div></button>`).join("") +
      `<div class="hs total"><div><b>${ALL.length.toLocaleString()}</b><small>products</small></div><div><b>${multiCount.toLocaleString()}</b><small>in 2+ shops</small></div></div>`;
    $("cat-tiles").innerHTML = cats.slice(1).filter((c) => catTotal[c]).map((c) =>
      `<button type="button" class="ct" data-cat="${esc(c)}"><span class="cti" style="background:${CAT_TINT[c] || "#eef0f3"}">${CAT_ICON[c] || "📦"}</span><b>${esc(c)}</b><small>${catTotal[c].toLocaleString()}</small></button>`).join("");
    $("row-savings").innerHTML = row("savings", "Biggest savings today", "Same product, very different prices. Buy it where it costs least.", HOME.savings, "save");
    $("row-staples").innerHTML = row("staples", "Everyday essentials", "The basics, compared across every shop.", HOME.staples, "");
    $("row-deals").innerHTML = row("deals", "Top discounts", "Products the shops have marked down right now.", HOME.deals, "disc");
    document.querySelectorAll("#home .track").forEach(updateArrows);
  }
  function updateArrows(track) {
    const c = track.parentElement;
    const prev = c.querySelector(".prev"), next = c.querySelector(".next");
    if (prev) prev.disabled = track.scrollLeft < 8;
    if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
  }
  document.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("track")) updateArrows(e.target); }, true);

  /* ---------- listing ---------- */
  function renderCats() {
    const home = isHome();
    const total = home ? ALL.length : Object.values(catCount).reduce((a, b) => a + b, 0);
    const chip = (key, label, n, on, ic) => `<button type="button" class="cc${on ? " on" : ""}" data-cat="${esc(key)}"${n === 0 ? " disabled" : ""}>` +
      `<span class="ci">${ic}</span>${esc(label)}${home ? "" : `<em>${n.toLocaleString()}</em>`}</button>`;
    $("catrail").innerHTML = chip("All", "All", total, F.cat === "All" && !home, "🛍️") +
      cats.slice(1).map((c) => chip(c, c, home ? catTotal[c] || 0 : catCount[c] || 0, F.cat === c, CAT_ICON[c] || "📦")).join("");
    const on = $("catrail").querySelector(".on");
    if (on && window.__catScroll) { on.scrollIntoView({ block: "nearest", inline: "center" }); window.__catScroll = false; }
  }
  function renderSubs() {
    const subs = F.cat !== "All" && SUBS[F.cat] ? [...SUBS[F.cat]].sort((a, b) => (/^other/i.test(a) - /^other/i.test(b)) || (subCount[b] || 0) - (subCount[a] || 0)) : [];
    $("subrail").hidden = !subs.length;
    $("subrail").innerHTML = subs.length ? `<button type="button" class="sc2${F.sub ? "" : " on"}" data-sub="">All<em>${(catCount[F.cat] || 0).toLocaleString()}</em></button>` +
      subs.map((x) => `<button type="button" class="sc2${F.sub === x ? " on" : ""}" data-sub="${esc(x)}"${(subCount[x] || 0) === 0 ? " disabled" : ""}>${esc(x)}<em>${(subCount[x] || 0).toLocaleString()}</em></button>`).join("") : "";
  }
  function renderHead() {
    const iv = lastRes && lastRes.intent;
    $("res-title").textContent = F.q ? `“${F.q}”` : F.fav ? "My favourites" : F.sub ? F.sub : F.cat !== "All" ? F.cat :
      F.sort === "save" || F.sort === "savepct" ? "Biggest savings" : F.sort === "disc" ? "Top discounts" : "All products";
    const crumbs = [`<button type="button" data-home>Home</button>`];
    if (F.cat !== "All") crumbs.push(`<span>/</span><button type="button" data-cat="${esc(F.cat)}">${esc(F.cat)}</button>`);
    if (F.sub) crumbs.push(`<span>/</span><b>${esc(F.sub)}</b>`);
    if (F.q) crumbs.push(`<span>/</span><b>Search</b>`);
    $("crumbs").innerHTML = crumbs.join(" ");
    const bits = [`<b>${filtered.length.toLocaleString()}</b> product${filtered.length === 1 ? "" : "s"}`];
    if (F.sort === "save" || F.sort === "savepct") bits.push("sold in 2+ shops (suspicious price gaps left out)");
    if (iv) bits.push(`<b>${[iv.min != null && iv.max != null ? `${bd(iv.min)}–${bd(iv.max)} BD` : iv.max != null ? `under ${bd(iv.max)} BD` : iv.min != null ? `over ${bd(iv.min)} BD` : "",
      ...iv.stores.map((id) => "at " + store[id].short)].filter(Boolean).map(esc).join(" · ")}</b>`);
    if (lastRes && lastRes.corrected) bits.push(`showing results for <span class="fix">${esc(lastRes.corrected)}</span>`);
    if (lastRes && lastRes.partial && filtered.length) bits.push("best matches first, then close matches");
    $("found").innerHTML = bits.join(" · ");
    // active filter pills
    const af = [];
    for (const s of F.stores) af.push(`<button type="button" class="af" data-store="${s}">Sold at ${esc(store[s].short)}${icon("close")}</button>`);
    if (F.multi) af.push(`<button type="button" class="af" data-untog="multi">2+ shops${icon("close")}</button>`);
    if (F.sale) af.push(`<button type="button" class="af" data-untog="sale">On sale${icon("close")}</button>`);
    if (F.fav) af.push(`<button type="button" class="af" data-untog="fav">Favourites${icon("close")}</button>`);
    if (F.pmin != null || F.pmax != null) af.push(`<button type="button" class="af" data-untog="price">${F.pmin != null ? bd(F.pmin) : "0"} – ${F.pmax != null ? bd(F.pmax) : "any"} BD${icon("close")}</button>`);
    $("active-f").hidden = !af.length; $("active-f").innerHTML = af.join("");
    const nf = F.stores.size + F.multi + F.sale + F.fav + (F.pmin != null || F.pmax != null ? 1 : 0);
    $("filt-n").hidden = !nf; $("filt-n").textContent = nf;
  }
  function renderProducts(append) {
    const from = append ? shown - PAGE : 0;
    const list = filtered.slice(from, shown);
    let split = -1;
    const pr = lastRes && lastRes.primary;
    if (pr && F.sort === "rel" && F.cat === "All" && !F.sub) {
      let k = 0; while (k < filtered.length && filtered[k].category === pr.cat && (filtered[k].sub || "") === pr.sub) k++;
      if (k >= 3 && k < filtered.length) split = k;
    }
    const html = list.map((p, j) => (from + j === split ? `<h2 class="divider">Other choices</h2>` : "") + card(p)).join("");
    if (append) $("products").insertAdjacentHTML("beforeend", html);
    else $("products").innerHTML = html || emptyHTML();
    $("sentinel").innerHTML = filtered.length > shown ? `<button type="button" class="more" data-more>Show more (${(filtered.length - shown).toLocaleString()} left)</button>` : "";
  }
  function emptyHTML() {
    const tips = ["milk", "rice", "chicken", "coffee", "shampoo", "water"];
    return `<div class="empty"><div class="big">🔎</div><h3>No products match${F.q ? ` “${esc(F.q)}”` : ""}</h3><p>Try fewer words, check the spelling, or clear the filters.</p>` +
      `<div class="sugg-words">${tips.map((t) => `<button type="button" class="sc2" data-q="${t}">${t}</button>`).join("")}<button type="button" class="sc2" id="reset2" data-reset>Clear filters</button></div></div>`;
  }
  function syncControls() {
    const sb = $("search"); if (document.activeElement !== sb || sb.value.trim() !== F.q) sb.value = F.q;
    $("sort").value = F.sort;
    $("f-multi").checked = F.multi; $("f-sale").checked = F.sale; $("f-fav").checked = F.fav;
    $("pmin").value = F.pmin ?? ""; $("pmax").value = F.pmax ?? "";
    $("clear-search").hidden = !F.q;
    $("store-chips").innerHTML = ACTIVE.map((s) => `<button type="button" class="f-shop" data-store="${s.id}" aria-pressed="${F.stores.has(s.id)}"><span class="box"></span>${slogo(s.id, "sm")}${esc(s.short)}<em>${counts[s.id].toLocaleString()}</em></button>`).join("");
    $("fav-count").textContent = favs.size ? `(${favs.size})` : "";
    $("fav-badge").hidden = !favs.size; $("fav-badge").textContent = favs.size;
    document.querySelectorAll(".bottomnav button").forEach((b) => b.classList.toggle("on", ("home" in b.dataset && isHome()) || ("showfav" in b.dataset && F.fav)));
  }
  function refresh(scrollTop) {
    const home = isHome();
    if (!home) applyFilters(); else { lastRes = null; catCount = {}; }
    syncControls(); writeHash(); renderCats();
    $("home").hidden = !home; $("listing").hidden = home;
    if (!home) { renderSubs(); renderHead(); renderProducts(); }
    if (scrollTop) window.scrollTo({ top: 0 });
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
      (byStore[s.id] ||= []).push(`${cart[id]}× ${p.name}`);
    }
    return { totals, complete, ranked, splitTotal, byStore, unpriced };
  }
  const cartIds = () => Object.keys(cart).filter((id) => cart[id] > 0);
  function renderCart() {
    const ids = cartIds();
    const n = ids.reduce((a, id) => a + cart[id], 0);
    $("count").textContent = ids.length ? `· ${n} item${n === 1 ? "" : "s"}` : "";
    for (const b of [$("count-badge"), $("bn-badge")]) { b.textContent = n; b.hidden = !n; }
    if (!ids.length) {
      $("cart-sum").textContent = "empty";
      $("cart-items").innerHTML = `<div class="empty-cart"><div class="big">${icon("cart")}</div><h3>Your basket is empty</h3><p>Add products and we’ll show which shop is cheapest for the whole basket.</p><button type="button" class="btn primary" data-close-cart-browse>Start shopping</button></div>`;
      $("results").innerHTML = ""; $("cart-foot").innerHTML = ""; return;
    }
    const r = totalsFor(ids);
    const best = r.complete.length ? Math.min(r.complete[0].total, r.splitTotal) : r.splitTotal;
    $("cart-sum").textContent = "from " + fmt(best);
    $("cart-items").innerHTML = ids.map((id) => {
      const p = byId[id];
      return `<div class="crow">${p.image ? `<img class="cimg" data-open="${esc(id)}" loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(p.image)}">` : `<div class="cimg noimg" data-open="${esc(id)}">${CAT_ICON[p.category] || "🛒"}</div>`}` +
        `<span class="nm">${esc(p.name)}<small>${esc(p.size)}${p.size ? " · " : ""}<b>${bd(p.min)} BD</b> at ${esc(store[p.cheapest].short)}</small></span>` +
        `<div class="rgt"><div class="stepper sm"><button type="button" data-dec="${esc(id)}" aria-label="Remove one">−</button><b>${cart[id]}</b><button type="button" data-inc="${esc(id)}" aria-label="Add one">+</button></div>` +
        `<button type="button" class="rm" data-rm="${esc(id)}" aria-label="Remove from basket">${icon("trash")}</button></div></div>`;
    }).join("");

    let html = `<div class="sel">Compare these shops</div><div class="cs-chips">` + ACTIVE.map((s) =>
      `<button type="button" class="cs" data-cs="${s.id}" aria-pressed="${cartStores.has(s.id)}">${slogo(s.id, "sm")}${esc(s.short)}</button>`).join("") + `</div>`;
    if (r.complete.length) {
      const w = r.complete[0], worst = r.complete[r.complete.length - 1];
      html += `<div class="winner">${slogo(w.store.id)}<div><small>Cheapest single shop</small><b>${esc(w.store.name)}</b>${worst !== w ? `<small>Saves ${fmt(worst.total - w.total)} vs ${esc(worst.store.short)}</small>` : ""}</div><div class="tot">${bd(w.total)}<small> BD</small></div></div>`;
    } else {
      html += `<div class="winner no"><div><small>Heads up</small><b>No single shop has everything</b><small>Split your basket below for the lowest total.</small></div></div>`;
    }
    if (Object.keys(r.byStore).length > 1 && r.splitTotal < (r.complete[0]?.total ?? Infinity) - 0.0005) {
      const saving = r.complete.length ? ` · saves ${fmt(r.complete[0].total - r.splitTotal)} more` : "";
      html += `<div class="split"><b>💡 Split basket: ${fmt(r.splitTotal)}</b>${saving}<ul>` +
        Object.entries(r.byStore).map(([s, items]) => `<li><b>${esc(store[s].short)}:</b> ${items.map(esc).join(", ")}</li>`).join("") + `</ul></div>`;
    }
    if (r.unpriced.length) html += `<p class="warn">No selected shop has a price for: ${r.unpriced.map(esc).join(", ")}</p>`;
    const top = r.ranked.find((t) => !t.missing.length), maxT = Math.max(...r.ranked.map((t) => t.total), 0.001);
    html += `<table class="cmp">` + r.ranked.map((t) =>
      `<tr class="${t === top ? "top" : ""}"><td>${slogo(t.store.id, "sm")}<div>${esc(t.store.name)}${t.missing.length ? `<div class="warn">missing ${t.missing.length} item${t.missing.length === 1 ? "" : "s"}</div>` : ""}<span class="bar"><i style="width:${Math.round((t.total / maxT) * 100)}%"></i></span></div></td>` +
      `<td>${fmt(t.total)}</td></tr>`).join("") + `</table>`;
    $("results").innerHTML = html;
    $("cart-foot").innerHTML = `<div class="foot-tot"><span>Lowest total</span><b>${fmt(best)}</b></div>` +
      `<div class="tools"><button type="button" data-copy><span class="ti">📋</span>Copy</button><button type="button" data-wa><span class="ti">💬</span>WhatsApp</button><button type="button" data-print><span class="ti">🖨</span>Print</button><button type="button" data-clear><span class="ti">🗑</span>Clear</button></div>`;
  }
  function cartText() {
    const ids = cartIds();
    const r = totalsFor(ids);
    let t = "🛒 My shopping list\n";
    for (const id of ids) t += `• ${cart[id]}× ${byId[id].name}${byId[id].size ? " (" + byId[id].size + ")" : ""}\n`;
    if (r.complete.length) t += `\nCheapest single shop: ${r.complete[0].store.name} — ${fmt(r.complete[0].total)}`;
    if (Object.keys(r.byStore).length > 1) t += `\nBest split: ${fmt(r.splitTotal)}\n` + Object.entries(r.byStore).map(([s, it]) => `${store[s].name}: ${it.join(", ")}`).join("\n");
    return t;
  }

  /* ---------- product details ---------- */
  function renderProduct() {
    const p = byId[openProduct];
    if (!p) { $("pd").hidden = true; return; }
    const ids = shopsOf(p);
    const missing = ACTIVE.filter((s) => p.prices[s.id] == null).map((s) => s.short);
    const rows = ids.map((id) => {
      const best = p.n > 1 && p.prices[id] === p.min;
      return `<a class="pd-row${best ? " best" : ""}" href="${esc(p.links[id])}" target="_blank" rel="noopener">${slogo(id, "")}<span class="nm">${esc(store[id].name)}<small>${best ? "Cheapest" : `+${bd(p.prices[id] - p.min)} BD`}${p.was[id] ? ` · was ${bd(p.was[id])}` : ""}</small></span>` +
        `<span class="pr">${p.was[id] ? `<s>${bd(p.was[id])}</s>` : ""}${bd(p.prices[id])} BD</span><span class="go">${icon("ext")}</span></a>`;
    }).join("");
    const sim = similar(p);
    $("pd-box").innerHTML = `<button type="button" class="icon-btn pd-close" data-close-pd aria-label="Close">${icon("close")}</button>` +
      `<div class="pd-grid"><div class="pd-media">${p.image ? `<img referrerpolicy="no-referrer" alt="${esc(p.name)}" src="${esc(p.image)}">` : `<div class="noimg">${CAT_ICON[p.category] || "🛒"}</div>`}</div>` +
      `<div class="pd-info"><div class="pd-cat">${esc(p.category)}${p.sub ? " · " + esc(p.sub) : ""}</div><h2 id="pd-title">${esc(p.name)}</h2><div class="pd-size">${esc(p.size)}</div>` +
      `<div class="pd-best"><div><small>${p.n > 1 ? `Best price of ${p.n} shops` : `Only at ${esc(store[ids[0]].short)}`}</small><span class="price">${bd(p.min)}<small>BD</small></span></div>` +
      (p.n > 1 && p.spread >= 0.005 ? `<div class="saving">Save up to<br>${fmt(p.spread)} (${Math.round(p.spreadPct * 100)}%)</div>` : "") + `</div>` +
      (p.suspect ? `<p class="warn">⚠ The shops’ prices differ by more than 3×. They may list different pack sizes, so open each shop’s page to check.</p>` : "") +
      `<div class="pd-shops">${rows}</div>` +
      (missing.length ? `<div class="pd-note">Not listed at ${missing.map(esc).join(", ")}.</div>` : "") +
      `<div class="pd-act" id="pd-act"></div><div class="pd-note">Prices are read from each shop’s own website. Tap a shop to check its page before you buy.</div></div></div>` +
      (sim.length ? `<div class="pd-sim"><h3>Similar products</h3><div class="carousel"><div class="track">${sim.map((x) => card(x, true)).join("")}</div></div></div>` : "");
    renderProductActions();
    $("pd").hidden = false; document.body.classList.add("locked");
    $("pd-box").scrollTop = 0;
  }
  function renderProductActions() {
    const p = byId[openProduct], el = $("pd-act"); if (!p || !el) return;
    el.innerHTML = actionHTML(p, true) + `<button type="button" class="heart" data-fav="${esc(p.id)}" aria-pressed="${favs.has(p.id)}" aria-label="Save to favourites">${icon(favs.has(p.id) ? "heart-fill" : "heart")}</button>`;
  }
  function similar(p) {
    const words = p.name.split(/\s+/).filter((w) => /[a-z]{3,}/i.test(w)).slice(0, 3).join(" ");
    if (!words) return [];
    Search.setProfile("");
    const r = Search.search(words, { asYouType: false });
    const out = [];
    for (const i of r.ids) { const x = ALL[i]; if (x.id !== p.id && x.category === p.category) out.push(x); if (out.length >= 10) break; }
    return out;
  }
  function openPD(id) { openProduct = id; writeHash(); renderProduct(); }
  function closePD() { openProduct = null; $("pd").hidden = true; unlock(); writeHash(); }
  const unlock = () => { if ($("pd").hidden && !document.body.classList.contains("cart-open") && !document.body.classList.contains("filters-open")) document.body.classList.remove("locked"); };

  /* ---------- small UI helpers ---------- */
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800); }
  function setCart(open) {
    document.body.classList.toggle("cart-open", open); $("cart").setAttribute("aria-hidden", String(!open));
    $("scrim").hidden = !open && !document.body.classList.contains("filters-open");
    if (open) { document.body.classList.add("locked"); setTimeout(() => $("close-cart").focus(), 50); } else unlock();
  }
  function setFilters(open) {
    document.body.classList.toggle("filters-open", open);
    $("scrim").hidden = !open && !document.body.classList.contains("cart-open");
    if (open) document.body.classList.add("locked"); else unlock();
  }
  function goSearch(q) { F.q = q.trim(); F.cat = "All"; F.sub = ""; remember(F.q); closeSugg(); refresh(true); }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-open]"); if (!t) return;
    const d = t.dataset;
    if ("more" in d) { shown += PAGE; renderProducts(true); return; }
    if (d.inc != null || d.dec != null || d.rm != null) {
      const id = d.inc ?? d.dec ?? d.rm;
      const was = cart[id] || 0;
      if (d.inc != null) cart[id] = was + 1;
      else if (d.dec != null) { cart[id] = was - 1; if (cart[id] <= 0) delete cart[id]; }
      else delete cart[id];
      saveCart(); renderCart(); updateCard(id);
      if (d.inc != null && !was) { toast(`Added: ${byId[id].name.slice(0, 40)}`); const b = $("open-cart"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
      return;
    }
    if (d.open != null) { e.preventDefault(); openPD(d.open); return; }
    if (d.fav != null) {
      favs.has(d.fav) ? favs.delete(d.fav) : favs.add(d.fav); ls.set("favs", [...favs]);
      toast(favs.has(d.fav) ? "Saved to favourites" : "Removed from favourites");
      syncControls();
      if (F.fav && !isHome()) refresh(); else updateCard(d.fav);
      return;
    }
    if ("closePd" in d) { closePD(); return; }
    if (d.cat != null) { closePD(); Object.assign(F, { cat: d.cat, sub: "", all: d.cat === "All" }); if (d.cat === "All") F.q = ""; window.__catScroll = true; refresh(true); return; }
    if (d.sub != null && t.classList.contains("sc2")) { F.sub = d.sub; refresh(); return; }
    if (d.store && !t.classList.contains("hs")) { F.stores.has(d.store) ? F.stores.delete(d.store) : F.stores.add(d.store); refresh(); return; }
    if (d.shop) { Object.assign(F, blank(), { stores: new Set([d.shop]), all: true }); refresh(true); return; }
    if (d.untog) { if (d.untog === "price") { F.pmin = null; F.pmax = null; } else F[d.untog] = false; refresh(); return; }
    if (d.see) { Object.assign(F, blank(), { sort: d.see, all: true }); if (d.see === "save") F.multi = true; refresh(true); return; }
    if (d.jump) { document.getElementById("row-" + d.jump).scrollIntoView({ behavior: "smooth" }); return; }
    if (d.car) { const tr = t.parentElement.querySelector(".track"); tr.scrollBy({ left: +d.car * tr.clientWidth * 0.9, behavior: "smooth" }); return; }
    if (d.q) { goSearch(d.q); return; }
    if ("reset" in d || t.id === "reset") { const q = F.q; Object.assign(F, blank(), { q, all: true }); refresh(); return; }
    if (d.cs) { cartStores.has(d.cs) ? cartStores.delete(d.cs) : cartStores.add(d.cs); if (!cartStores.size) cartStores.add(d.cs); ls.set("cartStores", [...cartStores]); renderCart(); return; }
    if ("clear" in d) { if (!confirm("Empty your basket?")) return; const old = cartIds(); cart = {}; saveCart(); renderCart(); old.forEach(updateCard); return; }
    if ("copy" in d) { (navigator.clipboard ? navigator.clipboard.writeText(cartText()) : Promise.reject()).then(() => toast("List copied"), () => toast("Copy not allowed here")); return; }
    if ("wa" in d) { window.open("https://wa.me/?text=" + encodeURIComponent(cartText()), "_blank", "noopener"); return; }
    if ("print" in d) { window.print(); return; }
    if ("home" in d) { e.preventDefault(); closePD(); setCart(false); Object.assign(F, blank()); refresh(true); return; }
    if ("allcats" in d) { Object.assign(F, blank()); refresh(); document.querySelector(".cat-tiles").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if ("showfav" in d) { closePD(); setCart(false); Object.assign(F, blank(), { fav: true }); refresh(true); if (!favs.size) toast("Tap ♡ on a product to save it here"); return; }
    if ("focusSearch" in d) { window.scrollTo({ top: 0 }); $("search").focus(); return; }
    if ("opencart" in d || t.id === "open-cart") { setCart(true); return; }
    if (t.id === "close-cart") { setCart(false); return; }
    if ("closeCartBrowse" in d) { setCart(false); return; }
    if ("openFilters" in d) { setFilters(true); return; }
    if ("closeFilters" in d) { setFilters(false); return; }
    if (t.id === "theme") {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; ls.set("theme", next); themeIcon(); return;
    }
    if (t.id === "clear-search") { F.q = ""; $("search").value = ""; refresh(); $("search").focus(); return; }
    if (t.id === "go-search") { clearTimeout(timer); goSearch($("search").value); return; }
  });
  $("scrim").addEventListener("click", () => { setCart(false); setFilters(false); });
  $("pd").addEventListener("click", (e) => { if (e.target === $("pd")) closePD(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("sugg").hidden) return;
      if (!$("pd").hidden) closePD(); else if (document.body.classList.contains("cart-open")) setCart(false); else setFilters(false);
    }
    if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("search").focus(); }
  });
  // A picture that fails to load (broken or blocked link) falls back to the category icon.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName !== "IMG") return;
    const host = t.closest("[data-card]"), p = host && byId[host.dataset.card];
    const d = document.createElement(t.closest("#sugg") ? "span" : "div");
    d.className = t.closest("#sugg") ? "th" : "noimg " + (t.className || ""); d.textContent = p ? CAT_ICON[p.category] || "🛒" : "🛒";
    if (t.dataset.open) d.dataset.open = t.dataset.open;
    t.replaceWith(d);
  }, true);
  function themeIcon() {
    const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light")) === "dark";
    $("theme").innerHTML = `${icon(dark ? "sun" : "moon")}<span>${dark ? "Light mode" : "Dark mode"}</span>`;
  }

  /* ---------- search box: suggestions, recent searches, keyboard ---------- */
  let timer, sugg = [], active = -1;
  const box = $("sugg"), input = $("search");
  const recent = () => ls.get("recent", []);
  function remember(q) {
    q = (q || "").trim(); if (q.length < 2) return;
    ls.set("recent", [q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8));
  }
  function closeSugg() { box.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); }
  const POPULAR = ["fresh milk", "eggs", "basmati rice", "chicken", "water", "nescafe", "pampers", "olive oil"];
  function showSugg() {
    const v = input.value;
    let head = "";
    if (!v.trim()) {
      const rc = recent();
      sugg = (rc.length ? rc.map((t) => ({ type: "recent", text: t })) : POPULAR.map((t) => ({ type: "popular", text: t })));
      head = `<li class="sg-head" role="presentation">${rc.length ? `Recent searches <button type="button" data-clear-recent>Clear</button>` : "Popular searches"}</li>`;
    } else sugg = Search.suggest(v, 8);
    if (!sugg.length) { closeSugg(); return; }
    const terms = v.trim() ? Search.search(v.trim()).terms : null;
    box.innerHTML = head + sugg.map((x, i) => {
      const d = x.idx != null ? ALL[x.idx] : null;
      const ic = x.type === "recent" ? "🕘" : x.type === "popular" ? "🔥" : x.type === "word" ? icon("search") : x.type === "cat" ? (CAT_ICON[x.cat] || "📂") : "";
      const thumb = d ? (d.image ? `<img loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(d.image)}">` : `<span class="th">${CAT_ICON[d.category] || "🛒"}</span>`) : `<span class="th">${ic}</span>`;
      const label = d && terms ? Search.highlight(x.text, terms, esc) : esc(x.text);
      return `<li role="option" data-i="${i}" id="sg-${i}">${thumb}<span class="tx">${label}</span>` +
        (d ? `<small>${d.n > 1 ? d.n + " shops · " : ""}from <b>${bd(d.min)}</b></small>` : x.type === "cat" ? `<small>category · ${x.count.toLocaleString()}</small>` : "") + `</li>`;
    }).join("");
    box.hidden = false; active = -1; input.setAttribute("aria-expanded", "true");
  }
  function choose(i) {
    const x = sugg[i]; if (!x) return;
    if (x.type === "cat") { input.value = ""; Object.assign(F, blank(), { cat: x.cat, sub: x.sub || "" }); closeSugg(); input.blur(); window.__catScroll = true; refresh(true); return; }
    if (x.type === "product") { closeSugg(); input.blur(); openPD(ALL[x.idx].id); return; }
    input.value = x.text; goSearch(x.text); input.blur();
  }
  function move(delta) {
    if (box.hidden) { showSugg(); return; }
    const items = box.querySelectorAll("li[data-i]"); if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    items.forEach((li, k) => { li.classList.toggle("on", k === active); if (k === active) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } });
  }
  input.addEventListener("input", (e) => {
    clearTimeout(timer); showSugg();
    $("clear-search").hidden = !e.target.value;
    timer = setTimeout(() => { const v = e.target.value.trim(); if (v === F.q) return; if (v) { F.cat = "All"; F.sub = ""; } F.q = v; refresh(); }, 160);
  });
  input.addEventListener("focus", showSugg);
  input.addEventListener("blur", () => { setTimeout(closeSugg, 150); remember(F.q); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && !box.hidden) choose(active);
      else { clearTimeout(timer); goSearch(input.value); input.blur(); }
    } else if (e.key === "Escape") { if (!box.hidden) { closeSugg(); e.stopPropagation(); } }
  });
  box.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.target.closest("[data-clear-recent]")) { ls.set("recent", []); showSugg(); return; }
    const li = e.target.closest("li[data-i]"); if (li) choose(+li.dataset.i);
  });
  $("sort").addEventListener("change", (e) => { F.sort = e.target.value; F.all = true; refresh(); });
  $("f-multi").addEventListener("change", (e) => { F.multi = e.target.checked; refresh(); });
  $("f-sale").addEventListener("change", (e) => { F.sale = e.target.checked; refresh(); });
  $("f-fav").addEventListener("change", (e) => { F.fav = e.target.checked; refresh(); });
  const num = (v) => (v === "" || isNaN(+v) ? null : +v);
  $("pmin").addEventListener("change", (e) => { F.pmin = num(e.target.value); F.all = true; refresh(); });
  $("pmax").addEventListener("change", (e) => { F.pmax = num(e.target.value); F.all = true; refresh(); });
  if ("IntersectionObserver" in window) {   // endless scrolling
    new IntersectionObserver((en) => { if (en[0].isIntersecting && !$("listing").hidden && filtered.length > shown) { shown += PAGE; renderProducts(true); } }, { rootMargin: "800px" }).observe($("sentinel"));
  }
  window.addEventListener("hashchange", () => { readHash(); refresh(); if (openProduct) renderProduct(); else { $("pd").hidden = true; unlock(); } });

  /* ---------- static text ---------- */
  const upd = meta.updated ? new Date(meta.updated).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("strip-text").innerHTML = `${upd ? `Prices updated <b>${esc(upd)}</b> · ` : ""}<b>${ALL.length.toLocaleString()}</b> products from ${ACTIVE.length} Bahrain supermarkets`;
  $("search").placeholder = `Search ${ALL.length.toLocaleString()} products… try “nido 1.8kg”, “milk under 1”, “rice at ramez”`;
  $("foot-text").innerHTML = `<div><b>Price Compare Bahrain</b><br>Prices are read from each shop’s own website${upd ? `, last updated ${esc(upd)}` : ""}. A shop is left out of a product when it does not list it.<br>Always check the shop’s page (tap a price) before you buy.</div>` +
    `<div class="fshops">${ACTIVE.map((s) => `${slogo(s.id, "sm")}<span>${esc(s.short)}</span>`).join(" ")}</div>`;

  readHash(); renderHome(); refresh(); renderCart(); themeIcon();
  if (openProduct) renderProduct();
  const boot = $("boot"); boot.classList.add("done"); setTimeout(() => boot.remove(), 400);
})();
