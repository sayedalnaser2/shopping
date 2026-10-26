(() => {
  const { STORES } = window;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toFixed(3) + " BD";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const meta = window.CATALOG_META || {};
  const PAGE = 60;
  const SITE = { lulu: "https://gcc.luluhypermarket.com", carrefour: "https://www.hypermax.com.bh", jazira: "https://www.aljazirasupermarkets.com",
    megamart: "https://megamart.bh", ramez: "https://ramezshopping.com" };
  const SLOT = { lulu: 5, carrefour: 6, jazira: 7, megamart: 8, ramez: 9 }; // position of each shop in a catalog row

  // Catalog (catalog.js): every scraped product. Row = [id, name, size, category, image, lulu, hypermax, jazira, megamart, ramez]; store = [price, was, path]
  const ALL = (window.CATALOG || []).map((r) => {
    const prices = Object.fromEntries(STORES.map((s) => [s.id, null]));
    const links = {};
    for (const id in SLOT) { const c = r[SLOT[id]]; if (c) { prices[id] = c[0]; links[id] = SITE[id] + c[2]; } }
    return { id: r[0], name: r[1], size: r[2] || "", category: r[3], image: r[4], prices, links };
  });
  const byId = Object.fromEntries(ALL.map((p) => [p.id, p]));
  for (const p of ALL) p._q = (p.name + " " + p.size).toLowerCase();
  // Only shops we have prices for take part in the comparison.
  const ACTIVE = STORES.filter((s) => ALL.some((p) => p.prices[s.id] != null));
  for (const p of ALL) p.stores = ACTIVE.map((s) => s.id);

  $("notice").innerHTML = (meta.updated ? `Prices updated <strong>${new Date(meta.updated).toLocaleString()}</strong>. ` : "") +
    `Prices come from the shops' websites (${ALL.length.toLocaleString()} products` +
    (meta.multi ? `, ${meta.multi.toLocaleString()} found in more than one shop` : "") + `). ` +
    `Shops covered: ${ACTIVE.map((s) => esc(s.name)).join(", ")}. A price shows <em>n/a</em> when the shop does not sell the product.`;

  let cart = {};
  try { cart = JSON.parse(localStorage.getItem("cart") || "{}"); } catch (e) {}
  for (const id of Object.keys(cart)) if (!byId[id]) delete cart[id]; // product no longer in the catalog
  const save = () => { try { localStorage.setItem("cart", JSON.stringify(cart)); } catch (e) {} };

  const cats = ["All", ...[...new Set(ALL.map((p) => p.category))].sort()];
  $("category").innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join("");

  function bestOf(p) {
    let best = Infinity;
    for (const s of p.stores) if (p.prices[s] != null) best = Math.min(best, p.prices[s]);
    return best;
  }

  const pic = (p) => p.image
    ? `<img class="pic" loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(p.image)}">`
    : `<div class="pic none" aria-hidden="true">🛒</div>`;

  let shown = PAGE, filtered = [];
  function renderProducts(more) {
    if (!more) {
      const q = $("search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const c = $("category").value;
      filtered = ALL.filter((p) => (c === "All" || p.category === c) && q.every((w) => p._q.includes(w)));
      shown = PAGE;
    }
    const list = filtered.slice(0, shown);
    $("products").innerHTML = list.length ? list.map((p) => {
      const best = bestOf(p);
      const chips = ACTIVE.filter((s) => p.stores.includes(s.id)).map((s) => {
        const v = p.prices[s.id];
        if (v == null) return `<span class="chip na">${esc(s.name)}: n/a</span>`;
        const cls = `chip ${v === best ? "best" : ""}`;
        return p.links[s.id]
          ? `<a class="${cls}" href="${esc(p.links[s.id])}" target="_blank" rel="noopener" title="Open at ${esc(s.name)}">${esc(s.name)}: ${v.toFixed(3)}</a>`
          : `<span class="${cls}">${esc(s.name)}: ${v.toFixed(3)}</span>`;
      }).join("");
      return `<div class="product">${pic(p)}<div class="info"><div class="top"><div><h3>${esc(p.name)}</h3><small>${esc(p.size)}</small></div>
        <button class="primary" data-add="${esc(p.id)}">+ Add</button></div><div class="prices">${chips}</div></div></div>`;
    }).join("") + (filtered.length > shown
      ? `<p><button data-more>Show more (${(filtered.length - shown).toLocaleString()} left)</button></p>` : "")
      : `<p class="empty">No products found.</p>`;
    $("found").textContent = `${filtered.length.toLocaleString()} products`;
  }

  function renderCart() {
    const ids = Object.keys(cart).filter((id) => cart[id] > 0);
    $("count").textContent = ids.length ? `(${ids.reduce((a, id) => a + cart[id], 0)})` : "";
    if (!ids.length) {
      $("cart-items").innerHTML = `<p class="empty">Cart is empty. Add products to compare.</p>`;
      $("results").innerHTML = "";
      return;
    }
    $("cart-items").innerHTML = ids.map((id) => {
      const p = byId[id];
      return `<div class="row">${pic(p)}<span class="nm">${esc(p.name)}<br><small>${esc(p.size)}</small></span>
        <span class="qty"><button data-dec="${esc(id)}">−</button>${cart[id]}<button data-inc="${esc(id)}">+</button></span></div>`;
    }).join("") + `<p><button data-clear>Clear cart</button></p>`;

    // Per-store totals
    const totals = ACTIVE.map((s) => {
      let total = 0; const missing = [];
      for (const id of ids) {
        const v = byId[id].prices[s.id];
        if (v == null) missing.push(byId[id].name); else total += v * cart[id];
      }
      return { store: s, total, missing };
    });
    const complete = totals.filter((t) => !t.missing.length).sort((a, b) => a.total - b.total);
    const ranked = [...totals].sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);

    // Split basket: cheapest store per item
    let splitTotal = 0; const byStore = {}; const unpriced = [];
    for (const id of ids) {
      const p = byId[id];
      const s = ACTIVE.filter((s) => p.prices[s.id] != null).sort((a, b) => p.prices[a.id] - p.prices[b.id])[0];
      if (!s) { unpriced.push(p.name); continue; }
      splitTotal += p.prices[s.id] * cart[id];
      (byStore[s.name] ||= []).push(`${cart[id]}× ${p.name}`);
    }

    let html = "";
    if (complete.length) {
      const w = complete[0];
      const worst = complete[complete.length - 1];
      html += `<div class="winner">✅ Cheapest single store<br><b>${esc(w.store.name)}</b> — ${fmt(w.total)}` +
        (worst !== w ? `<br><small>Saves ${fmt(worst.total - w.total)} vs ${esc(worst.store.name)}</small>` : "") + `</div>`;
    } else {
      html += `<div class="winner" style="background:#c77a00">No single store stocks everything in your cart.</div>`;
    }
    if (Object.keys(byStore).length && splitTotal < (complete[0]?.total ?? Infinity) - 0.0005) {
      const saving = complete.length ? ` (saves ${fmt(complete[0].total - splitTotal)} more)` : "";
      html += `<div class="split"><b>💡 Best split basket: ${fmt(splitTotal)}</b>${saving}<br>` +
        Object.entries(byStore).map(([s, items]) => `<br><b>${esc(s)}:</b> ${items.map(esc).join(", ")}`).join("") + `</div>`;
    }
    if (unpriced.length) html += `<p class="warn">No store has a price for: ${unpriced.map(esc).join(", ")}</p>`;
    html += `<table><tr><th>Store</th><th>Total</th></tr>` + ranked.map((t) =>
      `<tr><td>${esc(t.store.name)}${t.missing.length ? `<div class="warn">missing ${t.missing.length} item(s)</div>` : ""}</td>` +
      `<td>${fmt(t.total)}</td></tr>`).join("") + `</table>`;
    $("results").innerHTML = html;
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if ("more" in t.dataset) { shown += PAGE; renderProducts(true); return; }
    const add = t.dataset.add ?? t.dataset.inc, dec = t.dataset.dec;
    if (add != null) cart[add] = (cart[add] || 0) + 1;
    else if (dec != null) { cart[dec] = (cart[dec] || 0) - 1; if (cart[dec] <= 0) delete cart[dec]; }
    else if ("clear" in t.dataset) cart = {};
    else return;
    save(); renderCart();
  });
  // A picture that fails to load (broken or blocked link) falls back to the placeholder.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && t.classList.contains("pic")) {
      const d = document.createElement("div");
      d.className = "pic none"; d.textContent = "🛒";
      t.replaceWith(d);
    }
  }, true);
  let timer;
  $("search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => renderProducts(), 150); });
  $("category").addEventListener("change", () => renderProducts());
  renderProducts(); renderCart();
})();
