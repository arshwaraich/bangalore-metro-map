(() => {
  const STATUS = {
    open: "Running",
    soon: "Opening soon",
    construction: "Under construction",
    approved: "Approved, not yet built",
    proposed: "Proposed, awaiting approval",
  };
  const THEMES = {
    light: { style: "https://tiles.openfreemap.org/styles/positron", halo: "#ffffff", ink: "#1d1f23", ink2: "#5d626b", dim: 0.16 },
    dark: { style: "https://tiles.openfreemap.org/styles/dark", halo: "#16181c", ink: "#eceef1", ink2: "#a5abb5", dim: 0.2 },
  };
  // base-map layers that compete with the metro: OSM's own transit lines and busy road labels
  const HIDE = /^(railway_transit|railway_minor|railway_service|road_oneway|highway-shield|road_shield|highway-name-path|highway-name-minor)/;
  const phone = matchMedia("(max-width: 640px)");

  /* ---------- theme ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const ICONS = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  };
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  let mode = store.get("theme") || "auto";
  const themeName = () => (mode === "dark" || (mode === "auto" && sysDark.matches) ? "dark" : "light");
  const btn = document.getElementById("theme");

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const chip = (s) => {
    const text = s.status === "open" ? "Running"
      : s.status === "soon" ? `Opens ${s.eta.replace(/ 20\d\d$/, "")}`
      : `est. ${s.eta}`;
    return `<span class="chip ${s.status}" title="${esc(STATUS[s.status])}">${esc(text)}</span>`;
  };

  /* ---------- panel ---------- */
  const panel = document.getElementById("panel");
  const toggle = document.getElementById("panel-toggle");
  const setCollapsed = (c) => { panel.classList.toggle("collapsed", c); toggle.setAttribute("aria-expanded", String(!c)); };
  setCollapsed(phone.matches);
  toggle.addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));

  const baseCache = {};
  const getBase = (name) => (baseCache[name] ||= fetch(THEMES[name].style).then((r) => r.json()));

  Promise.all([fetch("data/metro.geojson").then((r) => r.json()), getBase(themeName())]).then(([data]) => init(data));

  function init(data) {
    document.getElementById("asof").textContent = `Bengaluru · status as of ${fmtDate(data.asOf)}`;
    const lineInfo = Object.fromEntries(data.lines.map((l) => [l.id, l]));
    let active = null;

    const W = (a, b) => ["interpolate", ["exponential", 1.5], ["zoom"], 10, a, 15, b];
    const isStatus = (...s) => ["in", ["get", "status"], ["literal", s]];
    const lineOpacity = (base) => (active ? ["case", ["==", ["get", "line"], active], base, THEMES[themeName()].dim] : base);
    const stOpacity = (base) => (active ? ["case", ["in", `,${active},`, ["get", "lineIds"]], base, THEMES[themeName()].dim] : base);

    // filters see integer tile zooms only
    const labelFilter = () => ["all", ["==", ["get", "kind"], "station"],
      ["any", ["get", "major"], [">=", ["zoom"], ["case", ["get", "planned"], 13, 12]],
        ...(active ? [["in", `,${active},`, ["get", "lineIds"]]] : [])]];

    function metroLayers(t) {
      const L = (f) => ["all", ["==", ["get", "kind"], "line"], f];
      return [
        { id: "m-casing", type: "line", source: "metro", filter: ["==", ["get", "kind"], "line"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": t.halo, "line-width": W(5, 12), "line-opacity": lineOpacity(0.85) } },
        { id: "m-plan", type: "line", source: "metro", filter: L(isStatus("approved", "proposed")),
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": ["get", "color"], "line-width": W(2.2, 5), "line-dasharray": [0.01, 2.2], "line-opacity": lineOpacity(0.85) } },
        { id: "m-build", type: "line", source: "metro", filter: L(isStatus("soon", "construction")),
          layout: { "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": W(2.8, 7), "line-dasharray": [2, 1.2], "line-opacity": lineOpacity(1) } },
        { id: "m-open", type: "line", source: "metro", filter: L(isStatus("open")),
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": ["get", "color"], "line-width": W(3, 7.5), "line-opacity": lineOpacity(1) } },
        { id: "m-hit", type: "line", source: "metro", filter: ["==", ["get", "kind"], "line"],
          paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 } },
        { id: "m-linename", type: "symbol", source: "metro", minzoom: 11, maxzoom: 13.5, filter: ["==", ["get", "kind"], "line"],
          layout: { "symbol-placement": "line", "symbol-spacing": 420, "text-field": ["get", "lineName"],
            "text-font": ["Noto Sans Bold"], "text-size": 11, "text-letter-spacing": 0.04, "text-padding": 6,
            "symbol-sort-key": ["match", ["get", "status"], "open", 0, "soon", 1, "construction", 1, 2] },
          paint: { "text-color": ["get", "color"], "text-halo-color": t.halo, "text-halo-width": 2, "text-opacity": lineOpacity(1) } },
        { id: "m-st", type: "circle", source: "metro", filter: ["==", ["get", "kind"], "station"],
          layout: { "circle-sort-key": ["-", 10, ["get", "prio"]] },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "inter"], 3.2, 2], 13, ["case", ["get", "inter"], 5.5, 4], 16, ["case", ["get", "inter"], 9, 7]],
            "circle-color": t.halo,
            "circle-stroke-color": ["case", ["get", "inter"], t.ink, ["get", "color"]],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 14, ["case", ["get", "inter"], 2.6, 2.2]],
            "circle-opacity": stOpacity(1), "circle-stroke-opacity": stOpacity(1),
          } },
        { id: "m-stlabel", type: "symbol", source: "metro", minzoom: 11,
          filter: labelFilter(),
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["case", ["get", "major"], ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, ["case", ["get", "major"], 11, 10.5], 15, ["case", ["get", "major"], 14, 13]],
            "text-variable-anchor": ["left", "right", "top", "bottom"],
            "text-radial-offset": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 0.9],
            "text-justify": "auto",
            "symbol-sort-key": ["get", "prio"],
            "text-padding": 3,
            "text-max-width": 9,
          },
          paint: { "text-color": ["case", ["get", "planned"], t.ink2, t.ink], "text-halo-color": t.halo, "text-halo-width": 1.6, "text-opacity": stOpacity(1) } },
      ];
    }

    async function buildStyle() {
      const name = themeName(), t = THEMES[name];
      const base = structuredClone(await getBase(name));
      base.layers = base.layers.filter((l) => !HIDE.test(l.id) && l["source-layer"] !== "poi");
      // base labels are for orientation only; keep them a step behind the metro
      for (const l of base.layers) if (l.type === "symbol") l.paint = { ...l.paint, "text-opacity": 0.7, "icon-opacity": 0.6 };
      // metro lines sit under the base map's place names; stations and their labels go on top
      const lastGeom = base.layers.map((l) => l.type !== "symbol").lastIndexOf(true);
      const ml = metroLayers(t);
      const under = ml.filter((l) => l.type === "line"), over = ml.filter((l) => l.type !== "line");
      base.layers.splice(lastGeom + 1, 0, ...under);
      base.layers.push(...over);
      base.sources.metro = { type: "geojson", data };
      return base;
    }

    const map = new maplibregl.Map({
      container: "map",
      ...(phone.matches ? { center: [77.6, 12.965], zoom: 11 }
        : { bounds: [[77.47, 12.84], [77.77, 13.07]], fitBoundsOptions: { padding: pad() } }),
      minZoom: 9.5, maxZoom: 17.5,
      maxBounds: [[77.1, 12.5], [78.1, 13.5]],
      attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    window.metroMap = map;
    buildStyle().then((s) => map.setStyle(s));

    function applyTheme() {
      if (mode === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.dataset.theme = mode;
      btn.innerHTML = ICONS[mode];
      btn.setAttribute("aria-label", `Theme: ${mode}. Switch theme`);
    }
    applyTheme();
    let shown = themeName();
    const restyle = () => { if (themeName() !== shown) { shown = themeName(); buildStyle().then((s) => map.setStyle(s)); } };
    btn.addEventListener("click", () => {
      mode = themeName() === "dark" ? "light" : "dark";
      if ((mode === "dark") === sysDark.matches) mode = "auto"; // matching the system means following it again
      store.set("theme", mode);
      applyTheme(); restyle();
    });
    sysDark.addEventListener("change", restyle);

    /* popups */
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px", offset: 10 });
    const swatch = (c) => `<span class="swatch" style="--c:${c}"></span>`;
    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ["m-st", "m-hit"] });
      if (!hits.length) return;
      const st = hits.find((f) => f.layer.id === "m-st");
      let html;
      if (st) {
        const p = st.properties, lines = JSON.parse(p.lines);
        html = `<div class="pop"><h3>${esc(p.name)}</h3>${lines.map((l) => {
          const li = lineInfo[l.line], sec = li.sections.find((s) => s.name === l.section);
          return `<div class="row">${swatch(li.color)}<div><b>${esc(li.name)}</b><small>${esc(STATUS[l.status])}${sec.eta ? ` · est. ${esc(sec.eta)}` : ""}</small></div></div>`;
        }).join("")}</div>`;
        popup.setLngLat(st.geometry.coordinates);
      } else {
        const seen = new Set(), rows = [];
        for (const f of hits) {
          const p = f.properties, k = p.section;
          if (seen.has(k)) continue; seen.add(k);
          rows.push(`<div class="row">${swatch(p.color)}<div><b>${esc(p.lineName)}</b><small>${esc(p.section)}</small>
            <small>${esc(STATUS[p.status])}${p.eta ? ` · est. ${esc(p.eta)}` : ""}${p.opened ? ` · opened ${esc(p.opened)}` : ""}</small>
            ${p.etaNote ? `<small class="note">${esc(p.etaNote)}</small>` : ""}</div></div>`);
        }
        html = `<div class="pop">${rows.join("")}</div>`;
        popup.setLngLat(e.lngLat);
      }
      popup.setHTML(html).addTo(map);
    });
    for (const id of ["m-st", "m-hit"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    /* panel list + highlighting */
    const ul = document.getElementById("lines");
    ul.innerHTML = data.lines.map((l) => `<li class="line" data-id="${l.id}" style="--c:${l.color}" tabindex="0" role="button">
      <div class="line-name"><span class="swatch"></span>${esc(l.name)}</div>
      ${l.sections.map((s) => `<div class="sec"><span class="sec-name">${esc(s.name)}</span>${chip(s)}</div>`).join("")}
    </li>`).join("");

    function restyleActive() {
      const ml = Object.fromEntries(metroLayers(THEMES[themeName()]).map((l) => [l.id, l]));
      for (const [id, layer] of Object.entries(ml)) {
        for (const [k, v] of Object.entries(layer.paint || {})) if (/opacity$/.test(k) && map.getLayer(id)) map.setPaintProperty(id, k, v);
      }
    }
    function setActive(id) {
      active = active === id ? null : id;
      ul.querySelectorAll(".line").forEach((li) => li.classList.toggle("active", li.dataset.id === active));
      restyleActive();
      if (map.getLayer("m-stlabel")) map.setFilter("m-stlabel", labelFilter());
      popup.remove();
      if (active) {
        const b = new maplibregl.LngLatBounds();
        for (const f of data.features) {
          if (f.properties.kind !== "line" || f.properties.line !== active) continue;
          const cs = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
          cs.forEach((c) => c.forEach((p) => b.extend(p)));
        }
        if (phone.matches) setCollapsed(true);
        map.fitBounds(b, { padding: pad(), duration: 700 });
      }
    }
    ul.addEventListener("click", (e) => { const li = e.target.closest(".line"); li && setActive(li.dataset.id); });
    ul.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault(); const li = e.target.closest(".line"); li && setActive(li.dataset.id);
    });

    function pad() {
      return phone.matches ? { top: 96, bottom: 84, left: 20, right: 20 } : { top: 90, bottom: 30, left: 30, right: 390 };
    }
  }
})();
