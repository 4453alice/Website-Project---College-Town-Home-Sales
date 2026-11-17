/* Campus Gravity dashboard.
 * Every number on the page is computed here, in the browser, from
 * site_points.json (built by build_site_data.py).
 */
(() => {
  "use strict";

  const DATA_URL = "site_points.json";
  const MILE_M = 1609.344;
  const RINGS = [1, 2, 4, 8];
  // Distance bins for the gravity curve, in miles
  const BIN_EDGES = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 16];
  const MIN_BIN_N = 15;      // a bin needs at least this many sales to be plotted
  const NEAR_MAX = 1;        // "near campus" = within 1 mile
  const FAR_MIN = 4;         // "far" = 4 miles or more
  const REFERENCE = "Illinois";
  // Sequential ramp for price per sq ft on a dark map: dim -> bright, one hue
  const RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#e6f0fd"];

  const fmt$ = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const fmtK = (v) => v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : "$" + Math.round(v / 1000) + "K";
  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const fmtPct = (v) => (v >= 0 ? "+" : "") + Math.round(v * 100) + "%";

  function median(arr) {
    if (!arr.length) return null;
    const s = Float64Array.from(arr).sort();
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  const state = { campus: 0 };
  let DATA, SALES, CAMPUSES, BREAKS, STATS, map, pointLayer, ringLayer;

  /* ---------------- tooltip ---------------- */
  const tip = document.getElementById("tooltip");
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  /* ---------------- data prep ---------------- */
  function prepare(raw) {
    const c = raw.columns.reduce((o, k, i) => (o[k] = i, o), {});
    SALES = raw.rows.map((r) => ({
      lat: r[c.lat], lon: r[c.lon], price: r[c.price], sqft: r[c.sqft],
      beds: r[c.beds], baths: r[c.baths], year: r[c.year_built], dom: r[c.days_on_market],
      miles: r[c.miles_to_campus], campus: r[c.campus], city: raw.cities[r[c.city]],
      date: r[c.sale_date],
      ppsf: r[c.sqft] ? r[c.price] / r[c.sqft] : null,
    }));
    CAMPUSES = raw.campuses;

    const allPpsf = SALES.filter((s) => s.ppsf).map((s) => s.ppsf).sort((a, b) => a - b);
    BREAKS = [1, 2, 3, 4, 5].map((i) => quantile(allPpsf, i / 6)); // sextiles

    STATS = CAMPUSES.map((camp, ci) => {
      const rows = SALES.filter((s) => s.campus === ci);
      const pp = (list) => list.filter((s) => s.ppsf).map((s) => s.ppsf);
      const near = pp(rows.filter((s) => s.miles <= NEAR_MAX));
      const far = pp(rows.filter((s) => s.miles >= FAR_MIN));
      const nearMed = near.length >= MIN_BIN_N ? median(near) : null;
      const farMed = far.length >= MIN_BIN_N ? median(far) : null;
      const bins = [];
      for (let b = 0; b < BIN_EDGES.length - 1; b++) {
        const inBin = rows.filter((s) => s.ppsf && s.miles >= BIN_EDGES[b] && s.miles < BIN_EDGES[b + 1]);
        if (inBin.length >= MIN_BIN_N) {
          bins.push({
            lo: BIN_EDGES[b], hi: BIN_EDGES[b + 1], n: inBin.length,
            x: median(inBin.map((s) => s.miles)), y: median(inBin.map((s) => s.ppsf)),
          });
        }
      }
      const doms = rows.filter((s) => s.dom !== null).map((s) => s.dom);
      return {
        rows, n: rows.length,
        medPrice: median(rows.map((s) => s.price)),
        medPpsf: median(pp(rows)),
        medDom: median(doms), nDom: doms.length,
        nearMed, farMed, nNear: near.length, nFar: far.length,
        premium: nearMed && farMed ? nearMed / farMed - 1 : null,
        bins,
      };
    });
    state.campus = CAMPUSES.findIndex((c) => c.short === REFERENCE);
  }

  const colorFor = (v) => {
    let i = 0;
    while (i < BREAKS.length && v >= BREAKS[i]) i++;
    return RAMP[i];
  };

  /* ---------------- campus picker ---------------- */
  function buildPicker() {
    const box = document.getElementById("campus-buttons");
    const order = CAMPUSES.map((c, i) => i).sort((a, b) =>
      (CAMPUSES[a].short === REFERENCE ? -1 : 0) - (CAMPUSES[b].short === REFERENCE ? -1 : 0) ||
      CAMPUSES[a].short.localeCompare(CAMPUSES[b].short));
    order.forEach((i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = CAMPUSES[i].short;
      btn.title = CAMPUSES[i].name;
      btn.dataset.idx = i;
      btn.addEventListener("click", () => select(i));
      box.appendChild(btn);
    });
  }

  function select(i) {
    state.campus = i;
    document.querySelectorAll("#campus-buttons button").forEach((b) =>
      b.setAttribute("aria-pressed", String(+b.dataset.idx === i)));
    drawMap();
    drawKpis();
    drawCurve();
    drawLeaderboard();
    drawBudget();
    drawHeat();
  }

  /* ---------------- 1. map ---------------- */
  function initMap() {
    map = L.map("map", { preferCanvas: true, zoomControl: true, scrollWheelZoom: false });
    const start = CAMPUSES[state.campus];
    map.fitBounds(L.latLng(start.lat, start.lon).toBounds(4 * MILE_M * 2));
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    map.on("click", () => map.scrollWheelZoom.enable());
    pointLayer = L.layerGroup().addTo(map);
    ringLayer = L.layerGroup().addTo(map);

    const lg = document.getElementById("map-legend");
    const ticks = [0, ...BREAKS].map((b, i) => i === 0 ? "" : "$" + Math.round(b));
    lg.innerHTML = `<div>Price per sq ft (each color = 1/6 of all sales)</div>
      <div class="ramp">${RAMP.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
      <div class="ticks"><span>lower</span>${ticks.slice(1).map((t) => `<span>${t}</span>`).join("")}<span>higher</span></div>
      <div style="margin-top:4px;color:var(--text-muted)">Gray dots: living area not usable</div>`;
  }

  function drawMap() {
    const ci = state.campus, camp = CAMPUSES[ci], st = STATS[ci];
    pointLayer.clearLayers();
    ringLayer.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    // Draw cheaper homes first so the bright, expensive ones sit on top
    const rows = st.rows.slice().sort((a, b) => (a.ppsf || 0) - (b.ppsf || 0));
    rows.forEach((s) => {
      const m = L.circleMarker([s.lat, s.lon], {
        renderer, radius: 3.2, stroke: false,
        fillColor: s.ppsf ? colorFor(s.ppsf) : "#5a5f68", fillOpacity: s.ppsf ? 0.85 : 0.5,
      });
      m.bindPopup(() => `<b>${fmt$(s.price)}</b> &middot; ${s.city}<br>
        ${s.ppsf ? fmt$(s.ppsf) + " per sq ft &middot; " + fmtN(s.sqft) + " sq ft<br>" : ""}
        ${s.beds ?? "?"} bd / ${s.baths ?? "?"} ba &middot; built ${s.year ?? "?"}<br>
        ${s.miles} mi to campus &middot; sold ${s.date ?? "n/a"}
        ${s.dom !== null ? "<br>" + s.dom + " days on market" : ""}`);
      pointLayer.addLayer(m);
    });

    RINGS.forEach((r) => {
      L.circle([camp.lat, camp.lon], {
        radius: r * MILE_M, color: "#86b6ef", weight: 1, opacity: 0.45,
        dashArray: "4 6", fill: false, interactive: false,
      }).addTo(ringLayer);
      const north = [camp.lat + (r * MILE_M) / 111320, camp.lon];
      L.marker(north, {
        interactive: false,
        icon: L.divIcon({ className: "ring-label", html: r + " mi", iconSize: [40, 14], iconAnchor: [-4, 16] }),
      }).addTo(ringLayer);
    });
    L.circleMarker([camp.lat, camp.lon], {
      radius: 7, color: "#0d1015", weight: 2, fillColor: "#ffffff", fillOpacity: 1, interactive: false,
    }).addTo(ringLayer);
    L.marker([camp.lat, camp.lon], {
      interactive: false,
      icon: L.divIcon({ className: "campus-label", html: camp.name, iconSize: [260, 16], iconAnchor: [-10, 8] }),
    }).addTo(ringLayer);

    const bounds = L.latLng(camp.lat, camp.lon).toBounds(4 * MILE_M * 2);
    map.flyToBounds(bounds, { duration: 1.1 });
  }

  function drawKpis() {
    const ci = state.campus, st = STATS[ci];
    const k = (label, value, sub) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    document.getElementById("kpis").innerHTML = [
      k("Sales", fmtN(st.n), "after cleaning rules"),
      k("Median price", fmtK(st.medPrice), "all sales kept"),
      k("Median $ / sq ft", fmt$(st.medPpsf), "usable living area only"),
      k("Campus premium", st.premium === null ? "n/a" : fmtPct(st.premium),
        st.premium === null ? `too few sales near or far` :
        `${fmt$(st.nearMed)} within 1 mi vs ${fmt$(st.farMed)} at 4+ mi`),
      k("Median days on market", st.medDom === null ? "n/a" : fmtN(st.medDom),
        `${fmtN(st.nDom)} sales with both dates`),
    ].join("") + `<p class="insight">${insight(ci)}</p>`;
  }

  // One computed sentence about the selected campus's pull
  function insight(ci) {
    const st = STATS[ci], name = CAMPUSES[ci].short;
    if (st.premium === null) {
      return `${name} has too few sales ${st.nNear < MIN_BIN_N ? "within 1 mile" : "4+ miles out"} (${fmtN(Math.min(st.nNear, st.nFar))}) to measure its pull fairly.`;
    }
    const ranked = STATS.map((s, i) => ({ i, p: s.premium })).filter((d) => d.p !== null).sort((a, b) => b.p - a.p);
    const pos = ranked.findIndex((d) => d.i === ci) + 1;
    const negatives = ranked.filter((d) => d.p < 0).length;
    if (st.premium < 0) {
      return `<b>Anti-gravity.</b> In ${name}, homes within 1 mile of campus cost <b>${Math.round(-st.premium * 100)}% less</b> per square foot than homes 4+ miles out` +
        (negatives === 1 ? `, the only one of ${ranked.length} ranked campuses where the pull runs backwards.` : `. ${negatives} of ${ranked.length} ranked campuses run backwards like this.`);
    }
    const place = pos === 1 ? "the strongest pull" : pos === ranked.length ? "the weakest pull" : `#${pos}`;
    return `In ${name}, homes within 1 mile of campus cost <b>${Math.round(st.premium * 100)}% more</b> per square foot than homes 4+ miles out: ${place} of ${ranked.length} ranked campuses.`;
  }

  /* ---------------- SVG helpers ---------------- */
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const niceMax = (v, step) => Math.ceil(v / step) * step;

  /* ---------------- 2. gravity curve ---------------- */
  function seriesColor(ci) {
    if (ci === state.campus) return "var(--series-1)";
    if (CAMPUSES[ci].short === REFERENCE) return "var(--series-2)";
    return "var(--context)";
  }

  function drawCurve() {
    const box = document.getElementById("curve-chart");
    box.innerHTML = "";
    const ref = CAMPUSES.findIndex((c) => c.short === REFERENCE);
    const legend = document.createElement("div");
    legend.className = "legend-row";
    legend.innerHTML = `<span style="--c:var(--series-1)">${CAMPUSES[state.campus].short} (selected)</span>` +
      (ref !== state.campus ? `<span style="--c:var(--series-2)">${REFERENCE} (reference)</span>` : "") +
      `<span style="--c:var(--context)">Other campuses</span>`;
    box.appendChild(legend);

    const W = 1000, H = 440, m = { t: 36, r: 120, b: 46, l: 64 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Line chart of median price per square foot by distance from campus" }, box);
    const maxY = niceMax(Math.max(...STATS.flatMap((s) => s.bins.map((b) => b.y))), 100);
    const maxX = 15;
    const x = (v) => m.l + (v / maxX) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / maxY) * (H - m.t - m.b);

    const grid = el("g", { class: "grid" }, svg);
    for (let v = 0; v <= maxY; v += 100) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid);
      el("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = "$" + v;
    }
    for (let v = 0; v <= maxX; v += 1) {
      if (v % 2 && v !== 1) continue;
      el("text", { x: x(v), y: H - m.b + 20, "text-anchor": "middle" }, svg).textContent = v;
    }
    el("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle", class: "axis-title" }, svg).textContent = "Miles from campus landmark (straight line)";
    el("text", { x: m.l - 10, y: 14, "text-anchor": "end", class: "axis-title" }, svg).textContent = "$ / sq ft";

    const order = CAMPUSES.map((c, i) => i).sort((a, b) => rank(a) - rank(b));
    function rank(i) { return i === state.campus ? 2 : CAMPUSES[i].short === REFERENCE ? 1 : 0; }

    const labels = [];
    order.forEach((ci) => {
      const bins = STATS[ci].bins;
      if (!bins.length) return;
      const color = seriesColor(ci), hl = rank(ci) > 0;
      const d = bins.map((b, j) => (j ? "L" : "M") + x(b.x) + "," + y(b.y)).join("");
      el("path", { d, fill: "none", stroke: color, "stroke-width": hl ? 2.5 : 1.5, "stroke-linejoin": "round", opacity: hl ? 1 : 0.8 }, svg);
      // wide invisible path: hover a gray line to learn its name, click to select it
      const hit = el("path", { d, fill: "none", stroke: "transparent", "stroke-width": 14, style: "cursor:pointer" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(`<b>${CAMPUSES[ci].name}</b><br>Click to select`, e));
      hit.addEventListener("mouseleave", hideTip);
      hit.addEventListener("click", () => select(ci));
      if (hl) {
        bins.forEach((b) => {
          el("circle", { cx: x(b.x), cy: y(b.y), r: 4.5, fill: color, stroke: "var(--surface-1)", "stroke-width": 2 }, svg);
          const h = el("circle", { cx: x(b.x), cy: y(b.y), r: 12, class: "hit" }, svg);
          h.addEventListener("mousemove", (e) => showTip(
            `<b>${CAMPUSES[ci].short}</b>, ${b.lo} to ${b.hi} mi<br>Median ${fmt$(b.y)} per sq ft<br>${fmtN(b.n)} sales`, e));
          h.addEventListener("mouseleave", hideTip);
        });
        const last = bins[bins.length - 1];
        labels.push({ ci, x: x(last.x) + 10, y: y(last.y) + 4, color });
      }
    });
    // keep the two direct labels from colliding
    if (labels.length === 2 && Math.abs(labels[0].y - labels[1].y) < 16) {
      const [a, b] = labels[0].y < labels[1].y ? labels : [labels[1], labels[0]];
      a.y -= 8; b.y += 8;
    }
    labels.forEach((l) => {
      el("text", { x: l.x, y: l.y, class: "direct-label" }, svg).textContent = CAMPUSES[l.ci].short;
    });

    // table view
    const headers = BIN_EDGES.slice(0, -1).map((lo, i) => `${lo} to ${BIN_EDGES[i + 1]}`);
    const rows = CAMPUSES.map((c, ci) => {
      const cells = BIN_EDGES.slice(0, -1).map((lo) => {
        const b = STATS[ci].bins.find((bb) => bb.lo === lo);
        return `<td>${b ? fmt$(b.y) : ""}</td>`;
      }).join("");
      return `<tr><td>${c.short}</td>${cells}</tr>`;
    }).join("");
    document.getElementById("curve-table").innerHTML =
      `<table><thead><tr><th>Campus (miles)</th>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
       <p>Blank = fewer than ${MIN_BIN_N} sales in that band.</p>`;
  }

  /* ---------------- horizontal bar chart helper ---------------- */
  function hbar(boxId, items, { valueFmt, axisFmt, step, title }) {
    const box = document.getElementById(boxId);
    box.innerHTML = "";
    const rowH = 30, W = 1000, m = { t: 8, r: 70, b: 40, l: 110 };
    const H = m.t + m.b + items.length * rowH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, box);
    const minV = Math.min(0, ...items.map((d) => d.v));
    const maxV = niceMax(Math.max(...items.map((d) => d.v)), step);
    const lo = minV < 0 ? -niceMax(-minV, step) : 0;
    const x = (v) => m.l + ((v - lo) / (maxV - lo)) * (W - m.l - m.r);
    const grid = el("g", { class: "grid" }, svg);
    for (let v = lo; v <= maxV + 1e-9; v += step) {
      el("line", { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }, grid);
      el("text", { x: x(v), y: H - m.b + 18, "text-anchor": "middle" }, svg).textContent = axisFmt(v);
    }
    el("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle", class: "axis-title" }, svg).textContent = title;
    items.forEach((d, i) => {
      const yTop = m.t + i * rowH + 5, bh = rowH - 10;
      const x0 = x(Math.min(0, d.v)), x1 = x(Math.max(0, d.v));
      el("text", { x: m.l - 10, y: yTop + bh / 2 + 4, "text-anchor": "end", class: d.ci === state.campus ? "bar-label" : "" }, svg).textContent = CAMPUSES[d.ci].short;
      el("rect", { x: x0, y: yTop, width: Math.max(2, x1 - x0), height: bh, rx: 4, fill: seriesColor(d.ci) }, svg);
      el("text", { x: d.v >= 0 ? x1 + 8 : x0 - 8, y: yTop + bh / 2 + 4, "text-anchor": d.v >= 0 ? "start" : "end", class: "bar-label" }, svg).textContent = valueFmt(d.v);
      const hit = el("rect", { x: m.l - 100, y: m.t + i * rowH, width: W - m.l + 100, height: rowH, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(d.tip, e));
      hit.addEventListener("mouseleave", hideTip);
      hit.addEventListener("click", () => select(d.ci));
    });
  }

  /* ---------------- 3. leaderboard ---------------- */
  function drawLeaderboard() {
    const items = STATS.map((s, ci) => ({ ci, s })).filter((d) => d.s.premium !== null)
      .sort((a, b) => b.s.premium - a.s.premium)
      .map(({ ci, s }) => ({
        ci, v: s.premium,
        tip: `<b>${CAMPUSES[ci].name}</b><br>Within 1 mi: ${fmt$(s.nearMed)}/sq ft (${fmtN(s.nNear)} sales)<br>4+ mi: ${fmt$(s.farMed)}/sq ft (${fmtN(s.nFar)} sales)<br>Click to select`,
      }));
    hbar("leader-chart", items, { valueFmt: fmtPct, axisFmt: (v) => Math.round(v * 100) + "%", step: 0.25, title: "Campus premium (price per sq ft, within 1 mile vs 4+ miles)" });
    const missing = STATS.map((s, ci) => s.premium === null ? CAMPUSES[ci].short : null).filter(Boolean);
    if (missing.length) {
      const p = document.createElement("p");
      p.style.cssText = "color:var(--text-muted);font-size:.85rem;margin:8px 0 0";
      p.textContent = `Not ranked (fewer than ${MIN_BIN_N} sales near or far): ${missing.join(", ")}.`;
      document.getElementById("leader-chart").appendChild(p);
    }
  }

  /* ---------------- 4. budget simulator ---------------- */
  const budgetEl = document.getElementById("budget");
  const bedsEl = document.getElementById("beds");
  function drawBudget() {
    const budget = +budgetEl.value, beds = +bedsEl.value;
    document.getElementById("budget-out").textContent = fmt$(budget);
    const cards = STATS.map((s, ci) => {
      const pool = s.rows.filter((r) => r.beds !== null && r.beds >= beds);
      const fit = pool.filter((r) => r.price <= budget);
      const sq = fit.filter((r) => r.sqft).map((r) => r.sqft);
      return {
        ci, n: fit.length, pool: pool.length,
        sqft: sq.length ? median(sq) : null,
        miles: fit.length ? median(fit.map((r) => r.miles)) : null,
        year: fit.length ? median(fit.filter((r) => r.year).map((r) => r.year)) : null,
        share: pool.length ? fit.length / pool.length : 0,
      };
    }).sort((a, b) => (b.sqft ?? -1) - (a.sqft ?? -1));

    document.getElementById("budget-grid").innerHTML = cards.map((c) => {
      const cls = ["bcard", c.ci === state.campus ? "selected" : "", c.n ? "" : "empty"].join(" ");
      if (!c.n) return `<div class="${cls}"><h3>${CAMPUSES[c.ci].short}</h3><div class="big">None</div>
        <dl><dt>Sales that fit</dt><dd>0 of ${fmtN(c.pool)}</dd></dl></div>`;
      return `<div class="${cls}"><h3>${CAMPUSES[c.ci].short}</h3>
        <div class="big">${c.sqft ? fmtN(c.sqft) : "n/a"} <small>sq ft typical</small></div>
        <dl>
          <dt>Miles to campus</dt><dd>${c.miles.toFixed(1)}</dd>
          <dt>Year built</dt><dd>${c.year ? Math.round(c.year) : "n/a"}</dd>
          <dt>Sales that fit</dt><dd>${fmtN(c.n)} of ${fmtN(c.pool)}</dd>
        </dl>
        <div class="share" title="${Math.round(c.share * 100)}% of ${beds}+ bedroom sales fit this budget"><i style="width:${(c.share * 100).toFixed(1)}%"></i></div>
      </div>`;
    }).join("");
  }
  budgetEl.addEventListener("input", drawBudget);
  bedsEl.addEventListener("change", drawBudget);

  /* ---------------- 5. market heat ---------------- */
  function drawHeat() {
    const items = STATS.map((s, ci) => ({ ci, s })).filter((d) => d.s.medDom !== null)
      .sort((a, b) => a.s.medDom - b.s.medDom)
      .map(({ ci, s }) => ({
        ci, v: s.medDom,
        tip: `<b>${CAMPUSES[ci].name}</b><br>Median ${s.medDom} days, listing to contract<br>${fmtN(s.nDom)} of ${fmtN(s.n)} sales have both dates<br>Click to select`,
      }));
    hbar("heat-chart", items, { valueFmt: (v) => v + (v === 1 ? " day" : " days"), axisFmt: (v) => v, step: 5, title: "Median days on market (listing date to contract date)" });
  }

  /* ---------------- 6. rules ---------------- */
  function drawRules() {
    const r = DATA.rules;
    document.getElementById("hero-count").textContent = fmtN(r.kept_rows);
    const items = [
      `<strong>Source.</strong> ${fmtN(r.total_rows)} home sales from the College-town home sales dataset (v1.0), sold between ${r.sale_date_min} and ${r.sale_date_max}.`,
      `<strong>Price rule.</strong> Kept sales from ${fmt$(r.price_min)} to ${fmt$(r.price_max)}. Removed ${r.dropped_below_min} sales below (non-market transfers or errors, one at $0) and ${r.dropped_above_max} above (extreme outliers up to $81.5M). ${fmtN(r.kept_rows)} sales remain.`,
      `<strong>Price per square foot.</strong> Only when living area is between ${fmtN(r.sqft_min)} and ${fmtN(r.sqft_max)} sq ft (${fmtN(r.rows_with_price_per_sqft)} sales). Some rows list 0 sq ft, which would divide by zero.`,
      `<strong>Medians, not averages.</strong> Prices are skewed, so every summary on this page is a median.`,
      `<strong>Days on market</strong> = contract date minus list date, only for the ${fmtN(r.rows_with_days_on_market)} sales that have both. A missing date is not treated as zero, and closing time is not included.`,
      `<strong>Campus landmark.</strong> The dataset gives each sale's straight-line miles to its nearest campus landmark but not the landmark's location. We recovered each landmark by finding the point whose distance to every sale best matches the dataset's miles_to_campus (largest mismatch about 0.05 miles, the rounding in the data).`,
      `<strong>Distance bands.</strong> The gravity curve plots a band only if it has at least ${MIN_BIN_N} sales. The campus premium compares sales within ${NEAR_MAX} mile to sales ${FAR_MIN} or more miles away.`,
      `<strong>Not used.</strong> <code>home_type</code> is unreliable, so homes are not split by type. Rows are never deduplicated by street address; condo units can share one.`,
    ];
    document.getElementById("rules-list").innerHTML = items.map((t) => `<li>${t}</li>`).join("");
  }

  /* ---------------- boot ---------------- */
  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((raw) => {
      DATA = raw;
      prepare(raw);
      buildPicker();
      initMap();
      drawRules();
      select(state.campus);
      document.getElementById("loading").classList.add("done");
    })
    .catch((err) => {
      document.getElementById("loading").textContent = "Could not load the data (" + err.message + ").";
    });
})();
