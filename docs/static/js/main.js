/* Beyond Rigid Hands: page behavior (3-D views, charts, copy button, navigation). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const SWATCH = { g: "var(--green)", r: "var(--red)", fn: "#466ec8", fp: "#f08c28" };

  /** run fn once, when the element comes near the viewport */
  function whenNear(node, fn) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: "700px 0px" });
    io.observe(node);
  }

  // ------------------------------------------------------------------ tooltip (hover and keyboard focus)
  const tip = $("#tip");
  function tipShow(target, value, label, x, y) {
    tip.textContent = "";
    tip.appendChild(el("b", "", value)); tip.appendChild(el("span", "", label));
    tip.hidden = false;
    const r = target.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = x === undefined ? r.left + r.width / 2 : x, top = y === undefined ? r.top : y;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, cx - tw / 2)) + "px";
    tip.style.top = Math.max(8, top - th - 10) + "px";
  }
  const tipHide = () => { tip.hidden = true; };
  function tipBind(node, value, label) {
    node.tabIndex = 0;
    node.setAttribute("aria-label", label + ": " + value);
    node.addEventListener("pointerenter", () => tipShow(node, value, label));
    node.addEventListener("pointerleave", tipHide);
    node.addEventListener("focus", () => tipShow(node, value, label));
    node.addEventListener("blur", tipHide);
  }
  window.addEventListener("scroll", tipHide, { passive: true });

  function tools(root, viewers) {
    viewers = [].concat(viewers);
    $$(".tool", root).forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "reset") { viewers.forEach((v) => v.resetView()); return; }
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (act === "object") viewers.forEach((v) => v.setObjectVisible(on));
      if (act === "hand") viewers.forEach((v) => v.setHandOpacity(on ? 0.55 : 0));
    }));
  }
  function thumbs(box, ids, show) {
    if (!box || ids.length < 2) return;
    ids.forEach((id) => {
      const b = el("button", "thumb"); b.type = "button"; b.dataset.id = id;
      b.setAttribute("aria-label", "Example " + (ids.indexOf(id) + 1));
      const im = el("img"); im.src = "static/img/thumb_" + id + ".webp"; im.alt = ""; im.width = 50; im.height = 50; im.loading = "lazy";
      b.appendChild(im); b.addEventListener("click", () => show(id)); box.appendChild(b);
    });
  }
  const mark = (box, id) => box && $$(".thumb", box).forEach((t) => t.setAttribute("aria-pressed", t.dataset.id === id ? "true" : "false"));

  // ------------------------------------------------------------------ the lift, stage by stage
  function setupLift(stage) {
    const canvas = $("canvas", stage), ids = stage.dataset.scenes.split(","), steps = $$(".step", stage);
    const out = { on: $('[data-readout="on"]', stage), ins: $('[data-readout="ins"]', stage) };
    const loading = $(".loading", stage), box = $("[data-thumbs]", stage), playBtn = $('[data-act="play"]', stage);
    const shown = { on: 0, ins: 0 };
    let anim = 0, viewer, touring = false, timer = 0;

    function onState(i, sc) {
      steps.forEach((b, k) => b.setAttribute("aria-pressed", k === i ? "true" : "false"));
      const to = sc.states[i].stats, from = { on: shown.on, ins: shown.ins }, t0 = performance.now();
      cancelAnimationFrame(anim);
      (function tick() {
        const k = Math.max(0, Math.min(1, (performance.now() - t0) / 700)), e = 1 - Math.pow(1 - k, 3);
        shown.on = from.on + (to.on - from.on) * e; shown.ins = from.ins + (to.ins - from.ins) * e;
        out.on.textContent = Math.round(shown.on); out.ins.textContent = Math.round(shown.ins);
        if (k < 1) anim = requestAnimationFrame(tick);
      })();
    }
    try { viewer = new window.BRH.Viewer(canvas, { onState: onState }); }
    catch (e) { loading.textContent = "This interactive view needs WebGL 2."; return; }

    // tour: step through the stages until the visitor takes over
    function schedule() {
      clearTimeout(timer);
      if (!touring) return;
      timer = setTimeout(() => {
        if (touring && viewer.visible && !document.hidden) viewer.goTo((viewer.target + 1) % steps.length, 1100);
        schedule();
      }, viewer.target === steps.length - 1 ? 3600 : 2400);
    }
    function setTour(on) {
      touring = on && !viewer.reduced;
      playBtn.setAttribute("aria-pressed", touring ? "true" : "false"); $(".play-tx", playBtn).textContent = touring ? "Pause" : "Play";
      schedule();
    }
    steps.forEach((b) => b.addEventListener("click", () => { setTour(false); viewer.goTo(+b.dataset.state); }));
    playBtn.addEventListener("click", () => setTour(!touring));
    tools(stage, viewer);

    function show(id) {
      stage.classList.remove("ready"); mark(box, id);
      return window.BRH.loadScene(id).then((raw) => { viewer.setScene(raw); stage.classList.add("ready"); schedule(); })
        .catch(() => { loading.textContent = "Could not load this example."; });
    }
    thumbs(box, ids, show);
    show(ids[0]).then(() => setTour(true));
  }

  // ------------------------------------------------------------------ several states side by side, one camera
  const fixed = (sc) => sc.states.map((_, i) => ({ track: [i] }));
  const VIEWS = {
    est: {
      scenes: ["est_vpho_071927"], n: 4, ours: 3, labels: ["Estimate", "ContactOpt", "GeneOH Diffusion", "Ours"],
      cols: (w) => (w >= 700 ? 4 : 2), ratio: () => 1.14, opts: { panels: fixed },
      chips: (st) => [["g", st.stats.on + " on surface"], ["r", st.stats.ins + " inside"]],
    },
    head: {
      n: 3, ours: 1, labels: ["Geometry", "Learned head", "Lifted annotation"],
      cols: () => 3, ratio: (w) => (w >= 640 ? 0.92 : 1.6), opts: { panels: fixed, objectHidden: true },
      chips: (st) => (st.key === "gt" ? [["", "Reference"]] : [["", "F1 " + st.meta.f1.toFixed(2)]]),
    },
    thermal: {
      scenes: ["thermal_full15_handoff_camera"], n: 4, ours: 3, labels: ["Thermal measurement", "Rigid annotation", "ContactOpt", "Ours"],
      cols: (w) => (w >= 700 ? 4 : 2), ratio: () => 0.9,
      opts: { panels: (sc) => sc.states.map((_, i) => ({ track: [i], objRgb: i })), object: "solid", hand: 0, sway: 24 },
      chips: (st) => (st.meta.missed === undefined ? [] : [["fn", "Missed " + st.meta.missed + "%"], ["fp", "False " + st.meta.false + "%"]]),
    },
    seq: {
      scenes: ["seq_dex_s02_145612"], n: 2, ours: 1, labels: ["Per-frame", "Sequence-level"],
      cols: () => 2, ratio: (w) => (w >= 700 ? 0.6 : 1.02),
      opts: { panels: (sc) => { const T = sc.meta.frames; return [0, 1].map((k) => ({ track: Array.from({ length: T }, (_, i) => k * T + i) })); }, object: "none", sway: 0, fps: 7, zoom: 0.8 },
    },
  };

  /** one .mv-view shows one scene; with several .mv-view, every scene has its own row, and only the first row names the panels */
  function setupView(root) {
    const cfg = VIEWS[root.dataset.viewer], views = $$(".mv-view", root);
    const ids = cfg.scenes || root.dataset.scenes.split(","), many = views.length > 1;
    const rows = views.map((view, row) => mountView(root, cfg, view, !many || row === 0));
    if (rows.some((r) => !r)) return;
    tools(root, rows.map((r) => r.viewer));
    if (many) { whenNear(root, () => rows.forEach((r, k) => r.show(ids[k]))); return; }
    const box = $("[data-thumbs]", root), show = (id) => { mark(box, id); return rows[0].show(id); };
    thumbs(box, ids, show);
    whenNear(root, () => show(ids[0]));
  }

  function mountView(root, cfg, view, named) {
    const canvas = $("canvas", view), loading = $(".loading", view);
    const caps = [];
    let rects = [], viewer, extra = null;
    const presize = () => { const W = view.clientWidth, cols = Math.min(cfg.n, cfg.cols(W)); view.style.height = Math.round((W / cols) * cfg.ratio(W)) * Math.ceil(cfg.n / cols) + "px"; };
    presize();
    function place(r) {
      rects = r;
      caps.forEach((c, k) => { if (!r[k]) return; c.style.left = r[k].x + "px"; c.style.top = r[k].y + "px"; c.style.width = r[k].w + "px"; c.style.height = r[k].h + "px"; });
      if (extra && extra.resize) extra.resize();
    }
    function captions(sc) {
      caps.forEach((c) => c.remove()); caps.length = 0;
      viewer.panels.forEach((p, k) => {
        const st = sc.states[p.track[0]], c = el("div", "pcap" + (named && k === cfg.ours ? " ours" : ""));
        c.appendChild(el("div", "pcap-name", named ? cfg.labels[k] : ""));
        const chips = el("div", "pcap-chips");
        (cfg.chips ? cfg.chips(st) : []).forEach((ch) => {
          const s = el("span", "pchip");
          if (ch[0]) { const i = el("i"); i.style.background = SWATCH[ch[0]]; s.appendChild(i); }
          s.appendChild(document.createTextNode(ch[1])); chips.appendChild(s);
        });
        c.appendChild(chips); view.appendChild(c); caps.push(c);
      });
      place(rects);
    }
    try {
      viewer = new window.BRH.Viewer(canvas, Object.assign({}, cfg.opts, { cols: cfg.cols, ratio: cfg.ratio, onLayout: place, onTime: (t) => extra && extra.time(t) }));
    } catch (e) { loading.textContent = "This interactive view needs WebGL 2."; return null; }
    if (root.dataset.viewer === "seq") extra = player(root, viewer);

    function show(id) {
      view.classList.remove("ready");
      return window.BRH.loadScene(id).then((raw) => {
        const sc = viewer.setScene(raw); captions(sc); view.classList.add("ready");
        if (extra) extra.scene(sc);
      }).catch(() => { loading.textContent = "Could not load this view."; });
    }
    return { viewer: viewer, show: show };
  }

  // ------------------------------------------------------------------ the clip: play, scrub, and the trace of its change
  function player(root, viewer) {
    const btn = $('[data-act="play"]', root), scrub = $(".scrub", root), frame = $("[data-frame]", root), plot = $("[data-trace]", root);
    let T = 45, series = null, svg = null, geo = null, cursor = null, dots = [], scrubbing = false;
    const setPlaying = (on) => {
      on = on && !viewer.reduced;
      if (on) viewer.play(); else viewer.pause();
      btn.setAttribute("aria-pressed", on ? "true" : "false"); $(".play-tx", btn).textContent = on ? "Pause" : "Play";
    };
    btn.addEventListener("click", () => setPlaying(btn.getAttribute("aria-pressed") !== "true"));
    scrub.addEventListener("pointerdown", () => { scrubbing = true; });
    window.addEventListener("pointerup", () => { scrubbing = false; });
    scrub.addEventListener("input", () => { setPlaying(false); viewer.seek(+scrub.value); });

    const NS = "http://www.w3.org/2000/svg";
    const S = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
    const at = (arr, t) => { const i = Math.max(1, Math.min(T - 1, Math.round(t))); return arr[i]; };

    function draw() {
      if (!series) return;
      const W = plot.clientWidth, H = 150, m = { l: 34, r: 14, t: 10, b: 24 };
      if (!W) return;
      const all = series[0].concat(series[1]).filter((v) => v !== null), ymax = Math.ceil(Math.max.apply(null, all) / 0.5) * 0.5;
      const x = (i) => m.l + ((W - m.l - m.r) * i) / (T - 1), y = (v) => m.t + (H - m.t - m.b) * (1 - v / ymax);
      geo = { x: x, y: y, W: W, H: H, m: m };
      plot.textContent = "";
      svg = S("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Change of the deformation between consecutive frames, per-frame against sequence-level" });
      for (let v = 0; v <= ymax + 1e-9; v += 0.5) {
        svg.appendChild(S("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }));
        svg.appendChild(S("text", { x: m.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, v.toFixed(1)));
      }
      [0, 14, 29, 44].forEach((i) => svg.appendChild(S("text", { x: x(i), y: H - 6, class: "tick", "text-anchor": i === 0 ? "start" : i === 44 ? "end" : "middle" }, i === 0 ? "Frame 1" : String(i + 1))));
      cursor = S("line", { y1: m.t, y2: H - m.b, class: "cursor" }); svg.appendChild(cursor);
      dots = series.map((arr, k) => {
        const d = arr.map((v, i) => (v === null ? "" : (i === 1 ? "M" : "L") + x(i).toFixed(1) + " " + y(v).toFixed(1))).join(" ");
        svg.appendChild(S("path", { d: d, class: "line " + (k ? "b" : "a") }));
        const dot = S("circle", { r: 4.5, class: "dot " + (k ? "b" : "a") }); return dot;
      });
      dots.forEach((d) => svg.appendChild(d));
      plot.appendChild(svg);
      move(viewer.time);
    }
    function move(t) {
      if (!geo) return;
      const i = Math.max(1, Math.min(T - 1, Math.round(t)));
      cursor.setAttribute("x1", geo.x(i)); cursor.setAttribute("x2", geo.x(i));
      dots.forEach((d, k) => { d.setAttribute("cx", geo.x(i)); d.setAttribute("cy", geo.y(series[k][i])); });
    }
    // the crosshair finds the frame; one readout lists both series; a click moves the clip there
    function frameAt(e) { const r = plot.getBoundingClientRect(); return Math.max(1, Math.min(T - 1, Math.round(((e.clientX - r.left - geo.m.l) / (geo.W - geo.m.l - geo.m.r)) * (T - 1)))); }
    plot.addEventListener("pointermove", (e) => {
      if (!geo) return;
      const i = frameAt(e), r = plot.getBoundingClientRect();
      tipShow(plot, series[0][i].toFixed(2) + " · " + series[1][i].toFixed(2) + " mm", "Per-frame · sequence-level, frame " + (i + 1), r.left + geo.x(i), r.top + geo.m.t);
    });
    plot.addEventListener("pointerleave", tipHide);
    plot.addEventListener("click", (e) => { if (geo) { setPlaying(false); viewer.seek(frameAt(e)); } });

    return {
      scene(sc) {
        T = sc.meta.frames; scrub.max = T - 1;
        series = sc.meta.tracks.map((k) => sc.meta.change[k]);
        draw(); setPlaying(true);
      },
      time(t) {
        if (!scrubbing) scrub.value = t;
        frame.textContent = Math.min(T, Math.floor(t + 0.5) + 1) + " / " + T;
        move(t);
      },
      resize: draw,
    };
  }

  // ------------------------------------------------------------------ charts: one row per method, one column per measure
  function chart(root, spec) {
    root.textContent = ""; root.classList.remove("in"); root.style.setProperty("--n", spec.measures.length);
    const head = el("div", "crow chead");
    head.appendChild(el("div", "cname", spec.rowLabel));
    spec.measures.forEach((m) => {
      const h = el("div", "cmeasure"), t = el("b", "", m.title);
      if (m.arrow) t.appendChild(el("span", "carrow", " " + m.arrow));          // the direction beside the name when there is no subtitle
      h.appendChild(t); if (m.sub) h.appendChild(el("small", "", m.sub)); head.appendChild(h);
    });
    root.appendChild(head);
    spec.rows.forEach((row) => {
      const r = el("div", "crow" + (row.ours ? " ours" : ""));
      r.appendChild(el("div", "cname", row.name));
      row.cells.forEach((v, j) => {
        const m = spec.measures[j], cell = el("div", "ccell"), lo = m.min || 0, at = (x) => (x - lo) / (m.max - lo);   // a bar may start above zero
        cell.appendChild(el("span", "clabel", m.title));
        const track = el("span", "ctrack"), val = el("span", "cval");
        if (v === null) { cell.classList.add("none"); val.textContent = "–"; }
        else if (Array.isArray(v)) {                     // before → after
          const a = at(v[0]) * 100, b = at(v[1]) * 100;
          const link = el("span", "clink"); link.style.left = Math.min(a, b) + "%"; link.style.width = Math.abs(b - a) + "%";
          const da = el("span", "cdot a"), db = el("span", "cdot b"); da.style.left = a + "%"; db.style.left = b + "%";
          track.classList.add("pair"); track.appendChild(link); track.appendChild(da); track.appendChild(db);
          val.appendChild(document.createTextNode(m.fmt(v[0]) + " "));
          val.appendChild(el("i", "", "→")); val.appendChild(el("b", "", " " + m.fmt(v[1])));
          tipBind(cell, m.fmt(v[0]) + " → " + m.fmt(v[1]), row.name + " · " + m.title);
        } else {
          const bar = el("span", "cbar"); bar.style.setProperty("--v", Math.max(0.004, at(v))); track.appendChild(bar);
          val.textContent = m.fmt(v); track.appendChild(val);              // the value rides the tip of its bar
          tipBind(cell, m.fmt(v) + (m.unit || ""), row.name + " · " + m.title);
        }
        cell.appendChild(track); if (!val.parentNode) cell.appendChild(val); r.appendChild(cell);
      });
      root.appendChild(r);
    });
    reveal(root);
  }
  /** bars grow when their chart first comes into view (and again when its tab changes) */
  const seen = new WeakSet();
  function reveal(root) {
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
    if (seen.has(root) || !("IntersectionObserver" in window)) { go(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); seen.add(root); go(); } }, { threshold: 0.2 });
    io.observe(root);
  }
  function tabbed(key, render) {
    const btns = $$('[data-tabs="' + key + '"] button');
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((o) => o.setAttribute("aria-selected", o === b ? "true" : "false")); render(b.dataset.tab);
    }));
    render(btns[0].dataset.tab);
  }
  const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);

  // Table 1 of the paper: joint error (MPJPE, mm) and band conformity (C2, %) of each estimator and its refinements
  const EST = {
    HOISDF: [["Estimate", 10.3, 20.7], ["ContactOpt", 15.5, 16.9], ["GeneOH Diffusion", 17.1, 15.3], ["Ours", 10.5, 48.6], ["Ours with head", 10.7, 51.7]],
    UniHOPE: [["Estimate", 11.0, 20.0], ["ContactOpt", 26.6, 13.3], ["GeneOH Diffusion", 31.4, 11.4], ["Ours", 11.1, 47.5], ["Ours with head", 11.2, 49.6]],
    VPHO: [["Estimate", 8.8, 22.3], ["ContactOpt", 12.9, 19.0], ["GeneOH Diffusion", 14.8, 14.8], ["Ours", 9.1, 46.7], ["Ours with head", 9.2, 49.3]],
  };
  tabbed("est", (k) => chart($('[data-chart="est"]'), {
    rowLabel: "Method",
    measures: [{ title: "Skin on the surface", sub: "band conformity, % ↑", max: 60, fmt: f1, unit: "%" },
               { title: "Joint error added", sub: "over the estimate, mm ↓", max: 22, fmt: (v) => "+" + v.toFixed(1), unit: " mm" }],
    rows: EST[k].map((r, i) => ({ name: r[0], ours: i >= 3, cells: [r[2], i ? +(r[1] - EST[k][0][1]).toFixed(1) : null] })),
  }));

  // Table 2: contact F1 from geometry and from the head, and the equilibrium residual of the lift without and with the head
  chart($('[data-chart="head"]'), {
    rowLabel: "Estimator",
    measures: [{ title: "Contact F1", sub: "against the lifted annotation ↑", max: 0.7, fmt: f2 },
               { title: "Grasp instability", sub: "weight the contacts cannot balance, % ↓", max: 50, fmt: f1 }],
    rows: [{ name: "HOISDF", cells: [[0.37, 0.57], [16.1, 11.1]] }, { name: "UniHOPE", cells: [[0.27, 0.46], [46.5, 44.4]] }, { name: "VPHO", cells: [[0.47, 0.55], [9.3, 7.0]] }],
  });

  // Table 4: agreement with thermal contact on ContactPose
  chart($('[data-chart="thermal"]'), {
    rowLabel: "Hand",
    measures: [{ title: "Precision", arrow: "↑", min: 0.55, max: 0.8, fmt: f2 }, { title: "Recall", arrow: "↑", min: 0.25, max: 0.55, fmt: f2 }, { title: "F1", arrow: "↑", min: 0.35, max: 0.62, fmt: f2 }],
    rows: [{ name: "Rigid annotation", cells: [0.72, 0.33, 0.43] }, { name: "ContactOpt", cells: [0.62, 0.42, 0.49] }, { name: "Ours", ours: true, cells: [0.74, 0.49, 0.57] }],
  });

  // Table 5: transfer, band conformity, and their harmonic mean on held-out clips
  const SEQ = {
    DexYCB: [["Per-frame", 39.8, 87.5, 54.7], ["Post-hoc filter", 78.1, 75.5, 76.8], ["Filter + re-projection", 65.2, 89.4, 75.4], ["Temporal prior (ours)", 83.2, 83.5, 83.4]],
    OakInk: [["Per-frame", 34.5, 75.1, 47.3], ["Post-hoc filter", 77.9, 63.9, 70.2], ["Filter + re-projection", 58.7, 76.9, 66.6], ["Temporal prior (ours)", 82.7, 69.1, 75.3]],
  };
  tabbed("seq", (k) => chart($('[data-chart="seq"]'), {
    rowLabel: "Method",
    measures: [{ title: "Transfer between frames", sub: "deformation that persists, % ↑", min: 30, max: 95, fmt: f1, unit: "%" },
               { title: "Skin on the surface", sub: "band conformity, % ↑", min: 60, max: 100, fmt: f1, unit: "%" },
               { title: "Harmonic mean", sub: "of the two, % ↑", min: 45, max: 95, fmt: f1, unit: "%" }],
    rows: SEQ[k].map((r, i) => ({ name: r[0], ours: i === 3, cells: [r[1], r[2], r[3]] })),
  }));

  // Table 3: rigid annotation → lift
  const KPI = { DexYCB: { c2a: "19.4", c2b: "87.9", na: "38.6", nb: "2.9", fa: "11.6", fb: "7.9" }, OakInk: { c2a: "19.7", c2b: "71.4", na: "18.4", nb: "1.5", fa: "13.1", fb: "7.6" } };
  tabbed("kpi", (k) => $$("[data-k]").forEach((n) => { n.textContent = KPI[k][n.dataset.k]; }));

  $$(".stage[data-viewer]").forEach(setupLift);
  $$(".mv[data-viewer]").forEach(setupView);

  // ------------------------------------------------------------------ copy BibTeX
  $$(".copy").forEach((b) => b.addEventListener("click", () => {
    const text = $(b.dataset.copy).textContent;
    const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done);
    else {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* no clipboard */ }
      ta.remove();
    }
  }));

  // ------------------------------------------------------------------ navigation
  const nav = $("#nav"), links = $$(".nav-links a");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach((s) => io.observe(s));
  }
})();
