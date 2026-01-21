/**
 * app.js — orchestrates the main scrollytelling experience:
 * - builds the step track from HTML templates and config.steps
 * - wires scroll progress to hero, object grid, floor plan, treemap and footer
 * - manages modals (about, stories) and lightbox interactions
 */


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
          "History isn't only carved in bronze and stone. It survives in the fragments of the everyday: in the small habits that built a life, and then, a world.",
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
          "From the material remains of everyday actions, patterns emerge, tracing the outlines of what once was ordinary life.<br><br><em>Browse the full collection below.</em>",
      },
    },

    // treemap container (svg is injected; behavior is in treemap.js)
    {
      id: "treemap",
      type: "treemap",
      content: {},
    },

    // floor plan scene (card + 3×3 grid + svg)
    {
      id: "floor-plan",
      type: "floor-plan",
      content: {
        text:
          "But objects gain meaning only in place: a home, a room, a drawer—as they pass from life to life.",
      },
    },

    // final footer scene
    {
      id: "about-footer",
      type: "footer",
      content: {}, 
    },
  ],
};

/* -------------------------------
   grid category registry
   - keys map to "family" stories and to asset/metadata sources
   - manifest.json files list image filenames; csv provides tooltip metadata
-------------------------------- */

// the order of these categories must stay in sync with #categorySelector buttons in index.html
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
    label: "Apothecary jars",
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
  objectGridCategory: 0,    // which family is currently shown in the grid
  segments: [],             // normalized scroll segments (hero + steps)
  storyIndex: 0,            // active slide index inside the story modal
  storySlides: [],          // slide configuration array mounted in modal
  _lastActiveStepIndex: -2, // previous step index to detect boundary crosses
};

// breadcrumb (vertical chapter rail) state
let chapterRail = null;
let chapterRailSteps = [];


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
  treemap: 140, // slightly shorter so the viz enters sooner
  "floor-plan": 180, // moderate length to explore rooms
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

    const tpl = document.getElementById("card-step-template");
    if (!tpl) return "";

    // clone template content
    const fragment = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    const cardEl = wrapper.firstElementChild;

    // inject text (supports inline <br> etc.)
    const pEl = cardEl.querySelector(".card-text");
    if (pEl) pEl.innerHTML = txt;

    const imgEl = cardEl.querySelector(".card-image");

    if (img) {
      // if there is an image in config, use it
      imgEl.src = img;
      imgEl.alt = alt || "";
    } else {
      // no image for this card (e.g. outro) → remove img node
      imgEl.remove();
    }

    // return the final markup as a string
    return wrapper.innerHTML;
  }

  // sampler-intro (triptych) — used inside the modal
  if (t === "sampler-intro") {
    const si = step.content || {};
    const samplers = Array.isArray(si.samplers) ? si.samplers : [];

    const tpl = document.getElementById("sampler-intro-template");
    if (!tpl) return "";

    const frag = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);

    const textEl = wrapper.querySelector('[data-role="sampler-text"]');
    if (textEl) {
      textEl.innerHTML = si.text || "";
    }

    const galleryEl = wrapper.querySelector('[data-role="sampler-gallery"]');
    if (galleryEl) {
      samplers.forEach((src, i) => {
        const item = document.createElement("div");
        item.className = "sampler-item";
        item.dataset.index = String(i);

        const img = document.createElement("img");
        img.src = src;
        img.alt = `Sampler ${i + 1}`;

        item.appendChild(img);
        galleryEl.appendChild(item);
      });
    }

    return wrapper.innerHTML;
  }


  // sampler-intro-side (large image + card) — used inside the modal
  if (t === "sampler-intro-side") {
    const cs = step.content || {};

    const tpl = document.getElementById("sampler-intro-side-template");
    if (!tpl) return "";

    const frag = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);

    const imgEl = wrapper.querySelector('[data-role="sampler-image"]');
    if (imgEl) {
      imgEl.src = cs.image || "";
      imgEl.alt = cs.alt || "Object";
    }

    const textEl = wrapper.querySelector('[data-role="sampler-text"]');
    if (textEl) {
      textEl.innerHTML = cs.text || "";
    }

    return wrapper.innerHTML;
  }


  // compartment (stacked images cross-faded via normalized progress)
  if (t === "compartment") {
    const cc = step.content || {};
    const items = Array.isArray(cc.compartments) ? cc.compartments : [];

    // helper to convert number to Roman numeral
    const toRoman = (num) => {
      const lookup = [
        ["X", 10],
        ["IX", 9],
        ["V", 5],
        ["IV", 4],
        ["I", 1],
      ];
      let result = "";
      for (const [roman, value] of lookup) {
        while (num >= value) {
          result += roman;
          num -= value;
        }
      }
      return result;
    };

    const tpl = document.getElementById("compartment-step-template");
    if (!tpl) return "";

    const frag = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);

    const root = wrapper.firstElementChild;

    // label: first compartment’s label (or fallback)
    const firstLabel = items.length ? items[0].label || "" : "";
    const labelEl = root.querySelector('[data-role="viewport-label"]');
    if (labelEl) {
      labelEl.textContent = firstLabel;
    }

    // images: create .viewport-image wrappers
    const imagesContainer = root.querySelector('[data-role="viewport-images"]');
    if (imagesContainer) {
      items.forEach((comp, i) => {
        const src = comp?.image || "";
        const lab = comp?.label || `Compartment ${i + 1}`;

        const wrap = document.createElement("div");
        wrap.className = "viewport-image";
        wrap.dataset.index = String(i);

        const img = document.createElement("img");
        img.src = src;
        img.alt = lab;

        wrap.appendChild(img);
        imagesContainer.appendChild(wrap);
      });
    }

    // indicators: Roman numerals I, II, III, ...
    const indicatorsContainer = root.querySelector(
      '[data-role="viewport-indicators"]'
    );
    if (indicatorsContainer) {
      items.forEach((comp, i) => {
        const btn = document.createElement("button");
        btn.className = "viewport-indicator" + (i === 0 ? " active" : "");
        btn.dataset.index = String(i);
        btn.setAttribute("aria-label", `View image ${i + 1}`);
        btn.textContent = toRoman(i + 1);
        indicatorsContainer.appendChild(btn);
      });
    }

    // caption text + progress bar (structure is already in template)
    const textEl = root.querySelector('[data-role="compartment-text"]');
    if (textEl) {
      textEl.innerHTML = cc.text || "";
    }

    return wrapper.innerHTML;
  }


  // single hero image + card — used inside the modal
  if (t === "sampler-intro-single") {
    const cs = step.content || {};

    const tpl = document.getElementById("sampler-intro-single-template");
    if (!tpl) return "";

    const frag = tpl.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);

    const imgEl = wrapper.querySelector('[data-role="sampler-image"]');
    if (imgEl) {
      imgEl.src = cs.image || "";
      imgEl.alt = cs.alt || "Sampler";
    }

    const textEl = wrapper.querySelector('[data-role="sampler-text"]');
    if (textEl) {
      textEl.innerHTML = cs.text || "";
    }

    return wrapper.innerHTML;
  }


  // object grid step (left column: narrative + category selector; right: grid)
  if (t === "object-grid") {
    const tpl = document.getElementById("object-grid-step-template");
    return tpl ? tpl.innerHTML : "";
  }


  // treemap host structure (template-based)
  if (t === "treemap") {
    const tpl = document.getElementById("treemap-step-template");
    return tpl ? tpl.innerHTML : "";
  }


    // floor plan scene (card + 3×3 grid + floor plan svg)
    if (t === "floor-plan") {
      const tpl = document.getElementById("floor-plan-step-template");
      return tpl ? tpl.innerHTML : "";
    }


    // final footer scene
    if (t === "footer") {
      const tpl = document.getElementById("footer-step-template");
      return tpl ? tpl.innerHTML : "";
    }

    // unknown type → render nothing
    return "";
  }

/* -------------------------------
   8) scroll listener + step logic
   - compute global progress, set active step, and drive per-step updates
-------------------------------- */

function setupChapterRail() {
  chapterRail = document.querySelector(".chapter-rail");
  if (!chapterRail) return;

  chapterRailSteps = Array.from(
    chapterRail.querySelectorAll(".chapter-rail-step")
  );

  // start hidden in the hero
  chapterRail.classList.add("chapter-rail--hidden");

  // clear any hardcoded state
  chapterRailSteps.forEach((el) => {
    el.classList.remove("is-current", "is-complete");
  });
}

/**
 * update which segment is highlighted + whether the rail is visible.
 * t is the global scroll progress 0..1 from computeProgressAndActive().
 */
function updateChapterRail(t) {
  if (!chapterRail || !chapterRailSteps.length) return;

  const heroSeg = segmentOf("hero");
  const inHero = heroSeg ? t < heroSeg.end : state.activeStepIndex === -1;

  // hide rail in hero; show after
  chapterRail.classList.toggle("chapter-rail--hidden", inHero);

  if (inHero) return; // don't highlight anything yet

  // map activeStepIndex (0..6) → one of the 7 segments
  const idx = Math.max(
    0,
    Math.min(config.steps.length - 1, state.activeStepIndex)
  );

  chapterRailSteps.forEach((stepEl, i) => {
    // current section
    stepEl.classList.toggle("is-current", i === idx);
    // everything before current is "complete"
    stepEl.classList.toggle("is-complete", i < idx);
    // everything after has neither class
    if (i > idx) {
      stepEl.classList.remove("is-complete");
    }
  });
}


function setupScrollListener() {
  const container = document.getElementById("scrollContainer");
  container.addEventListener(
    "scroll",
    () => {
      const t = computeProgressAndActive();
      updateStepVisibility(t);
      updateObjectGridProgress(t);
      updateFloorPlanGrid(); // populate floor plan grid when step is active
      updateUpArrowVisibility();
      updateViewportBackgroundGrid();
      updateChapterRail(t);

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

  // figure out which step is active, if any
  const step =
    state.activeStepIndex >= 0 ? config.steps[state.activeStepIndex] : null;

  // use grid for all “inner” scenes except the final footer
  const shouldGrid =
    step && step.type !== "footer" && step.id !== "about-footer";

  if (shouldGrid) viewportBg.classList.add("grid-bg");
  else viewportBg.classList.remove("grid-bg");
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

// populate floor plan grid when floor-plan step becomes active
let floorPlanState = {
  svgObject: null,
  currentRoom: null,
  isHovering: false,
  initialized: false,
  metaIndex: null
};

function updateFloorPlanGrid() {
  const grid = document.getElementById("floorPlanGrid");
  const svgObject = document.getElementById("floorPlanSvg");
  const deselectBtn = document.getElementById("floorPlanDeselect");

  if (!grid || !svgObject) return;

  // only initialize once
  if (floorPlanState.initialized) return;
  floorPlanState.initialized = true;
  
  // store reference for pulse function
  floorPlanState.svgObject = svgObject;

  // load metadata CSV for floor plan
  if (!floorPlanState.metaIndex) {
    d3.csv("treemap_data/final_database_with_materials_enriched_places.csv")
      .then((rows) => {
        floorPlanState.metaIndex = indexMetadata(rows || []);
      })
      .catch(() => {
        console.warn("Failed to load floor plan metadata");
        floorPlanState.metaIndex = new Map();
      });
  }

  // room-specific image sets
  const roomImages = {
    kitchen: [
      "assets/kitchen/edanmdm:nmah_300463.png",
      "assets/kitchen/edanmdm:nmah_302668.png",
      "assets/kitchen/edanmdm:nmah_303591.png",
      "assets/kitchen/edanmdm:nmah_304687.png",
      "assets/kitchen/edanmdm:nmah_307137.png",
      "assets/kitchen/edanmdm:nmah_310953.png",
      "assets/kitchen/edanmdm:nmah_573189.png",
      "assets/kitchen/edanmdm:nmah_588685.png",
      "assets/kitchen/edanmdm:nmah_319699.png"
    ],
    pantry: [
      "assets/pantry/edanmdm:nmah_300188.png",
      "assets/pantry/edanmdm:nmah_307142.png",
      "assets/pantry/edanmdm:nmah_300372.png",
      "assets/pantry/edanmdm:nmah_309551.png",
      "assets/pantry/edanmdm:nmah_318649.png",
      "assets/pantry/edanmdm:nmah_307151.png",
      "assets/pantry/edanmdm:nmah_574272.png",
      "assets/pantry/edanmdm:nmah_1065301.png",
      "assets/pantry/edanmdm:nmah_579919.png"
    ],
    bedroom: [
      "assets/bedroom/edanmdm:nmah_303814.png",
      "assets/bedroom/edanmdm:nmah_307604.png",
      "assets/bedroom/edanmdm:nmah_308141.png",
      "assets/bedroom/edanmdm:nmah_316221.png",
      "assets/bedroom/edanmdm:nmah_371747.png",
      "assets/bedroom/edanmdm:nmah_597629.png",
      "assets/bedroom/edanmdm:nmah_994616.png",
      "assets/bedroom/edanmdm:nmah_620527.png",
      "assets/bedroom/edanmdm:nmah_994619.png",
    ],
    living: [
      "assets/living/edanmdm:nmah_306570.png",
      "assets/living/edanmdm:nmah_1464379.png",
      "assets/living/edanmdm:nmah_308606.png",
      "assets/living/edanmdm:nmah_609222.png",
      "assets/living/edanmdm:saam_1972.85.17A.png",
      "assets/living/edanmdm:nmah_994614.png",
      "assets/living/edanmdm:nmah_318378.png",
      "assets/living/edanmdm:nmah_319092.png",    
      "assets/living/edanmdm:nmah_308263.png"
    ],
    parlor: [
      "assets/parlor/edanmdm:nmah_303782.png",
      "assets/parlor/edanmdm:nmah_303412.png",
      "assets/parlor/edanmdm:nmah_324279.png",
      "assets/parlor/edanmdm:nmah_322908.png",
      "assets/parlor/edanmdm:nmah_663562.png",
      "assets/parlor/edanmdm:nmah_577385.png",
      "assets/parlor/edanmdm:nmah_579032.png",
      "assets/parlor/edanmdm:nmah_1189272.png",
      "assets/parlor/edanmdm:nmah_1415726.png"
    ],
    outside: [
      "assets/outside/edanmdm:nmah_300582.png",
      "assets/outside/edanmdm:nmah_308546.png",
      "assets/outside/edanmdm:nmah_303055.png",
      "assets/outside/edanmdm:nmah_313067.png",
      "assets/outside/edanmdm:nmah_304081.png",
      "assets/outside/edanmdm:nmah_1341763.png",
      "assets/outside/edanmdm:nmah_1458761.png",
      "assets/outside/edanmdm:nmah_573197.png",
      "assets/outside/edanmdm:nmah_311178.png"
    ]
  };

  function populateGrid(room, isPreview = false) {
    grid.innerHTML = ""; // clear existing items
    
    if (!room) {
      // show placeholders when no room is selected
      for (let i = 0; i < 9; i++) {
        const item = document.createElement("div");
        item.className = "grid-item floor-plan-placeholder loaded";
        item.innerHTML = '<div class="placeholder-content"></div>';
        
        // click handler to pulse all room rectangles as a hint
        item.addEventListener("click", (e) => {
          e.preventDefault();
          pulseAllRooms();
        });
        
        grid.appendChild(item);
      }
      return; // exit early if no room
    }
    
    const images = roomImages[room] || [];
    
    images.forEach((src, i) => {
      const item = document.createElement("div");
      item.className = "grid-item";
      if (isPreview) {
        item.classList.add("preview-mode");
      }
      const img = document.createElement("img");
      img.src = src;
      img.alt = `${room} object ${i + 1}`;
      img.loading = "lazy";
      
      item.appendChild(img);

      const isMobile = window.matchMedia("(max-width: 900px)").matches;

      // desktop: tooltip on hover
      if (!isMobile) {
        const tip = ensureTooltip();

        item.addEventListener("mouseenter", (e) => {
          if (!floorPlanState.metaIndex) return;
          const id = idFromPath(src);
          const row = floorPlanState.metaIndex.get(id);
          const html = tooltipHTML(row);
          if (!html) return;
          tip.innerHTML = html;
          tip.style.display = "block";
          positionTooltip(tip, e.clientX, e.clientY);
        });

        item.addEventListener("mousemove", (e) => {
          if (tip.style.display !== "none") {
            positionTooltip(tip, e.clientX, e.clientY);
          }
        });

        item.addEventListener("mouseleave", () => {
          tip.style.display = "none";
        });
      }

      // add click handler for lightbox with metadata lookup
      item.addEventListener("click", (e) => {
        e.preventDefault();
        // extract ID from image path and lookup metadata
        const id = idFromPath(src);
        const metadata = floorPlanState.metaIndex
          ? floorPlanState.metaIndex.get(id)
          : null;
        openLightbox(src, metadata);
      });
      
      grid.appendChild(item);
    });

    // add loaded class to all items at once after a brief delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        grid.querySelectorAll('.grid-item:not(.floor-plan-placeholder)').forEach(item => {
          item.classList.add('loaded');
        });
      });
    });
  }
  function clearRoomSelection() {
    if (!floorPlanState.currentRoom) return;

    // reset state
    floorPlanState.currentRoom = null;
    floorPlanState.isHovering = false;

    // restore placeholders in the grid
    populateGrid(null);

    // clear fills from all rooms in the SVG
    if (floorPlanState.svgObject && floorPlanState.svgObject.contentDocument) {
      const svgDoc = floorPlanState.svgObject.contentDocument;
      const rooms = ["kitchen", "pantry", "bedroom", "living", "parlor", "outside"];

      rooms.forEach((name) => {
        const group = svgDoc.getElementById(`room-${name}`);
        if (!group) return;
        group.querySelectorAll("rect").forEach((rect) => {
          rect.style.fill = "transparent";
        });
      });
    }
  }

  // function to pulse all room rectangles as a visual hint
  function pulseAllRooms() {
    if (!floorPlanState.svgObject) {
      return;
    }
    const svgDoc = floorPlanState.svgObject.contentDocument;
    if (!svgDoc) {
      return;
    }

    const rooms = ["kitchen", "living", "bedroom", "parlor", "outside", "pantry"];
    
    rooms.forEach((roomName) => {
      const roomGroup = svgDoc.getElementById(`room-${roomName}`);
      if (!roomGroup) {
        return;
      }

      const rects = roomGroup.querySelectorAll("rect");
      rects.forEach((rect) => {
        // apply inline animation instead of class - match hover opacity
        rect.style.animation = "roomPulse 0.4s ease-in-out 1";
        rect.style.fill = "rgba(218, 203, 178, 0.45)";
        
        // remove animation after it completes (1 cycle × 0.4s = 400ms)
        setTimeout(() => {
          rect.style.animation = "";
          // reset to transparent if not selected
          if (roomName !== floorPlanState.currentRoom) {
            rect.style.fill = "transparent";
          } else {
            rect.style.fill = "rgba(218, 203, 178, 0.65)";
          }
        }, 400);
      });
    });
  }

  // initialize with bedroom selected by default
  if (grid.children.length === 0) {
    floorPlanState.currentRoom = "bedroom";
    populateGrid("bedroom");
  }

  // function to attach room listeners (desktop + mobile)
  function attachRoomListeners() {
    const svgObj = floorPlanState.svgObject || document.getElementById("floorPlanSvg");
    if (!svgObj) return;

    const svgDoc = svgObj.contentDocument;
    if (!svgDoc || !svgDoc.documentElement) return;

    const svgRoot = svgDoc.documentElement;
    if (svgRoot) {
      svgRoot.style.filter = "none";

      const paths = svgDoc.querySelectorAll("path, line, polyline, polygon");
      paths.forEach((el) => {
        const currentFill = el.getAttribute("fill");
        if (
          !currentFill ||
          currentFill === "none" ||
          currentFill === "#000" ||
          currentFill === "#000000" ||
          currentFill === "black"
        ) {
          el.setAttribute("fill", currentFill === "none" ? "none" : "#2f2f2f");
        } else if (currentFill !== "transparent") {
          el.setAttribute("fill", "#2f2f2f");
        }

        const currentStroke = el.getAttribute("stroke");
        if (currentStroke && currentStroke !== "none") {
          el.setAttribute("stroke", "#2f2f2f");
        }

        el.style.pointerEvents = "none";
      });
    }

    const rooms = ["kitchen", "living", "bedroom", "parlor", "outside", "pantry"];

    rooms.forEach((roomName) => {
      const roomGroup = svgDoc.getElementById(`room-${roomName}`);
      if (!roomGroup) {
        console.warn(`Room group not found: room-${roomName}`);
        return;
      }

      const rects = Array.from(roomGroup.querySelectorAll("rect"));
      if (!rects.length) {
        console.warn(`Rectangle(s) not found in room-${roomName}`);
        return;
      }

      const setRoomFill = (fill) => {
        rects.forEach((r) => {
          r.style.fill = fill;
        });
      };

      rects.forEach((rect) => {
        rect.style.cursor = "pointer";
        rect.style.fill = "transparent";
        rect.style.transition = "fill 0.2s ease";
        rect.style.filter = "none";

        const parent = rect.parentElement;
        if (parent) parent.insertBefore(rect, parent.firstChild);

        const handleMouseEnter = () => {
          setRoomFill("rgba(218, 203, 178, 0.45)"); 

          if (!floorPlanState.currentRoom) {
            floorPlanState.isHovering = true;
            populateGrid(roomName, true); // preview mode
          }
        };

        const handleMouseLeave = () => {
          const isSelected = roomName === floorPlanState.currentRoom;
          setRoomFill(isSelected ? "rgba(218, 203, 178, 0.65)" : "transparent");

          if (floorPlanState.isHovering && !floorPlanState.currentRoom) {
            floorPlanState.isHovering = false;
            populateGrid(null); // restore placeholders
          }
        };

        // shared activation handler (click / tap)
        const handleActivate = (evt) => {
          if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
          }

          floorPlanState.currentRoom = roomName;
          floorPlanState.isHovering = false;
          populateGrid(roomName, false);

          // visual feedback: highlight only this room's rects, clear others
          rooms.forEach((r) => {
            const rg = svgDoc.getElementById(`room-${r}`);
            if (!rg) return;
            const rRects = rg.querySelectorAll("rect");
            rRects.forEach((rRect) => {
              rRect.style.fill =
                r === roomName ? "rgba(218, 203, 178, 0.65)" : "transparent";
            });
          });
        };

        rect.addEventListener("mouseenter", handleMouseEnter);
        rect.addEventListener("mouseleave", handleMouseLeave);

        // desktop click
        rect.addEventListener("click", handleActivate);

        // mobile tap support
        rect.addEventListener("touchstart", handleActivate, { passive: false });
      });
    });

    // highlight bedroom by default on initial load
    if (floorPlanState.currentRoom === "bedroom") {
      const bedroomGroup = svgDoc.getElementById("room-bedroom");
      if (bedroomGroup) {
        const bedroomRects = bedroomGroup.querySelectorAll("rect");
        bedroomRects.forEach((rect) => {
          rect.style.fill = "rgba(218, 203, 178, 0.65)";
        });
      }
    }

    // deselect button handler
    if (deselectBtn) {
      deselectBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        floorPlanState.currentRoom = null;
        populateGrid(null);

        // clear all room highlights
        rooms.forEach((r) => {
          const rg = svgDoc.getElementById(`room-${r}`);
          if (rg) {
            const rRects = rg.querySelectorAll("rect");
            rRects.forEach((rRect) => {
              rRect.style.fill = "transparent";
            });
          }
        });
      });
    }
  }

  // allow deselecting the current room by clicking anywhere in this step
  const stepEl = grid.closest(".floor-plan-step");
  if (stepEl) {
    stepEl.addEventListener("click", (event) => {
      if (!floorPlanState.currentRoom) return;
      if (grid.contains(event.target)) return;

      clearRoomSelection();
    });
  }

  // wait for SVG to finish loading, then wire listeners once
  const doc = svgObject.contentDocument;
  if (doc && doc.getElementById("room-kitchen")) {
    attachRoomListeners();
  } else {
    svgObject.addEventListener(
      "load",
      () => {
        attachRoomListeners();
      },
      { once: true }
    );
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
  const indicators = stepEl.querySelectorAll(".viewport-indicator");
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
  
  // update active indicator
  if (indicators.length) {
    const activeIdx = Math.round(local * (n - 1));
    indicators.forEach((ind, k) => {
      ind.classList.toggle('active', k === activeIdx);
    });
  }
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
    el.className = "tooltip-panel";      // 🔴 add the shared look
    document.body.appendChild(el);
  } else {
    // in case it already existed before you added this code
    el.classList.add("tooltip-panel");
  }
  return el;
}


function idFromPath(path) {
  // get filename from path
  const filename = path.split("/").pop();
  // remove only the final extension (.png, .jpg, etc.)
  // this preserves dots in the ID like "saam_1972.85.17A"
  return filename.replace(/\.(png|jpg|jpeg|gif|svg|webp)$/i, "");
}

function indexMetadata(rows) {
  const idx = new Map();
  rows.forEach((r) => {
    let u = (r.EDANurl || "").trim();
    if (!u) return;

    // if it's already just an ID (no slashes), use it directly
    let seg = u.includes("/") ? (u.split("/").pop() || u) : u;
    seg = seg.split("?")[0].split("#")[0];

    try {
      seg = decodeURIComponent(seg);
    } catch (e) {}

    // don't remove dots from the segment - only remove file extensions if present
    seg = seg.replace(/\.(png|jpg|jpeg|gif|svg|webp)$/i, "");
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

  // desktop: tooltip on hover when metadata is available
  const isMobile = window.matchMedia("(max-width: 900px)").matches;

  if (!isMobile) {
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
        if (tip.style.display !== "none") {
          positionTooltip(tip, event.clientX, event.clientY);
        }
      })
      .on("mouseleave", function () {
        tip.style.display = "none";
      });
  } else {
    // on mobile, ensure we have no hover handlers
    cards
      .on("mouseenter", null)
      .on("mousemove", null)
      .on("mouseleave", null);
  }

  // click: always open lightbox (desktop + mobile)
  cards.on("click", function (event, d) {
    event.preventDefault();
    if (!metaIndex) return;
    const id = idFromPath(d);
    const row = metaIndex.get(id);
    openLightbox(d, row);
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

// update view story button text and data attribute
const viewStoryBtn = document.getElementById("viewStoryBtn");
const cat = GRID_CATEGORIES[idx];   // declare cat ONCE

if (!cat) return Promise.resolve();

if (viewStoryBtn) {
  const categories = ["Samplers", "Apothecary Jars", "Teapots", "Fire Marks"];
  viewStoryBtn.setAttribute("data-story", cat.key);
  viewStoryBtn.textContent = `View ${categories[idx]} Story`;
}

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

  // clicks inside the selector - change selected category
  sel.addEventListener("click", (e) => {
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

  // view story button click handler
  const viewStoryBtn = document.getElementById("viewStoryBtn");
  if (viewStoryBtn) {
    viewStoryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const key = viewStoryBtn.getAttribute("data-story") || "";
      if (window.openStory && key) window.openStory(key);
    });
  }
}

/* -------------------------------
   12) lightbox
   - simple overlay for viewing grid images in detail
-------------------------------- */

function ensureLightbox() {
  const el = document.getElementById("lightbox");
  if (!el) return null;

  // only wire events once
  if (!el.dataset.initialized) {
    // close on backdrop click
    el.addEventListener("click", (e) => {
      if (e.target === el) closeLightbox();
    });

    // close button
    const closeBtn = el.querySelector(".lightbox-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeLightbox);
    }

    // escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("visible")) {
        closeLightbox();
      }
    });

    el.dataset.initialized = "true";
  }

  return el;
}


function openLightbox(imageSrc, metadata) {
  const lightbox = ensureLightbox();
  const img = lightbox.querySelector(".lightbox-image");
  const titleEl = lightbox.querySelector(".lightbox-title");
  const materialsEl = lightbox.querySelector(".lightbox-materials");

  img.src = imageSrc;
  img.alt = metadata?.title || "Object";

  const title = capitalizeFirstLetter(pick(metadata, ["title"]) || "");
  const materials = capitalizeFirstLetter(pick(metadata, ["materials"]) || "");

  titleEl.textContent = title || "Object";
  materialsEl.textContent = materials ? `Materials: ${materials}` : "";

  lightbox.classList.add("visible");
  document.body.style.overflow = "hidden";

  // hide tooltip if open
  const tooltip = document.getElementById("gridTooltip");
  if (tooltip) tooltip.style.display = "none";
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (lightbox) {
    lightbox.classList.remove("visible");
    document.body.style.overflow = "";
  }
}

/* -------------------------------
   13) story slide definitions
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
   14) story modal: setup + scope
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

  // bind numbered indicators for the active compartment slide only
  window.wireCompartmentArrows = function wireCompartmentArrows() {
    const active = track.selectAll(".story-slide").nodes()[state.storyIndex];
    if (!active) return;

    const container = d3.select(active).select(".compartment-container");
    if (container.empty()) return;

    const viewport = container.select(".sampler-viewport");
    if (viewport.empty()) return;

    const n = container.selectAll(".viewport-image").size();
    if (n < 2) return;

    const stepSize = 1 / (n - 1);

    // remove any prior handlers before re-attaching
    container.selectAll(".viewport-indicator").on("click", null);

    // numbered indicator clicks
    container.selectAll(".viewport-indicator").on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const idx = +d3.select(event.currentTarget).attr("data-index");
      state.compartmentProgress = idx * stepSize;
      updateCompartmentView();
    });
  };
}

function setupInfoTooltips() {
  const icons = document.querySelectorAll(".info-hover-icon");
  if (!icons.length) return;

  const wireIcon = (icon) => {
    const tooltip = icon.nextElementSibling;
    if (!tooltip || !tooltip.classList.contains("tooltip-panel")) return;

    if (icon.dataset.hasInfoHandler === "true") return;
    icon.dataset.hasInfoHandler = "true";

    const toggle = (evt) => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        evt.preventDefault();
        evt.stopPropagation();

        const isOpen = tooltip.classList.contains("is-open");

        document
          .querySelectorAll(".tooltip-panel.is-open")
          .forEach((el) => {
            if (el !== tooltip) el.classList.remove("is-open");
          });

        if (!isOpen) {
          tooltip.classList.add("is-open");
        } else {
          tooltip.classList.remove("is-open");
        }
      }
    };

    icon.addEventListener("click", toggle);
    icon.addEventListener("touchstart", toggle, { passive: false });
  };

  icons.forEach(wireIcon);

  document.addEventListener("click", (evt) => {
    if (evt.target.closest(".info-hover-icon, .tooltip-panel")) return;
    document
      .querySelectorAll(".tooltip-panel.is-open")
      .forEach((el) => el.classList.remove("is-open"));
  });
}


/* -------------------------------
   15) init
   - hide tooltips on global wheel/touch
   - after DOM is ready: build segments, render steps, wire ui and scroll
-------------------------------- */

(function attachTooltipAutohide() {
  const hide = () => {
    const g = document.getElementById("gridTooltip");
    if (g) g.style.display = "none";
    const t = document.getElementById("treemap-tooltip");
    if (t) t.style.display = "none";

    // close any info tooltips that are open
    document
      .querySelectorAll(".tooltip-panel.is-open, .floor-plan-info-tooltip.is-open")
      .forEach((el) => el.classList.remove("is-open"));
  };
  document.addEventListener("wheel", hide, { passive: true });
  document.addEventListener("touchmove", hide, { passive: true });
})();

window.addEventListener("DOMContentLoaded", init);

function init() {
  // layout + first render
  state.segments = buildSegments();
  renderSteps();
  updateFloorPlanGrid();
  updateCompartmentView(); // safe no-op unless a compartment is visible

  // wire ui affordances
  setupCategoryButtons();
  loadCategory(0);
  setupHeroObjectsButton();
  setupAboutModal();
  setupStoryModal();
  setupInfoTooltips()

  // scroll mechanics + arrows
  setTrackHeight();
  setupScrollListener();
  setupHeroDownArrow();
  enableUpArrow();
  setupChapterRail();

  // paint once with correct state
  const t0 = computeProgressAndActive();
  updateStepVisibility(t0);
  updateObjectGridProgress(t0);
  updateUpArrowVisibility();
  updateViewportBackgroundGrid();
}
