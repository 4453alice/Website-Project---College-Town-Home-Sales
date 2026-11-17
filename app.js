/* Campus Gravity dashboard (cream editorial collage edition).
 * Every number on the page is computed here, in the browser, from
 * site_points.json (built by build_site_data.py from the original dataset).
 */
(() => {
  "use strict";

  const DATA_URL = "site_points.json";
  const MILE_M = 1609.344;
  const RINGS = [1, 2, 4, 8];
  const BIN_EDGES = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 16]; // miles
  const MIN_BIN_N = 15;      // a distance band needs at least this many sales
  const NEAR_MAX = 1;        // "near campus" = within 1 mile
  const FAR_MIN = 4;         // "far" = 4 miles or more
  const REFERENCE = "Illinois";
  // One-hue ramp for price per sq ft on the light map: light = lower, dark = higher
  const RAMP = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"];
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const AERIAL = ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}";

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

  /* ---------------- aerial photo crops ---------------- */
  // Fills a circular element with aerial imagery centered on (lat, lon).
  function aerial(elm, lat, lon, z, size) {
    elm.querySelectorAll("img").forEach((i) => i.remove());
    const n = 2 ** z;
    const px = ((lon + 180) / 360) * n * 256;
    const latR = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * 256;
    const x0 = px - size / 2, y0 = py - size / 2;
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + size) / 256); tx++) {
      for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + size) / 256); ty++) {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => img.remove();
        img.src = AERIAL.replace("{z}", z).replace("{x}", tx).replace("{y}", ty);
        img.style.left = tx * 256 - x0 + "px";
        img.style.top = ty * 256 - y0 + "px";
        elm.prepend(img);
      }
    }
  }

  /* ---------------- collage picker ---------------- */
  // Loose cluster of circles, like photos dropped on a table. Size follows number of sales.
  const SLOTS = [[50, 46], [36, 36], [63, 34], [41, 63], [60, 62], [49, 19], [26, 56], [74, 50], [11, 26], [89, 24], [86, 80]];
  let lenses = [], annot;

  function buildCollage() {
    const box = document.getElementById("collage");
    const maxN = Math.max(...STATS.map((s) => s.n));
    const order = CAMPUSES.map((c, i) => i).sort((a, b) => STATS[b].n - STATS[a].n);
    lenses = order.map((ci, k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lens";
      btn.setAttribute("aria-label", CAMPUSES[ci].name);
      btn.innerHTML = `<span class="lens-name">${CAMPUSES[ci].short}</span>`;
      btn.addEventListener("click", () => {
        select(ci);
        document.getElementById("map-section").scrollIntoView({ behavior: "smooth" });
      });
      btn.addEventListener("mousemove", (e) => showTip(`<b>${CAMPUSES[ci].name}</b><br>${fmtN(STATS[ci].n)} sales`, e));
      btn.addEventListener("mouseleave", hideTip);
      box.appendChild(btn);
      return { ci, btn, base: 74 + 92 * Math.sqrt(STATS[ci].n / maxN), slot: SLOTS[k] };
    });
    annot = document.createElement("div");
    annot.className = "annot";
    annot.innerHTML = "<span></span>";
    box.appendChild(annot);
    layoutCollage();
    addEventListener("resize", layoutCollage);
  }

  function layoutCollage() {
    const box = document.getElementById("collage");
    const W = box.clientWidth, H = box.clientHeight;
    const scale = Math.min(1, W / 980);
    const items = lenses.map((l) => ({ l, d: l.base * scale, x: (l.slot[0] / 100) * W, y: (l.slot[1] / 100) * H }));
    // nudge circles apart until none overlap, keeping them inside the box
    for (let it = 0; it < 300; it++) {
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const A = items[a], B = items[b];
          const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy) || 1;
          const min = (A.d + B.d) / 2 + 16;
          if (dist < min) {
            const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist;
            A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push;
          }
        }
      }
      items.forEach((i) => {
        i.x = Math.max(i.d / 2 + 4, Math.min(W - i.d / 2 - 4, i.x));
        i.y = Math.max(i.d / 2 + 26, Math.min(H - i.d / 2 - 4, i.y));
      });
    }
    items.forEach(({ l, d, x, y }) => {
      Object.assign(l.btn.style, { width: d + "px", height: d + "px", left: x - d / 2 + "px", top: y - d / 2 + "px" });
      l.d = d; l.x = x; l.y = y;
      if (l.drawn !== Math.round(d)) {
        const c = CAMPUSES[l.ci];
        aerial(l.btn, c.lat, c.lon, 15, d);
        l.drawn = Math.round(d);
      }
    });
    placeAnnot();
  }

  function placeAnnot() {
    const l = lenses.find((x) => x.ci === state.campus);
    if (!l || !annot) return;
    const pad = 9;
    Object.assign(annot.style, {
      left: l.x - l.d / 2 - pad + "px", top: l.y - l.d / 2 - pad + "px",
      width: l.d + pad * 2 + "px", height: l.d + pad * 2 + "px",
    });
    annot.querySelector("span").textContent = `(selected) ${CAMPUSES[state.campus].short}`;
  }

  function buildBar() {
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
    placeAnnot();
    drawMap();
    drawKpis();
    drawCurve();
    drawLeaderboard();
    drawBudget();
    drawHeat();
  }

  /* ---------------- 01 map ---------------- */
  function initMap() {
    map = L.map("map", { preferCanvas: true, zoomControl: false, scrollWheelZoom: false, attributionControl: false });
    const start = CAMPUSES[state.campus];
    map.fitBounds(L.latLng(start.lat, start.lon).toBounds(4 * MILE_M * 2));
    L.tileLayer(ESRI + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
    map.createPane("labels");
    map.getPane("labels").style.zIndex = 650;
    map.getPane("labels").style.pointerEvents = "none";
    L.tileLayer(ESRI + "Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "labels", opacity: 0.7 }).addTo(map);
    map.on("click", () => map.scrollWheelZoom.enable());
    document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn());
    document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut());
    pointLayer = L.layerGroup().addTo(map);
    ringLayer = L.layerGroup().addTo(map);

    const ticks = BREAKS.map((b) => "$" + Math.round(b));
    document.getElementById("map-legend").innerHTML =
      `<span class="tag">(key)</span> price per square foot, each shade holds one sixth of all sales
      <div class="ramp">${RAMP.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
      <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>
      <div style="margin-top:6px;color:var(--muted)">lighter = less per sq ft &middot; darker = more &middot; gray = size not usable</div>`;
  }

  function drawMap() {
    const ci = state.campus, camp = CAMPUSES[ci], st = STATS[ci];
    pointLayer.clearLayers();
    ringLayer.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    const rows = st.rows.slice().sort((a, b) => (a.ppsf || 0) - (b.ppsf || 0));
    rows.forEach((s) => {
      const m = L.circleMarker([s.lat, s.lon], {
        renderer, radius: 3.2, stroke: false,
        fillColor: s.ppsf ? colorFor(s.ppsf) : "#a39a8c", fillOpacity: s.ppsf ? 0.9 : 0.5,
      });
      m.bindPopup(() => `<b>${fmt$(s.price)}</b><br>${s.city}<br>
        ${s.ppsf ? fmt$(s.ppsf) + " per sq ft &middot; " + fmtN(s.sqft) + " sq ft<br>" : ""}
        ${s.beds ?? "?"} bd / ${s.baths ?? "?"} ba &middot; built ${s.year ?? "?"}<br>
        ${s.miles} mi to campus &middot; sold ${s.date ?? "n/a"}
        ${s.dom !== null ? "<br>" + s.dom + " days on market" : ""}`);
      pointLayer.addLayer(m);
    });

    RINGS.forEach((r) => {
      L.circle([camp.lat, camp.lon], {
        radius: r * MILE_M, color: "#2350d8", weight: 1, opacity: 0.6,
        dashArray: "3 5", fill: false, interactive: false,
      }).addTo(ringLayer);
      const north = [camp.lat + (r * MILE_M) / 111320, camp.lon];
      L.marker(north, {
        interactive: false,
        icon: L.divIcon({ className: "ring-label", html: `(${r} mi)`, iconSize: [44, 14], iconAnchor: [-4, 16] }),
      }).addTo(ringLayer);
    });
    // annotation box on the landmark, the same idea as the box in the collage
    L.marker([camp.lat, camp.lon], {
      interactive: false,
      icon: L.divIcon({ className: "campus-mark", html: `<span>(campus) ${camp.short}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(ringLayer);
    L.circleMarker([camp.lat, camp.lon], { radius: 3, stroke: false, fillColor: "#2350d8", fillOpacity: 1, interactive: false }).addTo(ringLayer);

    map.flyToBounds(L.latLng(camp.lat, camp.lon).toBounds(3.2 * MILE_M * 2), { duration: 1.1 });
  }

  function drawKpis() {
    const ci = state.campus, st = STATS[ci];
    const k = (label, value, sub) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    document.getElementById("kpis").innerHTML = [
      k("(sales)", fmtN(st.n), "after the cleaning rules"),
      k("(median price)", fmtK(st.medPrice), "all sales kept"),
      k("(median $ / sq ft)", fmt$(st.medPpsf), "usable living area only"),
      k("(campus premium)", st.premium === null ? "n/a" : fmtPct(st.premium),
        st.premium === null ? "too few sales near or far" : `${fmt$(st.nearMed)} within 1 mi vs ${fmt$(st.farMed)} at 4+ mi`),
      k("(days on market)", st.medDom === null ? "n/a" : fmtN(st.medDom), `median, ${fmtN(st.nDom)} sales with both dates`),
    ].join("");
    document.getElementById("insight").innerHTML = insight(ci);
  }

  // One computed sentence about the selected campus's pull
  function insight(ci) {
    const st = STATS[ci], name = CAMPUSES[ci].short;
    if (st.premium === null) {
      return `${name} has too few sales ${st.nNear < MIN_BIN_N ? "within 1 mile" : "4 or more miles out"} (${fmtN(Math.min(st.nNear, st.nFar))}) to measure its pull fairly.`;
    }
    const ranked = STATS.map((s, i) => ({ i, p: s.premium })).filter((d) => d.p !== null).sort((a, b) => b.p - a.p);
    const pos = ranked.findIndex((d) => d.i === ci) + 1;
    const negatives = ranked.filter((d) => d.p < 0).length;
    if (st.premium < 0) {
      return `<b>anti-gravity.</b> in ${name}, homes within a mile of campus cost <b>${Math.round(-st.premium * 100)}% less</b> per square foot than homes 4+ miles out` +
        (negatives === 1 ? `, the only one of ${ranked.length} campuses where the pull runs backwards.` : `. ${negatives} of ${ranked.length} campuses run backwards like this.`);
    }
    const place = pos === 1 ? "the strongest pull" : pos === ranked.length ? "the weakest pull" : `number ${pos}`;
    return `in ${name}, homes within a mile of campus cost <b>${Math.round(st.premium * 100)}% more</b> per square foot than homes 4+ miles out: ${place} of ${ranked.length} campuses.`;
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
  const rank = (i) => i === state.campus ? 2 : CAMPUSES[i].short === REFERENCE ? 1 : 0;
  function seriesColor(ci) {
    return ["var(--sand)", "var(--terra)", "var(--blue)"][rank(ci)];
  }

  /* ---------------- 02 gravity curve ---------------- */
  function drawCurve() {
    const box = document.getElementById("curve-chart");
    box.innerHTML = "";
    const ref = CAMPUSES.findIndex((c) => c.short === REFERENCE);
    const legend = document.createElement("div");
    legend.className = "legend-row";
    legend.innerHTML = `<span style="--c:var(--blue)">${CAMPUSES[state.campus].short} (selected)</span>` +
      (ref !== state.campus ? `<span style="--c:var(--terra)">${REFERENCE} (reference)</span>` : "") +
      `<span style="--c:var(--sand)">other campuses</span>`;
    box.appendChild(legend);

    const W = 1000, H = 440, m = { t: 36, r: 120, b: 50, l: 64 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Line chart of median price per square foot by distance from campus" }, box);
    const maxY = niceMax(Math.max(...STATS.flatMap((s) => s.bins.map((b) => b.y))), 100);
    const maxX = 15;
    const x = (v) => m.l + (v / maxX) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / maxY) * (H - m.t - m.b);

    const grid = el("g", { class: "grid" }, svg);
    for (let v = 100; v <= maxY; v += 100) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid);
    }
    for (let v = 0; v <= maxY; v += 100) {
      el("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = "$" + v;
    }
    el("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
    for (let v = 0; v <= maxX; v += 1) {
      if (v % 2 && v !== 1) continue;
      el("text", { x: x(v), y: H - m.b + 20, "text-anchor": "middle" }, svg).textContent = v;
    }
    el("text", { x: (m.l + W - m.r) / 2, y: H - 8, "text-anchor": "middle", class: "axis-title" }, svg).textContent = "miles from the campus landmark, in a straight line";
    el("text", { x: m.l - 10, y: 14, "text-anchor": "end", class: "axis-title" }, svg).textContent = "$ / sq ft";

    const order = CAMPUSES.map((c, i) => i).sort((a, b) => rank(a) - rank(b));
    const labels = [];
    order.forEach((ci) => {
      const bins = STATS[ci].bins;
      if (!bins.length) return;
      const color = seriesColor(ci), hl = rank(ci) > 0;
      const d = bins.map((b, j) => (j ? "L" : "M") + x(b.x) + "," + y(b.y)).join("");
      el("path", { d, fill: "none", stroke: color, "stroke-width": hl ? 2 : 1.25, "stroke-linejoin": "round" }, svg);
      const hit = el("path", { d, fill: "none", stroke: "transparent", "stroke-width": 14, style: "cursor:pointer" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(`<b>${CAMPUSES[ci].name}</b><br>click to select`, e));
      hit.addEventListener("mouseleave", hideTip);
      hit.addEventListener("click", () => select(ci));
      if (hl) {
        bins.forEach((b) => {
          el("circle", { cx: x(b.x), cy: y(b.y), r: 5, fill: "var(--cream)", stroke: color, "stroke-width": 2 }, svg);
          const h = el("circle", { cx: x(b.x), cy: y(b.y), r: 12, class: "hit" }, svg);
          h.addEventListener("mousemove", (e) => showTip(
            `<b>${CAMPUSES[ci].short}</b>, ${b.lo} to ${b.hi} mi<br>median ${fmt$(b.y)} per sq ft<br>${fmtN(b.n)} sales`, e));
          h.addEventListener("mouseleave", hideTip);
        });
        const last = bins[bins.length - 1];
        labels.push({ ci, x: x(last.x) + 10, y: y(last.y) + 5, color });
      }
    });
    if (labels.length === 2 && Math.abs(labels[0].y - labels[1].y) < 18) {
      const [a, b] = labels[0].y < labels[1].y ? labels : [labels[1], labels[0]];
      a.y -= 9; b.y += 9;
    }
    labels.forEach((l) => {
      el("text", { x: l.x, y: l.y, class: "direct-label", fill: l.color, style: `fill:${l.color}` }, svg).textContent = CAMPUSES[l.ci].short;
    });

    const headers = BIN_EDGES.slice(0, -1).map((lo, i) => `${lo} to ${BIN_EDGES[i + 1]}`);
    const rows = CAMPUSES.map((c, ci) => {
      const cells = BIN_EDGES.slice(0, -1).map((lo) => {
        const b = STATS[ci].bins.find((bb) => bb.lo === lo);
        return `<td>${b ? fmt$(b.y) : ""}</td>`;
      }).join("");
      return `<tr><td>${c.short}</td>${cells}</tr>`;
    }).join("");
    document.getElementById("curve-table").innerHTML =
      `<table><thead><tr><th>campus (miles)</th>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
       <p>Blank = fewer than ${MIN_BIN_N} sales in that band.</p>`;
  }

  /* ---------------- lollipop chart helper ---------------- */
  function lollipop(boxId, items, { valueFmt, axisFmt, step, title }) {
    const box = document.getElementById(boxId);
    box.innerHTML = "";
    const rowH = 36, W = 1000, m = { t: 8, r: 80, b: 46, l: 130 };
    const H = m.t + m.b + items.length * rowH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, box);
    const minV = Math.min(0, ...items.map((d) => d.v));
    const maxV = niceMax(Math.max(...items.map((d) => d.v)), step);
    const lo = minV < 0 ? -niceMax(-minV, step) : 0;
    const x = (v) => m.l + ((v - lo) / (maxV - lo)) * (W - m.l - m.r);
    const grid = el("g", { class: "grid" }, svg);
    for (let v = lo; v <= maxV + 1e-9; v += step) {
      if (Math.abs(v) > 1e-9) el("line", { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }, grid);
      el("text", { x: x(v), y: H - m.b + 20, "text-anchor": "middle" }, svg).textContent = axisFmt(v);
    }
    el("line", { x1: x(0), x2: x(0), y1: m.t, y2: H - m.b, class: "baseline" }, svg);
    el("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle", class: "axis-title" }, svg).textContent = title;
    items.forEach((d, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      const color = seriesColor(d.ci), hl = rank(d.ci) > 0;
      el("text", { x: m.l - 14, y: cy + 5, "text-anchor": "end", class: "row-label" + (d.ci === state.campus ? " sel" : "") }, svg).textContent = CAMPUSES[d.ci].short;
      el("line", { x1: x(0), x2: x(d.v), y1: cy, y2: cy, stroke: hl ? color : "var(--ink-2)", "stroke-width": hl ? 2 : 1.25 }, svg);
      el("circle", { cx: x(d.v), cy, r: hl ? 7 : 5.5, fill: hl ? color : "var(--cream)", stroke: hl ? color : "var(--ink-2)", "stroke-width": 1.5 }, svg);
      el("text", { x: d.v >= 0 ? x(d.v) + 14 : x(d.v) - 14, y: cy + 4, "text-anchor": d.v >= 0 ? "start" : "end", class: "val" }, svg).textContent = valueFmt(d.v);
      const hit = el("rect", { x: 0, y: m.t + i * rowH, width: W, height: rowH, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(d.tip, e));
      hit.addEventListener("mouseleave", hideTip);
      hit.addEventListener("click", () => select(d.ci));
    });
  }

  /* ---------------- 03 leaderboard ---------------- */
  function drawLeaderboard() {
    const items = STATS.map((s, ci) => ({ ci, s })).filter((d) => d.s.premium !== null)
      .sort((a, b) => b.s.premium - a.s.premium)
      .map(({ ci, s }) => ({
        ci, v: s.premium,
        tip: `<b>${CAMPUSES[ci].name}</b><br>within 1 mi: ${fmt$(s.nearMed)}/sq ft (${fmtN(s.nNear)} sales)<br>4+ mi: ${fmt$(s.farMed)}/sq ft (${fmtN(s.nFar)} sales)<br>click to select`,
      }));
    lollipop("leader-chart", items, { valueFmt: fmtPct, axisFmt: (v) => Math.round(v * 100) + "%", step: 0.25, title: "campus premium: price per sq ft within 1 mile vs 4+ miles" });
    const missing = STATS.map((s, ci) => s.premium === null ? CAMPUSES[ci].short : null).filter(Boolean);
    if (missing.length) {
      const p = document.createElement("p");
      p.style.cssText = "color:var(--muted);font-size:.85rem;margin:8px 0 0 130px";
      p.textContent = `Not ranked (fewer than ${MIN_BIN_N} sales near or far): ${missing.join(", ")}.`;
      document.getElementById("leader-chart").appendChild(p);
    }
  }

  /* ---------------- 04 budget simulator ---------------- */
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
      };
    }).sort((a, b) => (b.sqft ?? -1) - (a.sqft ?? -1));

    const grid = document.getElementById("budget-grid");
    grid.innerHTML = cards.map((c) => {
      const cls = ["bcard", c.ci === state.campus ? "selected" : "", c.n ? "" : "empty"].join(" ");
      const body = c.n
        ? `<div class="big">${c.sqft ? fmtN(c.sqft) : "n/a"} <small>sq ft</small></div>
           <p>${c.miles.toFixed(1)} mi out &middot; built ${c.year ? Math.round(c.year) : "n/a"}</p>
           <p>${Math.round((c.n / c.pool) * 100)}% of ${beds}+ bed sales fit</p>`
        : `<div class="big">none</div><p>0 of ${fmtN(c.pool)} sales fit</p>`;
      return `<div class="${cls}"><div class="lens" data-ci="${c.ci}"></div><div><h3>${CAMPUSES[c.ci].short}</h3>${body}</div></div>`;
    }).join("");
    grid.querySelectorAll(".lens").forEach((l) => {
      const c = CAMPUSES[+l.dataset.ci];
      aerial(l, c.lat, c.lon, 15, 92);
    });
  }
  budgetEl.addEventListener("input", drawBudget);
  bedsEl.addEventListener("change", drawBudget);

  /* ---------------- 05 market heat ---------------- */
  function drawHeat() {
    const items = STATS.map((s, ci) => ({ ci, s })).filter((d) => d.s.medDom !== null)
      .sort((a, b) => a.s.medDom - b.s.medDom)
      .map(({ ci, s }) => ({
        ci, v: s.medDom,
        tip: `<b>${CAMPUSES[ci].name}</b><br>median ${s.medDom} days, listing to contract<br>${fmtN(s.nDom)} of ${fmtN(s.n)} sales have both dates<br>click to select`,
      }));
    lollipop("heat-chart", items, { valueFmt: (v) => v + (v === 1 ? " day" : " days"), axisFmt: (v) => v, step: 5, title: "median days on market, listing date to contract date" });
  }

  /* ---------------- 06 rules ---------------- */
  function drawRules() {
    const r = DATA.rules;
    document.getElementById("hero-count").textContent = fmtN(r.kept_rows);
    const items = [
      `<strong>the source.</strong> ${fmtN(r.total_rows)} home sales from the College-town home sales dataset (v1.0), sold between ${r.sale_date_min} and ${r.sale_date_max}.`,
      `<strong>a price rule.</strong> Kept sales from ${fmt$(r.price_min)} to ${fmt$(r.price_max)}. Removed ${r.dropped_below_min} sales below (non-market transfers or errors, one at $0) and ${r.dropped_above_max} above (extreme outliers up to $81.5M). ${fmtN(r.kept_rows)} sales remain.`,
      `<strong>price per square foot.</strong> Only when living area is between ${fmtN(r.sqft_min)} and ${fmtN(r.sqft_max)} sq ft (${fmtN(r.rows_with_price_per_sqft)} sales). Some rows list 0 sq ft, which would divide by zero.`,
      `<strong>medians, not averages.</strong> Prices are skewed, so every summary on this page is a median.`,
      `<strong>days on market</strong> means contract date minus list date, only for the ${fmtN(r.rows_with_days_on_market)} sales that have both. A missing date is not treated as zero, and closing time is not included.`,
      `<strong>finding each campus.</strong> The dataset gives every sale's straight-line miles to its campus landmark but not where the landmark is. We recovered each landmark as the point whose distance to every sale best matches the dataset (largest mismatch about 0.05 miles, the rounding in the data).`,
      `<strong>distance bands.</strong> The gravity curve plots a band only if it has at least ${MIN_BIN_N} sales. The campus premium compares sales within ${NEAR_MAX} mile with sales ${FAR_MIN} or more miles away.`,
      `<strong>left out on purpose.</strong> <code>home_type</code> is unreliable, so homes are not split by type. Rows are never deduplicated by street address; condo units can share one.`,
      `<strong>the pictures.</strong> The circular aerial photos are Esri World Imagery centered on each recovered campus landmark. They decorate; every number comes from the dataset.`,
    ];
    document.getElementById("rules-list").innerHTML = items.map((t) => `<li>${t}</li>`).join("");
  }

  /* ---------------- boot ---------------- */
  fetch(DATA_URL)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((raw) => {
      DATA = raw;
      prepare(raw);
      buildBar();
      buildCollage();
      initMap();
      drawRules();
      select(state.campus);
      document.getElementById("loading").classList.add("done");
    })
    .catch((err) => {
      document.getElementById("loading").textContent = "Could not load the data (" + err.message + ").";
    });
})();
