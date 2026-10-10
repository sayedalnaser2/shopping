(() => {
  const { STORES, PRODUCTS } = window;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toFixed(3) + " BD";
  const live = window.LIVE_PRICES;
  if (live) {
    for (const [id, byStore] of Object.entries(live.prices))
      if (PRODUCTS[id]) for (const s of STORES) if (s.id in byStore) PRODUCTS[id].prices[s.id] = byStore[s.id];
  }
  $("notice").innerHTML = live
    ? `Live prices last updated <strong>${new Date(live.updated).toLocaleString()}</strong>. Items the bot couldn't find fall back to sample estimates.`
    : `⚠️ Prices shown are <strong>sample estimates</strong>. Run the price bot to fetch live prices.`;
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem("cart") || "{}"); } catch (e) {}
  const save = () => { try { localStorage.setItem("cart", JSON.stringify(cart)); } catch (e) {} };

  const cats = ["All", ...new Set(PRODUCTS.map((p) => p.category))];
  $("category").innerHTML = cats.map((c) => `<option>${c}</option>`).join("");

  function bestOf(p) {
    let best = Infinity;
    for (const s of STORES) if (p.prices[s.id] != null) best = Math.min(best, p.prices[s.id]);
    return best;
  }

  function renderProducts() {
    const q = $("search").value.trim().toLowerCase();
    const c = $("category").value;
    const list = PRODUCTS.filter((p) =>
      (c === "All" || p.category === c) && (p.name + " " + p.size).toLowerCase().includes(q));
    $("products").innerHTML = list.length ? list.map((p) => {
      const best = bestOf(p);
      const chips = STORES.map((s) => {
        const v = p.prices[s.id];
        if (v == null) return `<span class="chip na">${s.name}: n/a</span>`;
        return `<span class="chip ${v === best ? "best" : ""}">${s.name}: ${v.toFixed(3)}</span>`;
      }).join("");
      return `<div class="product"><div class="top"><div><h3>${p.name}</h3><small>${p.size}</small></div>
        <button class="primary" data-add="${p.id}">+ Add</button></div><div class="prices">${chips}</div></div>`;
    }).join("") : `<p class="empty">No products found.</p>`;
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
      const p = PRODUCTS[id];
      return `<div class="row"><span>${p.name}<br><small>${p.size}</small></span>
        <span class="qty"><button data-dec="${id}">−</button>${cart[id]}<button data-inc="${id}">+</button></span></div>`;
    }).join("") + `<p><button data-clear>Clear cart</button></p>`;

    // Per-store totals
    const totals = STORES.map((s) => {
      let total = 0; const missing = [];
      for (const id of ids) {
        const v = PRODUCTS[id].prices[s.id];
        if (v == null) missing.push(PRODUCTS[id].name); else total += v * cart[id];
      }
      return { store: s, total, missing };
    });
    const complete = totals.filter((t) => !t.missing.length).sort((a, b) => a.total - b.total);
    const ranked = [...totals].sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);

    // Split basket: cheapest store per item
    let splitTotal = 0; const byStore = {};
    for (const id of ids) {
      const p = PRODUCTS[id];
      const s = STORES.filter((s) => p.prices[s.id] != null).sort((a, b) => p.prices[a.id] - p.prices[b.id])[0];
      const cost = p.prices[s.id] * cart[id];
      splitTotal += cost;
      (byStore[s.name] ||= []).push(`${cart[id]}× ${p.name}`);
    }

    let html = "";
    if (complete.length) {
      const w = complete[0];
      const worst = complete[complete.length - 1];
      html += `<div class="winner">✅ Cheapest single store<br><b>${w.store.name}</b> — ${fmt(w.total)}` +
        (worst !== w ? `<br><small>Saves ${fmt(worst.total - w.total)} vs ${worst.store.name}</small>` : "") + `</div>`;
    } else {
      html += `<div class="winner" style="background:#c77a00">No single store stocks everything in your cart.</div>`;
    }
    if (splitTotal < (complete[0]?.total ?? Infinity) - 0.0005) {
      const saving = complete.length ? ` (saves ${fmt(complete[0].total - splitTotal)} more)` : "";
      html += `<div class="split"><b>💡 Best split basket: ${fmt(splitTotal)}</b>${saving}<br>` +
        Object.entries(byStore).map(([s, items]) => `<br><b>${s}:</b> ${items.join(", ")}`).join("") + `</div>`;
    }
    html += `<table><tr><th>Store</th><th>Total</th></tr>` + ranked.map((t) =>
      `<tr><td>${t.store.name}${t.missing.length ? `<div class="warn">missing ${t.missing.length} item(s)</div>` : ""}</td>` +
      `<td>${fmt(t.total)}</td></tr>`).join("") + `</table>`;
    $("results").innerHTML = html;
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const add = t.dataset.add ?? t.dataset.inc, dec = t.dataset.dec;
    if (add != null) cart[add] = (cart[add] || 0) + 1;
    else if (dec != null) { cart[dec] = (cart[dec] || 0) - 1; if (cart[dec] <= 0) delete cart[dec]; }
    else if ("clear" in t.dataset) cart = {};
    else return;
    save(); renderCart();
  });
  $("search").addEventListener("input", renderProducts);
  $("category").addEventListener("change", renderProducts);
  renderProducts(); renderCart();
})();
