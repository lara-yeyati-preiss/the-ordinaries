
/* -------------------------------
   0) global configuration
   - the linear narrative rendered inside the scrolly track
-------------------------------- */

const config = {
  steps: [
    // intro card 1 (text + small illustration)
    {
      id: "intro-1",
      type: "card",
      content: {
        text:
          "History isn't only carved in bronze and stone. It survives in the fragments of the everyday—in the small habits that built a life, and then, a world.",
        image: "assets/treesandhouse.png",
        alt: "Sampler house and trees motif",
      },
    },

    // intro card 2
    {
      id: "intro-2",
      type: "card",
      content: {
        text:
          "The things people handled every day—what they crafted, traded, and cared for—offer a glimpse into what their world looked like, and how it took shape.",
        image: "assets/fruits.png",
        alt: "A small embroidered tree motif",
      },
    },

    /* ----------------------------------------------------------------------
       note: sampler-specific scenes are shown inside the modal, not on track
    ---------------------------------------------------------------------- */

    // object grid step: category changes as the user scrolls within this step
    {
      id: "rituals",
      type: "object-grid",
      content: {
        text:
          "Each object belonged to a rhythm of ritual and habit, through which life was imagined and ordered.",
      },
    },

    // outro card (handoff to treemap)
    {
      id: "outro",
      type: "card",
      content: {
        text:
          "From the material remains of everyday actions, a pattern emerges—tracing the outlines of what once was ordinary life.<br><br><em>Browse the full collection below.</em>",
      },
    },

    // treemap container (svg is injected; behavior is in treemap.js)
    {
      id: "treemap",
      type: "treemap",
      content: {},
    },
  ],
};

/* -------------------------------
   grid category registry
   - keys map to "family" stories and to asset/metadata sources
   - manifest.json files list image filenames; csv provides tooltip metadata
-------------------------------- */

const GRID_CATEGORIES = [
  {
    key: "samplers",
    label: "Samplers",
    path: "assets/samplers",
    manifest: "assets/samplers/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv",
  },
  {
    key: "mugs",
    label: "Pharmaceutical jars",
    path: "assets/mugs",
    manifest: "assets/mugs/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv",
  },
  {
    key: "teapots",
    label: "Teapots",
    path: "assets/teapots",
    manifest: "assets/teapots/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv",
  },
  {
    key: "fire marks",
    label: "Fire Marks",
    path: "assets/fire_marks",
    manifest: "assets/fire_marks/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv",
  },
];

/* -------------------------------
   1) runtime state
   - single source of truth for all transient ui variables
-------------------------------- */

let state = {
  activeStepIndex: -1,      // which track step is active (-1 means hero)
  compartmentProgress: 0,   // 0..1 position across images in a compartment slide
  samplerIntroProgress: 0,  // legacy reveal support; harmless if unused
  objectGridCategory: 0,    // which family is currently shown in the grid
  segments: [],             // normalized scroll segments (hero + steps)
  storyIndex: 0,            // active slide index inside the story modal
  storySlides: [],          // slide configuration array mounted in modal
  _lastActiveStepIndex: -2, // previous step index to detect boundary crosses
};

/* -------------------------------
   2) segment helpers
   - locate segments by id and map global progress to local step progress
-------------------------------- */

function segmentOf(id) {
  return state.segments.find((s) => s.id === id);
}

function localProgress(t, stepId) {
  const seg = segmentOf(stepId);
  if (!seg) return 0;
  return Math.max(0, Math.min(1, (t - seg.start) / (seg.end - seg.start)));
}

/* -------------------------------
   3) timeline setup
   - stitch vh-length chunks and normalize to [0,1]
   - ensures scroll pacing is independent of content height
-------------------------------- */

const DEFAULT_VH = 120;
const PER_STEP_VH = {
  rituals: 280, // longer runway to make category changes legible
  treemap: 100, // slightly shorter so the viz enters sooner
};

function buildSegments() {
  const segs = [{ id: "hero", h: DEFAULT_VH }];
  config.steps.forEach((s) => segs.push({ id: s.id, h: PER_STEP_VH[s.id] || DEFAULT_VH }));

  const totalVH = segs.reduce((a, s) => a + s.h, 0);
  let acc = 0;

  return segs.map((s) => {
    const start = acc / totalVH;
    const end = (acc + s.h) / totalVH;
    acc += s.h;
    return { ...s, start, end, totalVH };
  });
}

function setTrackHeight() {
  const track = document.querySelector(".scrolly-track");
  const total = state.segments.reduce((a, s) => a + s.h, 0);
  if (track) track.style.minHeight = `${total}vh`;
}

/* -------------------------------
   4) convenience scroll actions
   - semantic jumps used by buttons (e.g., jump to treemap)
-------------------------------- */

function scrollToTreemapStart(behavior = "instant") {
  const container = document.getElementById("scrollContainer");
  const seg = segmentOf("treemap");
  if (!container || !seg) return;

  const scrollHeight = container.scrollHeight - container.clientHeight;
  const epsilon = Math.max(0.0003, (seg.end - seg.start) * 0.02);
  const t = Math.min(1, seg.start + epsilon);

  container.scrollTo({ top: Math.round(t * scrollHeight), behavior });
}

/* -------------------------------
   5) ui wiring (hero/about)
   - hero cta jump + reset
   - simple "about" modal with focus trap and escape to close
-------------------------------- */

function setupHeroObjectsButton() {
  const btn = document.getElementById("heroBtnObjects");
  if (!btn) return;

  btn.removeAttribute("disabled");
  btn.setAttribute("aria-disabled", "false");

  btn.addEventListener("click", () => {
    scrollToTreemapStart("instant");
    // reset treemap selection after scroll is applied (double rAF)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (window.resetTreemapToOverview) window.resetTreemapToOverview();
      })
    );
  });
}

function setupAboutModal() {
  const modal = document.getElementById("aboutModal");
  const openBtn = document.getElementById("aboutBtn");
  if (!modal || !openBtn) return;

  const backdrop = modal.querySelector(".modal-backdrop");
  const closeEls = modal.querySelectorAll("[data-close]");
  let lastFocus = null;

  const focusables = () =>
    modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');

  const open = () => {
    lastFocus = document.activeElement;
    modal.removeAttribute("hidden");
    document.body.classList.add("modal-open");
    const f = focusables()[0] || modal;
    if (f?.focus) f.focus({ preventScroll: true });
  };

  const close = () => {
    modal.setAttribute("hidden", "");
    document.body.classList.remove("modal-open");
    lastFocus?.focus?.();
  };

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });

  backdrop.addEventListener("click", close);
  closeEls.forEach((el) => el.addEventListener("click", close));

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const f = Array.from(focusables());
    if (!f.length) return;

    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0 || i === -1)) {
      e.preventDefault();
      f[f.length - 1].focus();
    } else if (!e.shiftKey && i === f.length - 1) {
      e.preventDefault();
      f[0].focus();
    }
  });
}

/* -------------------------------
   6) tooltip housekeeping
   - single place to hide tooltips on step changes / global gestures
-------------------------------- */

function hideAllTooltips() {
  document.getElementById("gridTooltip")?.style?.setProperty("display", "none");
  document.getElementById("treemap-tooltip")?.style?.setProperty("display", "none");
}

/* -------------------------------
   7) step rendering
   - template strings per step type; css handles layout
-------------------------------- */

function renderSteps() {
  const container = document.getElementById("stepsContainer");
  container.innerHTML = "";

  config.steps.forEach((step) => {
    const stepEl = document.createElement("div");
    stepEl.className = "scrolly-step";
    stepEl.id = `step-${step.id}`;
    stepEl.innerHTML = renderStepContent(step);
    container.appendChild(stepEl);
  });
}

function renderStepContent(step) {
  const t = step?.type || "";

  // card (intro/outro/default)
  if (t === "card") {
    const c = step.content || {};
    const txt = c.text || "";
    const img = c.image || "";
    const alt = c.alt || "";

    if (step.id === "intro-1" || step.id === "intro-2") {
      return (
        '<div class="prelude-card">' +
        `<p>${txt}</p>` +
        (img
          ? `<img class="card-image" src="${img}" alt="${alt}" style="height:110px;width:auto;max-width:99vw;object-fit:contain;display:block;margin-top:2em;">`
          : "") +
        "</div>"
      );
    }

    if (step.id === "outro") {
      return (
        '<div class="prelude-card">' +
        `<p>${txt}</p>` +
        (img ? `<img class="card-image" src="${img}" alt="${alt}">` : "") +
        "</div>"
      );
    }

    return (
      '<div class="prelude-card">' +
      `<p>${txt}</p>` +
      (img ? `<img class="card-image" src="${img}" alt="${alt}">` : "") +
      "</div>"
    );
  }

  // sampler-intro (triptych) — used inside the modal
  if (t === "sampler-intro") {
    const si = step.content || {};
    const samplers = Array.isArray(si.samplers) ? si.samplers : [];
    return (
      '<div class="sampler-intro-step">' +
      '<div class="prelude-card sampler-intro-card"><p>' +
      (si.text || "") +
      "</p></div>" +
      '<div class="sampler-gallery">' +
      samplers
        .map((img, i) => {
          return (
            `<div class="sampler-item" data-index="${i}">` +
            `<img src="${img}" alt="Sampler ${i + 1}">` +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      "</div>"
    );
  }

  // sampler-intro-side (large image + card) — used inside the modal
  if (t === "sampler-intro-side") {
    const cs = step.content || {};
    const img = cs.image || "";
    const alt = cs.alt || "Object";
    const txt = cs.text || "";
    return (
      '<div class="sampler-intro-step side-by-side">' +
      '<div class="sampler-image-wrap">' +
      `<img src="${img}" alt="${alt}">` +
      "</div>" +
      '<div class="sampler-text-wrap prelude-card sampler-intro-card">' +
      `<p>${txt}</p>` +
      "</div>" +
      "</div>"
    );
  }

  // compartment (stacked images cross-faded via normalized progress)
  if (t === "compartment") {
    const cc = step.content || {};
    const items = Array.isArray(cc.compartments) ? cc.compartments : [];
    const firstLabel = items.length ? items[0].label || "" : "";

    return (
      '<div class="compartment-container">' +
      // visual stage with layered images + arrows + live label
      '<div class="sampler-viewport">' +
      items
        .map((comp, i) => {
          const src = comp?.image || "";
          const lab = comp?.label || `Compartment ${i + 1}`;
          return (
            `<div class="viewport-image" data-index="${i}">` +
            `<img src="${src}" alt="${lab}">` +
            "</div>"
          );
        })
        .join("") +
      '<button class="img-arrow img-arrow-left" aria-label="Previous image"></button>' +
      '<button class="img-arrow img-arrow-right" aria-label="Next image"></button>' +
      `<div class="viewport-label" id="viewportLabel">${firstLabel}</div>` +
      "</div>" +
      // caption card with linear progress bar
      '<div class="prelude-card compartment-card">' +
      `<p>${cc.text || ""}</p>` +
      '<div class="progress-bar"><div class="progress-fill"></div></div>' +
      "</div>" +
      "</div>"
    );
  }

  // single hero image + card — used inside the modal
  if (t === "sampler-intro-single") {
    const cs = step.content || {};
    const img = cs.image || "";
    const alt = cs.alt || "Sampler";
    const txt = cs.text || "";
    return (
      '<div class="sampler-intro-step" style="gap:1.2vh;">' +
      '<div class="prelude-card sampler-intro-card"><p>' +
      txt +
      "</p></div>" +
      '<div class="sampler-gallery">' +
      '<div class="sampler-item visible" data-index="0">' +
      `<img src="${img}" alt="${alt}" style="height:clamp(440px,44vh,600px);width:auto;max-width:99vw;object-fit:contain;display:block;">` +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // object grid step (left column: narrative + category selector; right: grid)
  if (t === "object-grid") {
    const og = step.content || {};
    const ogText = og.text || "";

    // labels mirror GRID_CATEGORIES order for clarity
    const chipLabels = [
      "Textile Making",
      "Healing & Caring",
      "Eating, Cooking & Drinking",
      "Lighting & Firekeeping",
    ];
    const categories = ["Samplers", "Pharmaceutical jars", "Teapots", "Fire marks"];

    return (
      '<div class="object-grid-step">' +
      '<div class="grid-wrapper">' +
      '<div class="grid-left-col">' +
      `<div class="prelude-card object-grid-card"><p>${ogText}</p></div>` +
      '<div class="category-selector" id="categorySelector" role="radiogroup" aria-label="Filter by object">' +
      categories
        .map((cat, i) => {
          const storyKey = GRID_CATEGORIES[i]?.key || "";
          return (
            `<button type="button" class="category-option ${i === 0 ? "active" : ""}" ` +
            `data-category-index="${i}" role="radio" aria-checked="${i === 0 ? "true" : "false"}">` +
            `<span class="option-label object-label">${cat}</span>` +
            `<span class="option-chip editable-chip family-labels-html">${chipLabels[i]}</span>` +
            `<span class="view-story-btn category-view" role="button" tabindex="0" data-story="${storyKey}">View story</span>` +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</div>" +
      '<div class="image-grid" id="imageGrid"></div>' +
      "</div>" +
      "</div>"
    );
  }

  // treemap host structure (expected by treemap.js)
  if (t === "treemap") {
    return (
      '<div class="treemap-step">' +
      '<div class="viz-wrap" id="treemap-section">' +
      '<h2 class="section-title">Traces of an Ordinary Life</h2>' +
      '<p class="viz-hint">Explore objects from Revolutionary-era America by how they were used, drawn from the Smithsonian collections.</p>' +
      '<p class="viz-hint-small">Click on a group to see the objects inside.</p>' +
      '<div class="treemap-controls" aria-label="Treemap controls">' +
      '<div class="zoom-card"><span class="zoom-title">All Actions</span></div>' +
      '<button class="back-to-all is-ghost">← Back to all actions</button>' +
      "</div>" +
      '<div class="treemap-stage viz-stage">' +
      '<svg id="treemap-svg" class="treemap" viewBox="0 0 1000 490" preserveAspectRatio="none" role="img" aria-label="Treemap of objects grouped by action"></svg>' +
      '<div id="details" class="details-panel" hidden>' +
      '<div class="details-header">' +
      '<h3 id="details-title" class="details-title"></h3>' +
      '<button class="details-close" aria-label="Close details">×</button>' +
      "</div>" +
      '<p class="details-subtitle"></p>' +
      '<ul id="details-list" class="details-list"></ul>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="treemap-tooltip" id="treemap-tooltip" aria-hidden="true"></div>'
    );
  }

  // unknown type → render nothing
  return "";
}

/* -------------------------------
   8) scroll listener + step logic
   - compute global progress, set active step, and drive per-step updates
-------------------------------- */

function setupScrollListener() {
  const container = document.getElementById("scrollContainer");
  container.addEventListener(
    "scroll",
    () => {
      const t = computeProgressAndActive();
      updateStepVisibility(t);
      updateSamplerIntroReveal(t); // no-op unless that step exists on track
      updateObjectGridProgress(t);
      updateUpArrowVisibility();
      updateViewportBackgroundGrid();

      // guard: keep scrollTop within the valid range near the bottom
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (container.scrollTop > maxScroll - 2) container.scrollTop = maxScroll - 2;
    },
    { passive: true }
  );
}

function computeProgressAndActive() {
  const container = document.getElementById("scrollContainer");
  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight - container.clientHeight;
  const t = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

  let active = -1;
  for (let i = 1; i < state.segments.length; i++) {
    const seg = state.segments[i];
    if (t >= seg.start && t < seg.end) {
      active = i - 1; // subtract hero sentinel
      break;
    }
  }
  state.activeStepIndex = active;
  return t;
}

function updateStepVisibility(t) {
  const heroEl = document.getElementById("heroSection");
  const heroSeg = segmentOf("hero");
  const inHero = heroSeg ? t < heroSeg.end : state.activeStepIndex === -1;
  heroEl.classList.toggle("hidden", !inHero);

  // reflect active class per step for css-driven transitions
  config.steps.forEach((step, i) => {
    const stepEl = document.getElementById(`step-${step.id}`);
    stepEl.classList.toggle("active", i === state.activeStepIndex);
  });

  // hide tooltips once on boundary crosses
  if (state._lastActiveStepIndex !== state.activeStepIndex) {
    hideAllTooltips();
    state._lastActiveStepIndex = state.activeStepIndex;
  }
}

// background grid appears once outside hero
function updateViewportBackgroundGrid() {
  const viewportBg = document.getElementById("viewportBg");
  if (state.activeStepIndex >= 0) viewportBg.classList.add("grid-bg");
  else viewportBg.classList.remove("grid-bg");
}

// legacy triptych reveal on a track step named "sampler-intro" (harmless if absent)
function updateSamplerIntroReveal(totalProgress) {
  const stepIndex = config.steps.findIndex((s) => s.id === "sampler-intro");
  if (state.activeStepIndex !== stepIndex) return;

  const p = localProgress(totalProgress, "sampler-intro");
  const step = document.getElementById("step-sampler-intro");
  if (!step) return;

  const items = step.querySelectorAll(".sampler-item");
  items.forEach((el, k) => {
    const threshold = k / items.length;
    el.classList.toggle("visible", p > threshold);
  });
}

// inside "rituals", local progress selects a grid category (quarters across 4 bins)
function updateObjectGridProgress(totalProgress) {
  const stepId = "rituals";
  const stepIndex = config.steps.findIndex((s) => s.id === stepId);
  if (state.activeStepIndex !== stepIndex) return;

  const p = localProgress(totalProgress, stepId);
  const n = GRID_CATEGORIES.length;
  const idx = Math.min(n - 1, Math.floor(p * n));
  if (idx !== state.objectGridCategory) {
    loadCategory(idx);
  }
}

/* -------------------------------
   9) compartment cross-fade
   - blend adjacent images by computing a floating index from 0..(n-1)
   - update label (dominant image) and a linear meter
-------------------------------- */

function updateCompartmentView() {
  // prefer the active slide inside the open modal
  const slides = document.querySelectorAll(
    "#storyModal:not([hidden]) .story-track .story-slide"
  );
  const activeSlide = slides[state.storyIndex] || null;

  // fallback: support a legacy in-track compartment if present
  const stepEl =
    activeSlide?.querySelector(".compartment-container") ||
    document.getElementById("step-sampler-compartment");

  if (!stepEl) return;

  // obtain items: strong data reference if set, then data-attr, then config
  const items =
    stepEl._compartments ||
    (() => {
      const json = stepEl.getAttribute("data-compartments-json");
      if (json) {
        try {
          return JSON.parse(json);
        } catch (e) {}
      }
      const cfg = (config.steps.find((s) => s.id === "sampler-compartment") || {}).content || {};
      return Array.isArray(cfg.compartments) ? cfg.compartments : [];
    })();

  const wraps = stepEl.querySelectorAll(".viewport-image");
  const labelEl = stepEl.querySelector("#viewportLabel");
  const fillEl = stepEl.querySelector(".progress-fill");
  const n = items.length || wraps.length;
  if (!n) return;

  const local = state.compartmentProgress; // 0..1
  const idxFloat = local * (n - 1);
  const idx = Math.floor(idxFloat);
  const frac = idxFloat - idx;

  // blend within a symmetric window centered at 0.5
  const blend = 0.3;
  const start = 0.5 - blend / 2;
  const end = 0.5 + blend / 2;

  wraps.forEach((w, k) => {
    let a = 0;
    if (k === idx) a = frac < start ? 1 : frac > end ? 0 : 1 - (frac - start) / blend;
    else if (k === idx + 1) a = frac < start ? 0 : frac > end ? 1 : (frac - start) / blend;
    w.style.opacity = a;
  });

  if (labelEl) {
    const showIdx = Math.min(idx + (frac > 0.5 ? 1 : 0), n - 1);
    labelEl.textContent = items[showIdx]?.label || "";
  }
  if (fillEl) fillEl.style.width = `${(local * 100).toFixed(1)}%`;
}

/* -------------------------------
   10) misc ui affordances
   - hero down arrow jump and a "back to top" arrow
-------------------------------- */

function setupHeroDownArrow() {
  const arrow = document.getElementById("scrollIndicator");
  const container = document.getElementById("scrollContainer");
  const heroSeg = segmentOf("hero");
  if (!arrow || !container || !heroSeg) return;

  arrow.addEventListener("click", () => {
    const scrollHeight = container.scrollHeight - container.clientHeight;
    const target = Math.ceil(heroSeg.end * scrollHeight) + 2;
    container.scrollTo({ top: target, behavior: "instant" });
  });
}

function enableUpArrow() {
  const btn = document.getElementById("upArrow");
  const container = document.getElementById("scrollContainer");
  if (!btn || !container) return;

  btn.addEventListener("click", () => container.scrollTo({ top: 0, behavior: "smooth" }));
  updateUpArrowVisibility();
}

function updateUpArrowVisibility() {
  const btn = document.getElementById("upArrow");
  const container = document.getElementById("scrollContainer");
  if (!btn || !container) return;

  const show = container.scrollTop > window.innerHeight * 0.8;
  btn.classList.toggle("visible", show);
}

/* -------------------------------
   11) grid data + category logic
   - manifest.json → list of filenames → absolute paths
   - optional csv metadata is indexed by EDAN id for tooltips
   - d3 join renders a fixed-size page of thumbnails for responsiveness
-------------------------------- */

const _gridManifestCache = new Map();
const _gridMetaCache = new Map();

function ensureTooltip() {
  let el = document.getElementById("gridTooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "gridTooltip";
    document.body.appendChild(el);
  }
  return el;
}

function idFromPath(path) {
  return path.split("/").pop().replace(/\.[^.]+$/, "");
}

function indexMetadata(rows) {
  const idx = new Map();
  rows.forEach((r) => {
    let u = (r.EDANurl || "").trim();
    if (!u) return;

    let seg = u.split("/").pop() || u;
    seg = seg.split("?")[0].split("#")[0];

    try {
      seg = decodeURIComponent(seg);
    } catch (e) {}

    seg = seg.replace(/\.[^.]+$/, "");
    if (seg && !idx.has(seg)) idx.set(seg, r);
  });
  return idx;
}

function pick(row, keys) {
  for (const k of keys) {
    const v = (row?.[k] ?? "").toString().trim();
    if (v) return v;
  }
  return "";
}

function isLowValueTitle(t) {
  return !t || !t.trim();
}

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function tooltipHTML(row) {
  if (!row) return "";

  const titleRaw = pick(row, ["title"]);
  const materials = pick(row, ["materials"]);
  const url = pick(row, ["EDANurl", "edanurl", "URL", "Url"]);

  const title = capitalizeFirstLetter(titleRaw);
  const materialsCap = capitalizeFirstLetter(materials);

  const parts = [];

  if (title && !isLowValueTitle(title)) {
    parts.push(
      `<div class="tt-title">${
        url ? `<a href="${url}" target="_blank" rel="noopener">${title}</a>` : title
      }</div>`
    );
  }

  if (!parts.length && url) {
    parts.push(
      `<div class="tt-row"><a href="${url}" target="_blank" rel="noopener">View object record</a></div>`
    );
  }

  if (materialsCap) {
    parts.push(`<div class="tt-row tt-materials">Materials: ${materialsCap}</div>`);
  }

  return parts.join("");
}

function positionTooltip(el, clientX, clientY) {
  const pad = 12;
  el.style.display = "block";
  el.style.left = "0px";
  el.style.top = "0px";

  const rect = el.getBoundingClientRect();
  let x = clientX + 14;
  let y = clientY + 14;

  if (x + rect.width + pad > window.innerWidth) x = clientX - rect.width - 14;
  if (y + rect.height + pad > window.innerHeight) y = clientY - rect.height - 14;

  el.style.left = Math.max(pad, x) + "px";
  el.style.top = Math.max(pad, y) + "px";
}

function renderGridFromPaths(paths, metaIndex = null) {
  const sel = d3.select("#imageGrid");
  const visible = paths.slice(0, 21); // small page for fast first paint

  const cards = sel
    .selectAll(".grid-item")
    .data(visible, (d) => d) // key by full path
    .join(
      (enter) => {
        const g = enter.append("div").attr("class", "grid-item");
        g.append("img");
        return g;
      },
      (update) => update,
      (exit) => exit.remove()
    );

  const imgs = cards.select("img");
  imgs
    .attr("loading", "lazy")
    .attr("src", (d) => encodeURI(d))
    .attr("alt", (d, i) => `${GRID_CATEGORIES[state.objectGridCategory].label} ${i + 1}`)
    .on("error", function (_event, d) {
      this.classList.add("img-broken");
      console.warn("image failed:", d);
    });

  // tooltip on hover when metadata is available
  const tip = ensureTooltip();
  cards
    .on("mouseenter", function (event, d) {
      if (!metaIndex) return;
      const id = idFromPath(d);
      const row = metaIndex.get(id);
      const html = tooltipHTML(row);
      if (!html) return;
      tip.innerHTML = html;
      tip.style.display = "block";
      positionTooltip(tip, event.clientX, event.clientY);
    })
    .on("mousemove", function (event) {
      if (tip.style.display !== "none") positionTooltip(tip, event.clientX, event.clientY);
    })
    .on("mouseleave", function () {
      tip.style.display = "none";
    });
}

function loadCategory(idx) {
  state.objectGridCategory = idx;

  // update selector state (aria radiogroup)
  document.querySelectorAll(".category-option").forEach((b, k) => {
    const on = k === idx;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });

  const cat = GRID_CATEGORIES[idx];
  if (!cat) return Promise.resolve();

  // manifest list → absolute paths
  const manifestP = _gridManifestCache.has(cat.key)
    ? Promise.resolve(_gridManifestCache.get(cat.key))
    : d3
        .json(cat.manifest)
        .then((names = []) => names.map((n) => `${cat.path}/${n}`))
        .catch(() => [])
        .then((paths) => {
          _gridManifestCache.set(cat.key, paths);
          return paths;
        });

  // metadata csv → Map index
  const metaP = cat.csv
    ? _gridMetaCache.has(cat.key)
      ? Promise.resolve(_gridMetaCache.get(cat.key))
      : d3
          .csv(cat.csv)
          .then((rows) => {
            const idx = indexMetadata(rows || []);
            _gridMetaCache.set(cat.key, idx);
            return idx;
          })
          .catch(() => null)
    : Promise.resolve(null);

  return Promise.all([manifestP, metaP]).then(([paths, metaIndex]) => {
    renderGridFromPaths(paths, metaIndex);
  });
}

function setupCategoryButtons() {
  const sel = document.getElementById("categorySelector");
  if (!sel) return;

  // clicks inside the selector
  sel.addEventListener("click", (e) => {
    // open story modal when clicking "view story"
    const storyBtn = e.target.closest(".category-view, .view-story-btn");
    if (storyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = storyBtn.getAttribute("data-story") || "";
      if (window.openStory) window.openStory(key);
      return;
    }

    // change selected category
    const btn = e.target.closest(".category-option");
    if (!btn) return;

    e.preventDefault();
    const idx = Number(btn.dataset.categoryIndex);
    if (!Number.isFinite(idx)) return;

    // align scroll position within the rituals segment to match the selection
    const seg = segmentOf("rituals");
    const container = document.getElementById("scrollContainer");
    if (seg && container) {
      const n = document.querySelectorAll(".category-option").length || GRID_CATEGORIES.length;
      const span = seg.end - seg.start;
      const local = seg.start + ((idx + 0.5) / n) * span;
      const y = local * (container.scrollHeight - container.clientHeight);
      container.scrollTo({ top: y, behavior: "instant" });
    }

    loadCategory(idx);
  });

  // keyboard activation for the inline "view story" element
  sel.addEventListener("keydown", (e) => {
    const storyBtn = e.target.closest(".view-story-btn");
    if (!storyBtn) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      const key = storyBtn.getAttribute("data-story") || "";
      if (window.openStory) window.openStory(key);
    }
  });
}

/* -------------------------------
   12) story slide definitions
   - declarative slide arrays per family (consumed by setupStoryModal)
-------------------------------- */

// samplers (3 slides)
const SAMPLER_STORY_STEPS = [
  {
    id: "sampler-intro",
    type: "sampler-intro",
    content: {
      text:
        "In Revolutionary-era America, young women stitched samplers—linen squares used to practice letters, numbers, and the discipline of the hand.",
      samplers: [
        "assets/samplers/edanmdm:nmah_649894.png",
        "assets/samplers/edanmdm:nmah_1134702.png",
        "assets/samplers/edanmdm:nmah_639698.png",
      ],
    },
  },
  {
    id: "sampler-single",
    type: "sampler-intro-single",
    content: {
      text:
        "These embroidered works displayed patience and skill. They mirrored the ideals of the new republic—training women to embody virtue through education, morality, and domestic order.",
      image: "assets/edanmdm:nmah_639739-details.png",
      alt: "Sampler showing skill, patience, and diligence.",
    },
  },
  {
    id: "sampler-compartment",
    type: "compartment",
    content: {
      text: "Each sampler holds its own system.\nAlphabets, houses, verses practiced one stitch at a time.",
      compartments: [
        { image: "assets/samplers/edanmdm:nmah_643873.png", label: "Alphabets" },
        { image: "assets/samplers/edanmdm:nmah_644829.png", label: "Alphabets" },
        { image: "assets/samplers/edanmdm:nmah_1139039.png", label: "Alphabets" },
        { image: "assets/samplers/edanmdm:nmah_1093871.png", label: "Houses" },
        { image: "assets/samplers/edanmdm:nmah_1341531.png", label: "Houses" },
        { image: "assets/samplers/edanmdm:nmah_649885.png", label: "Houses" },
        { image: "assets/samplers/edanmdm:nmah_639698.png", label: "Verses" },
        { image: "assets/samplers/edanmdm:nmah_1141751.png", label: "Verses" },
      ],
    },
  },
];

// pharma mugs (2 slides)
const PHARMA_STORY_STEPS = [
  {
    id: "pharma-intro",
    type: "sampler-intro-side",
    content: {
      image: "assets/mugs/edanmdm:nmah_993952.png",
      alt: "Apothecary jar on a shelf",
      text:
        "In cupboards and shop shelves, jars kept remedies within reach. Dried leaves, powders, syrups, and salves measured and stored for daily use.",
    },
  },
  {
    id: "pharma-inscriptions",
    type: "compartment",
    content: {
      text:
        "Labels listed contents forming a code of practice and care: what to take, how to mix, when to apply.",
      compartments: [
        { image: "assets/mugs/edanmdm:nmah_993951.png", label: "MERCUR VIRID - Mercurius Viridis: 'Green Mercury', a mercury compound used in 18th-century treatments for skin and venereal diseases." },
        { image: "assets/mugs/edanmdm:nmah_994285.png", label: "MUSCUS HELMINTOCH - Muscus helminthocortos: a mixture of lichen, plants, and zoophytes believed to expel intestinal worms." },
        { image: "assets/mugs/edanmdm:nmah_994314.png", label: "BALSAMIC PILLS - Defined in J. Worth Estes' Dictionary of Protopharmacology as 'a softening, restoring, healing, and cleansing medicine.'" },
        { image: "assets/mugs/edanmdm:nmah_994323.png", label: "CORAL R PP - Corallium Rubrum Pulvis Preparatus: powdered red coral, thought to stop bleeding, calm fevers, and protect infants from convulsions." },
      ],
    },
  },
];

// teapots (3 slides)
const TEAPOTS_STORY_STEPS = [
  {
    id: "teapots-intro",
    type: "sampler-intro",
    content: {
      text:
        "Tea arrived in the colonies as an imported habit — exotic, expensive, and carefully performed. The teapot sat at the center of this ritual.",
      samplers: [
        "assets/teapots/edanmdm:nmah_580942.png",
        "assets/teapots/edanmdm:nmah_579617.png",
        "assets/teapots/edanmdm:nmah_580955.png",
      ],
    },
  },
  {
    id: "teapots-middle",
    type: "sampler-intro-side",
    content: {
      image: "assets/teapots/edanmdm:nmah_580938.png",
      alt: "Sèvres teapot with liberty emblems (Phrygian cap and fasces), 1795",
      text:
        "Around the turn of the century, even decorative objects began to echo the language of change, adapting emblems of liberty and reform.",
    },
  },
  {
    id: "teapots-common-ceremony",
    type: "sampler-intro",
    content: {
      text:
        "By the end of the century, tea was no longer a luxury and had become an emblem of domestic order and social aspiration.",
      samplers: [
        "assets/teapots/edanmdm:nmah_303591.png",
        "assets/teapots/edanmdm:nmah_303408.png",
        "assets/teapots/edanmdm:nmah_303459.png",
      ],
    },
  },
];

// fire marks (2 slides)
const FIRE_STORY_STEPS = [
  {
    id: "fire-marks-intro",
    type: "sampler-intro",
    content: {
      text:
        "Before public fire brigades, insurers marked their policyholders' houses with emblems. When a blaze broke out, companies rushed to homes that displayed their mark.",
      samplers: [
        "assets/fire_marks/edanmdm:nmah_1341592.png",
        "assets/fire_marks/edanmdm:nmah_1341904.png",
        "assets/fire_marks/edanmdm:nmah_1341930.png",
      ],
    },
  },
  {
    id: "fire-marks-overview",
    type: "compartment",
    content: {
      text:
        "Each emblem carried a promise of protection, mapping systems of responsibility and trust: who owed help to whom, and on what terms.",
      compartments: [
        { image: "assets/fire_marks/edanmdm:nmah_1341468.png", label: "Hand in Hand — Fire mark of the Philadelphia Contributionship, the first successful fire insurance company in America; its clasped hands symbolize their origin as a mutual insurer." },
        { image: "assets/fire_marks/edanmdm:nmah_1341921.png", label: "Fire mark of the Mutual Assurance Company, founded by former policyholders of the Philadelphia Contributionship to insure houses shaded by trees, after the Contributionship refused them." },
        { image: "assets/fire_marks/edanmdm:nmah_1341763.png", label: "Insurance Company of North America's eagle, the first joint stock insurance company in America, signaling the rise of modern finance in protection." },
        { image: "assets/fire_marks/edanmdm:nmah_1342275.png", label: "Baltimore Equitable Society' Sign of the Clasped Hands: wood and cast iron mark as proof of coverage." },
      ],
    },
  },
];

function getStorySlidesForKey(key) {
  switch (key) {
    case "samplers":
      return SAMPLER_STORY_STEPS;
    case "mugs":
      return PHARMA_STORY_STEPS;
    case "teapots":
      return TEAPOTS_STORY_STEPS;
    case "fire marks":
      return FIRE_STORY_STEPS;
    default:
      return [];
  }
}

/* -------------------------------
   13) story modal: setup + scope
   - scope class per family (e.g., story--teapots)
   - gestures: arrows, dots, swipe, wheel
-------------------------------- */

const COMPARTMENT_LOOP = true; // wrap around when arrowing past ends

function setStoryScope(key) {
  const modalEl = document.getElementById("storyModal");
  if (!modalEl) return;

  // drop any previous story--* scope
  [...modalEl.classList].forEach((cls) => {
    if (cls.startsWith("story--")) modalEl.classList.remove(cls);
  });

  modalEl.classList.add(`story--${key.replace(/\s+/g, "-")}`);
}

function setupStoryModal() {
  // core elements
  const modal = d3.select("#storyModal");
  const track = modal.select(".story-track");
  const dots = modal.select(".story-dots");
  const prevBtn = modal.select("[data-prev]");
  const nextBtn = modal.select("[data-next]");
  const backdrop = modal.select(".modal-backdrop");
  const closeEl = modal.selectAll("[data-close]");

  // gesture tuning
  const SWIPE_THRESHOLD = 80;
  const WHEEL_STEP = 220;
  const WHEEL_COOLDOWN = 320;

  let lastFocus = null;
  state.storyIndex = 0;
  state.storySlides = [];

  // mount slides + dots
  function renderSlides(slides) {
    const sel = track
      .selectAll("section.story-slide")
      .data(slides, (d) => d.id);

    const enter = sel
      .enter()
      .append("section")
      .attr("class", "story-slide")
      .attr("id", (d) => d.id)
      .html((d) => {
        let html = renderStepContent(d);
        if (d.type === "compartment" && d.content?.compartments) {
          html = html.replace(
            '<div class="compartment-container">',
            `<div class="compartment-container" data-compartments-json='${JSON.stringify(
              d.content.compartments
            ).replace(/'/g, "&apos;")}'>`
          );
        }
        return html;
      });

    // attach strong reference to avoid reparsing json later
    enter.each(function (d) {
      if (d.type === "compartment" && d.content?.compartments) {
        const node = this.querySelector(".compartment-container");
        if (node) node._compartments = d.content.compartments;
      }
    });

    sel.exit().remove();

    // load images
    track
      .selectAll("img")
      .attr("loading", "eager")
      .attr("decoding", "async")
      .style("max-width", "100%")
      .style("max-height", "100%");

    // dots (tablist semantics)
    dots
      .selectAll("button")
      .data(slides, (d) => d.id)
      .join("button")
      .attr("role", "tab")
      .attr("aria-controls", (d) => d.id)
      .attr("aria-label", (_d, i) => `go to slide ${i + 1}`)
      .attr("data-index", (_d, i) => i)
      .on("click", function () {
        go(+this.dataset.index);
      });
  }

  // update chrome after index changes
  function updateChrome() {
    modal.style("--story-i", state.storyIndex);

    const N = state.storySlides.length;
    prevBtn.property("disabled", state.storyIndex === 0);
    nextBtn.property("disabled", state.storyIndex === N - 1);

    dots.selectAll("button").each(function (_d, i) {
      if (i === state.storyIndex) {
        this.setAttribute("aria-selected", "true");
        this.tabIndex = 0;
      } else {
        this.removeAttribute("aria-selected");
        this.tabIndex = -1;
      }
    });
  }

  // move to target slide; seed compartment state if present
  function go(i) {
    const N = state.storySlides.length;
    state.storyIndex = Math.max(0, Math.min(N - 1, i));
    updateChrome();

    const activeSlide = track.selectAll(".story-slide").nodes()[state.storyIndex];
    if (activeSlide && activeSlide.querySelector(".compartment-container")) {
      state.compartmentProgress = 0;
      requestAnimationFrame(() => {
        wireCompartmentArrows();
        updateCompartmentView();
      });
    }
  }

  // swipe nav (ignore drags starting on interactive controls)
  let swipeX0 = null;

  track.on("pointerdown", (event) => {
    const interactive = event.target.closest(
      '.img-arrow, .story-nav, button, a, input, textarea, [role="tab"], [data-close]'
    );
    if (interactive) return;

    swipeX0 = event.clientX;
    track.node().setPointerCapture(event.pointerId);
  });

  track.on("pointerup", (event) => {
    if (swipeX0 == null) return;
    const dx = event.clientX - swipeX0;
    if (Math.abs(dx) > SWIPE_THRESHOLD) go(state.storyIndex + (dx < 0 ? 1 : -1));
    swipeX0 = null;
  });

  // wheel/trackpad nav with throttle to prevent overshoot
  (function addWheelNav() {
    const cardEl = modal.select(".story-card").node();
    if (!cardEl) return;

    let acc = 0;
    let last = 0;

    cardEl.addEventListener(
      "wheel",
      (e) => {
        const dx =
          Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
        if (!dx) return;

        e.preventDefault();
        const now = performance.now();
        if (now - last < WHEEL_COOLDOWN) return;

        acc += dx;

        if (acc > WHEEL_STEP) {
          go(state.storyIndex + 1);
          acc = 0;
          last = now;
        }
        if (acc < -WHEEL_STEP) {
          go(state.storyIndex - 1);
          acc = 0;
          last = now;
        }
      },
      { passive: false }
    );
  })();

  // keep chrome correct on resize/orientation while open
  const onResize = () => {
    if (!modal.node().hasAttribute("hidden")) updateChrome();
  };

  // open/close modal
  function open() {
    lastFocus = document.activeElement;
    renderSlides(state.storySlides);

    requestAnimationFrame(() => {
      go(0);
      modal.attr("hidden", null);
      d3.select("body").classed("modal-open", true);
      modal.select(".story-card").node()?.focus?.({ preventScroll: true });
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    });
  }

  function close() {
    modal.attr("hidden", "");
    d3.select("body").classed("modal-open", false);
    track.selectAll("*").remove();
    dots.selectAll("*").remove();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    lastFocus?.focus?.();
  }

// public api: open a family story and scope styles
window.openStory = (key) => {
  // look up the array of slide configs for this story key (e.g., "teapots")
  const slides = getStorySlidesForKey(key);
  // guard: if nothing came back, bail quietly
  if (!slides?.length) return;
  // stash a copy into whatever reactive/app state you use to render the track
  state.storySlides = slides.slice();
  // add a CSS body class like story--teapots so styles can scope to this story
  setStoryScope(key);
  // actually open the wide “stage” modal (adds aria attrs, focus trap, etc.)
  open();
};

  // outer nav/close affordances
  prevBtn.on("click", () => go(state.storyIndex - 1));
  nextBtn.on("click", () => go(state.storyIndex + 1));
  backdrop.on("click", close);
  closeEl.on("click", close);

  // bind arrows for the active compartment slide only
  window.wireCompartmentArrows = function wireCompartmentArrows() {
    const active = track.selectAll(".story-slide").nodes()[state.storyIndex];
    if (!active) return;

    const container = d3.select(active).select(".compartment-container");
    if (container.empty()) return;

    const n = container.selectAll(".viewport-image").size();
    if (n < 2) return;

    const stepSize = 1 / (n - 1);

    // remove any prior click handlers before re-attaching
    container.selectAll(".img-arrow").on("click", null);

    container.selectAll(".img-arrow").on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const isLeft = d3.select(event.currentTarget).classed("img-arrow-left");
      const dir = isLeft ? -1 : 1;

      let next = state.compartmentProgress + dir * stepSize;
      if (COMPARTMENT_LOOP) {
        if (next < 0) next = 1;
        if (next > 1) next = 0;
      } else {
        next = Math.max(0, Math.min(1, next));
      }

      state.compartmentProgress = next;
      updateCompartmentView();
    });
  };
}

/* -------------------------------
   14) init
   - hide tooltips on global wheel/touch
   - after DOM is ready: build segments, render steps, wire ui and scroll
-------------------------------- */

(function attachTooltipAutohide() {
  const hide = () => {
    const g = document.getElementById("gridTooltip");
    if (g) g.style.display = "none";
    const t = document.getElementById("treemap-tooltip");
    if (t) t.style.display = "none";
  };
  document.addEventListener("wheel", hide, { passive: true });
  document.addEventListener("touchmove", hide, { passive: true });
})();

window.addEventListener("DOMContentLoaded", init);

function init() {
  // layout + first render
  state.segments = buildSegments();
  renderSteps();
  updateCompartmentView(); // safe no-op unless a compartment is visible

  // wire ui affordances
  setupCategoryButtons();
  loadCategory(0);
  setupHeroObjectsButton();
  setupAboutModal();
  setupStoryModal();

  // scroll mechanics + arrows
  setTrackHeight();
  setupScrollListener();
  setupHeroDownArrow();
  enableUpArrow();

  // paint once with correct state
  const t0 = computeProgressAndActive();
  updateStepVisibility(t0);
  updateSamplerIntroReveal(t0);
  updateObjectGridProgress(t0);
  updateUpArrowVisibility();
  updateViewportBackgroundGrid();
}
