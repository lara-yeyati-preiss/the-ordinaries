// defining the content configuration for all scrollytelling steps rendered inside the sticky viewport
// (this drives what we render in the viewport, in which order, and with which fields per step)
const config = {
  steps: [
    // defining the first intro card
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
    // second intro card
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
    // sampler intro section showing three samplers
    {
      id: "sampler-intro",
      type: "sampler-intro",
      content: {
        text:
          "In Revolutionary-era America, young women stitched samplers—linen squares used to practice letters, numbers, and the discipline of the hand.",
        samplers: [
          "assets/samplers/edanmdm:nmah_639698.png",
          "assets/samplers/edanmdm:nmah_649894.png",
          "assets/samplers/edanmdm:nmah_1134702.png",
        ],
      },
    },

    // new single-image sampler-intro style step (now placed after sampler-intro)
    // (same visual language as sampler-intro, but with one large image; text is kept in the card)
    {
      id: "sampler-single",
      type: "sampler-intro-single",
      content: {
        text: "These embroidered works displayed patience and skill. They mirrored the ideals of the new republic—training women to embody virtue through education, morality, and domestic order.",
  image: "assets/edanmdm:nmah_639739-details.png",
        alt: "Sampler showing skill, patience, and diligence."
      }
    },
    // compartment step that crossfades between sampler images with a label and progress bar
    // (scroll progress drives the crossfade; arrows also nudge progress)
    {
      id: "sampler-compartment",
      type: "compartment",
      content: {
        text:
          "Each sampler holds its own system.\nAlphabets, houses, verses practiced one stitch at a time.",
        compartments: [
          { image: "assets/samplers/edanmdm:nmah_643873.png",  label: "Alphabets" },
          { image: "assets/samplers/edanmdm:nmah_644829.png",  label: "Alphabets" },
          { image: "assets/samplers/edanmdm:nmah_1139039.png", label: "Alphabets" },
          { image: "assets/samplers/edanmdm:nmah_1093871.png", label: "Houses" },
          { image: "assets/samplers/edanmdm:nmah_1341531.png", label: "Houses" },
          { image: "assets/samplers/edanmdm:nmah_649885.png",  label: "Houses" },
          { image: "assets/samplers/edanmdm:nmah_639698.png",  label: "Verses" },
          { image: "assets/samplers/edanmdm:nmah_1141751.png", label: "Verses" },
        ],
      },
    },

    // object grid step (categories rotate as you scroll within the step)
    // (we’ll load a manifest per category and render a 7×3 grid)
    {
      id: "rituals",
      type: "object-grid",
      content: {
        text:
          "These rituals and repetitions extended across other habits, each one revealing glimpses of how life was imagined and ordered.",
      },
    },
    // outro card
    {
      id: "outro",
      type: "card",
      content: {
      text:
        "From the material remains of everyday actions, a pattern emerges—tracing the outlines of what once was ordinary life.<br><br><em>Browse the full collection below.</em>",
      },
    },

    // final step: treemap
    // (the markup for svg + details panel is injected here; treemap.js binds behavior)
    {
      id: "treemap",
      type: "treemap",
      content: {}
    },
  ],
};


// defining the object-grid categories, their file roots, manifests, and optional csv metadata
// (the csv provides tooltip info keyed by EDANurl-derived ids; manifests list image filenames)
const GRID_CATEGORIES = [
  { key: "samplers", label: "Samplers", path: "assets/samplers",
    manifest: "assets/samplers/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv" },
  { key: "mugs",   label: "Mugs",   path: "assets/mugs",
    manifest: "assets/mugs/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv" },
  { key: "teapots",  label: "Teapots",  path: "assets/teapots",
    manifest: "assets/teapots/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv" },
  { key: "pocket watches",    label: "Pocket Watches",    path: "assets/pocket_watches",
    manifest: "assets/pocket_watches/manifest.json",
    csv: "treemap_data/final_database_with_materials.csv" },
];


// centralizing runtime state (active step, per-step progress, timeline, etc.)
// (single source of truth for scroll math + which scene is active)
let state = {
  activeStepIndex: -1,    // which step is currently “on screen”, starting at -1 = hero
  compartmentProgress: 0, // how far through the sampler-compartment we are (0→1) - other code uses this to crossfade images and fill the progress bar
  samplerIntroProgress: 0,// how far through the sampler-intro (the three big samplers) we are (0→1)
  objectGridCategory: 0,  // deciding which category to load into the object grid step (defined below, samplers is 0/teapots is 1/books is 2/clocks is 3)
  segments: []            // precomputed scroll ranges for hero + each step (each item says "this step occupies t from X to Y”)
};



// === helper utilities for segment math and lookup ===========================

// getting the segment object (start, end, height, etc.) that matches a given step id
// (saves repeated lookups across the code)
function segmentOf(id) { 
  return state.segments.find(s => s.id === id);
}

// computing local progress within a step, given global scroll progress t ∈ [0,1]
// (maps the big 0..1 scroll to the subrange of a specific step, then normalizes)
function localProgress(t, stepId) {
  const seg = segmentOf(stepId);
  if (!seg) return 0;
  // converting absolute scroll (t) into normalized progress for this step only
  // (t - seg.start) moves origin to step start, dividing by step length rescales 0..1
  // clamp ensures progress never goes below 0 or above 1
  return Math.max(0, Math.min(1, (t - seg.start) / (seg.end - seg.start)));
}


// === configuring virtual heights for steps (measured in viewport heights) ===

// defining how long each scene should last in scroll distance
// (each segment’s “h” is in vh units; we sum them to build one large runway)
const DEFAULT_VH = 120; // standard scene length
const PER_STEP_VH = {
  "sampler-compartment": 200, // even slower scroll for compartment scene
  "rituals": 280,            // slower scroll for grid section
  "treemap": 100
};


// === building a normalized scroll timeline for every segment ===============

// builds state.segments with normalized [start,end] ranges that partition t ∈ [0..1]
// (hero is included as the first “segment”, index 0)
function buildSegments() {
  // starting timeline with hero section (treated like a step)
  const segs = [{ id: "hero", h: DEFAULT_VH }];

  // adding each configured step and assigning its height (default or custom)
  config.steps.forEach(s => 
    segs.push({ id: s.id, h: PER_STEP_VH[s.id] || DEFAULT_VH })
  );

  // summing up total virtual height for all segments (used to normalize 0..1)
  const totalVH = segs.reduce((a, s) => a + s.h, 0);

  // walking through each segment to assign normalized start/end values
  let acc = 0; // running accumulator of heights
  return segs.map(s => {
    const start = acc / totalVH;       // start position as fraction of total
    const end = (acc + s.h) / totalVH; // end position as fraction of total
    acc += s.h;                        // advancing accumulator for next segment
    // returning the enriched segment with its bounds and totalVH context
    return { ...s, start, end, totalVH };
  });
}


// === setting up the scrollable runway inside the main container =============

// converts the sum of segment heights into a real min-height on the track,
// which makes the container scrollable through all scenes
function setTrackHeight() {
  const track = document.querySelector(".scrolly-track");
  // summing all segment virtual heights
  const total = state.segments.reduce((a, s) => a + s.h, 0);
  // setting the track’s physical height so all scenes can be scrolled
  if (track) track.style.minHeight = `${total}vh`;
}


// === programmatic scroll jump directly into the treemap scene ===============

// convenience jump used by the hero cta: scrolls just inside the treemap segment
// (epsilon avoids landing exactly on a boundary due to float rounding)
function scrollToTreemapStart(behavior = "instant") {
  const container = document.getElementById("scrollContainer");
  const seg = segmentOf("treemap");
  if (!container || !seg) return;
  const scrollHeight = container.scrollHeight - container.clientHeight;

  // land just INSIDE the START of the treemap segment
  const epsilon = Math.max(0.0003, (seg.end - seg.start) * 0.02);
  const t = Math.min(1, seg.start + epsilon);

  container.scrollTo({ top: Math.round(t * scrollHeight), behavior });
}



// === enabling the hero "Objects by Use" button ==============================

// exposes a low-latency path to the treemap: scrolls, then politely requests a reset
function setupHeroObjectsButton() {
  const btn = document.getElementById("heroBtnObjects");
  if (!btn) return;

  // removing disabled attributes (for accessibility and visual state)
  btn.removeAttribute("disabled");
  btn.setAttribute("aria-disabled", "false");

  // wiring a click → direct scroll into treemap
btn.addEventListener("click", () => {
  // scroll to the START of the treemap segment
  scrollToTreemapStart("instant");

  // after the layout is in view, force the overview
  // rAF twice ensures the sticky section has painted before we reset.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    // 'resetTreemapToOverview' lives in treemap.js; make it global or expose via window.
    if (window.resetTreemapToOverview) window.resetTreemapToOverview();
  }));
});
}

// === About modal: open/close + Esc + backdrop + basic focus trap ===
// little modal manager: opens on button, closes on backdrop/esc/x, preserves focus
function setupAboutModal() {
  const modal   = document.getElementById('aboutModal');
  const openBtn = document.getElementById('aboutBtn');
  if (!modal || !openBtn) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  const closeEls = modal.querySelectorAll('[data-close]');

  let lastFocus = null;
  const focusables = () =>
    modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');

  const open = () => {
    lastFocus = document.activeElement;
    modal.removeAttribute('hidden');
    document.body.classList.add('modal-open');
    const f = focusables()[0] || modal;
    if (f && f.focus) f.focus({ preventScroll: true });
  };

  const close = () => {
    modal.setAttribute('hidden', '');
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  openBtn.addEventListener('click', (e) => { e.preventDefault(); open(); });
  backdrop.addEventListener('click', close);
  closeEls.forEach(el => el.addEventListener('click', close));

  // Esc to close + simple focus trap inside the modal
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;

    const f = Array.from(focusables());
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0 || i === -1)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  });
}

// hides all floating tooltips when switching steps (to avoid leftover tooltips lingering)
function hideAllTooltips(){
  document.getElementById('gridTooltip')?.style?.setProperty('display','none');
  document.getElementById('treemap-tooltip')?.style?.setProperty('display','none');
}

// === generating the DOM structure for each narrative step ===================

// injects one wrapper per configured step into #stepsContainer
function renderSteps() {
  const container = document.getElementById("stepsContainer");
  container.innerHTML = ""; // clearing any previous content

  // looping through the step config and rendering one wrapper per step
  config.steps.forEach(step => {
    const stepEl = document.createElement("div");
    stepEl.className = "scrolly-step";       // shared class for scroll logic
    stepEl.id = `step-${step.id}`;           // unique id for targeting
    stepEl.innerHTML = renderStepContent(step); // inserting type-specific HTML
    container.appendChild(stepEl);           // adding to the viewport
  });
}


// === producing the inner HTML of each step based on its type ================

// returns an innerHTML string tailored to the step.type
function renderStepContent(step) {
  // normalizing the type property
  var t = step && step.type ? step.type : "";

  // handling the "card" step type (simple text + optional image)
  if (t === "card") {
    var c = step.content || {};
    var txt = c.text || "";     // main body text
    var img = c.image || "";    // optional image
    var alt = c.alt || "";      // alt text for accessibility

    // if this is the outro card, render only the card (no button)
    if (step.id === "outro") {
      return (
        '<div class="prelude-card">' +
          '<p>' + txt + '</p>' +
          (img ? '<img class="card-image" src="' + img + '" alt="' + alt + '">' : "") +
        '</div>'
      );
    }

    // if this is the first intro card, set consistent smaller image size and margin
    if (step.id === "intro-1" || step.id === "intro-2") {
      return (
        '<div class="prelude-card">' +
          '<p>' + txt + '</p>' +
          (img ? '<img class="card-image" src="' + img + '" alt="' + alt + '" style="height:110px;width:auto;max-width:99vw;object-fit:contain;display:block;margin-top:2em;">' : "") +
        '</div>'
      );
    }

    // otherwise, render as usual
    return (
      '<div class="prelude-card">' +
        '<p>' + txt + '</p>' +
        (img ? '<img class="card-image" src="' + img + '" alt="' + alt + '">' : "") +
      '</div>'
    );
  }

  // rendering the sampler intro with a small gallery
  if (t === "sampler-intro") {
    var si = step.content || {};
    var samplers = Array.isArray(si.samplers) ? si.samplers : [];
    return (
      '<div class="sampler-intro-step">' +
        '<div class="prelude-card sampler-intro-card"><p>' + (si.text || "") + '</p></div>' +
        '<div class="sampler-gallery">' +
          samplers.map(function(img, i){
            return (
              '<div class="sampler-item" data-index="' + i + '">' +
                '<img src="' + img + '" alt="Sampler ' + (i+1) + '">' +
              '</div>'
            );
          }).join("") +
        '</div>' +
      '</div>'
    );
  }

  // rendering the compartment cross-fade layout with arrows and a dynamic label
  if (t === "compartment") {
    var cc = step.content || {};
    var items = Array.isArray(cc.compartments) ? cc.compartments : [];
    var firstLabel = items.length ? (items[0].label || "") : "";

    return (
      '<div class="compartment-container">' +
        '<div class="sampler-viewport">' +
          items.map(function(comp, i){
            var src = (comp && comp.image) ? comp.image : "";
            var lab = (comp && comp.label) ? comp.label : ("Compartment " + (i+1));
            return (
              '<div class="viewport-image" data-index="' + i + '">' +
                '<img src="' + src + '" alt="' + lab + '">' +
              '</div>'
            );
          }).join("") +
          '<button class="img-arrow img-arrow-left" aria-label="Previous image">&#8592;</button>' +
          '<button class="img-arrow img-arrow-right" aria-label="Next image">&#8594;</button>' +
          '<div class="viewport-label" id="viewportLabel">' + firstLabel + '</div>' +
        '</div>' +

        '<div class="prelude-card compartment-card">' +
          '<p>' + (cc.text || "") + '</p>' +
          '<div class="progress-bar"><div class="progress-fill"></div></div>' +
        '</div>' +
      '</div>'
    );
  }

      // rendering the single-image sampler-intro style step (card above image)
      if (t === "sampler-intro-single") {
        var cs = step.content || {};
        var img = cs.image || "";
        var alt = cs.alt || "Sampler";
        var txt = cs.text || "";
        return (
            '<div class="sampler-intro-step" style="gap:1.2vh;">' +
              '<div class="prelude-card sampler-intro-card"><p>' + txt + '</p></div>' +
              '<div class="sampler-gallery">' +
                '<div class="sampler-item visible" data-index="0">' +
                  '<img src="' + img + '" alt="' + alt + '" style="height:clamp(440px,44vh,600px);width:auto;max-width:99vw;object-fit:contain;display:block;">' +
                '</div>' +
              '</div>' +
            '</div>'
        );
      }

// rendering the object grid step with unified, full-row buttons
if (t === "object-grid") {
  var og = step.content || {};
  var ogText = og.text || "";

  // labels for the action chips and object categories
  var chipLabels = [
    "Textile Making",
    "Healing & Caring",
    "Eating, Cooking & Drinking",
    "Measuring & Navigating"
  ];
  var categories = ["Samplers", "Pharmaceutical jars", "Teapots", "Pocket watches"];

  return (
    '<div class="object-grid-step">' +
      '<div class="grid-wrapper">' +
        '<div class="grid-left-col">' +
          '<div class="prelude-card object-grid-card"><p>' + ogText + '</p></div>' +

          // one clickable row per object–action pair
          '<div class="category-selector" id="categorySelector" role="radiogroup" aria-label="Filter by object">' +
            categories.map(function(cat, i){
              return (
                '<button type="button" class="category-option ' + (i===0 ? 'active' : '') + '" ' +
                        'data-category-index="' + i + '" role="radio" ' +
                        'aria-checked="' + (i===0 ? 'true' : 'false') + '">' +

                  // object name
                  '<span class="option-label object-label">' + cat + '</span>' +

                  // action chip
                  '<span class="option-chip editable-chip family-labels-html">' + chipLabels[i] + '</span>' +

                '</button>'
              );
            }).join("") +
          '</div>' +
        '</div>' +

        '<div class="image-grid" id="imageGrid"></div>' +
      '</div>' +
    '</div>'
  );
}


  // rendering the treemap container expected by treemap.js (svg + details panel + controls)
  // (the mode toggle buttons are created in JS and positioned over .treemap-stage)
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
          '</div>' +

          '<div class="treemap-stage viz-stage">' +
            '<svg id="treemap-svg" class="treemap"' +
              ' viewBox="0 0 1000 490" preserveAspectRatio="none"' +
              ' role="img" aria-label="Treemap of objects grouped by action"></svg>' +

            '<div id="details" class="details-panel" hidden>' +
              '<div class="details-header">' +
                '<h3 id="details-title" class="details-title"></h3>' +
                '<button class="details-close" aria-label="Close details">×</button>' +
              '</div>' +
              '<p class="details-subtitle"></p>' +
              '<ul id="details-list" class="details-list"></ul>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // defining the singleton global tooltip node for the treemap
      '<div class="treemap-tooltip" id="treemap-tooltip" aria-hidden="true"></div>'
    );
  }

  // returning empty string for unknown step types (safe fallback)
  return "";
}


// wiring the scroll listener on the internal scroller and fanning out to per-step updaters
// (single scroll handler that updates global -> local progress and triggers per-step reactions)
function setupScrollListener() {
  const container = document.getElementById("scrollContainer");
  container.addEventListener("scroll", () => {
    // computing overall progress t ∈ [0..1] and setting which step is active
    const t = computeProgressAndActive();

    // updating visibility and per-step visuals based on the new progress
    updateStepVisibility(t);          // showing either hero or the active step
    updateCompartmentProgress(t);     // driving the cross-fade in the sampler-compartment
    updateSamplerIntroReveal(t);      // revealing sampler-intro tiles progressively
    updateObjectGridProgress(t);      // switching grid category by quartiles
    updateUpArrowVisibility();        // toggling the return-to-top control
    updateViewportBackgroundGrid();   // swapping the background to grid outside hero
    // === prevent scrolling past the treemap ===
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (container.scrollTop > maxScroll - 2) {
      container.scrollTop = maxScroll - 2; // lock at bottom
    }
  }, { passive: true });
}


// computing 0..1 scroll progress within the internal scroller and setting active step index
// (maps scrollTop to normalized t; then picks which segment/window contains t)
function computeProgressAndActive() {
  const container = document.getElementById("scrollContainer");
  const scrollTop = container.scrollTop;                              // reading current pixel offset
  const scrollHeight = container.scrollHeight - container.clientHeight; // computing total scrollable pixels
  const t = scrollHeight > 0 ? scrollTop / scrollHeight : 0;          // normalizing to 0..1

  // mapping t to a step index:
  // segments[0] is the hero, so real steps begin at segments[1]; we store step indices as 0-based
  let active = -1; // -1 represents "in hero"
  for (let i = 1; i < state.segments.length; i++) {
    const seg = state.segments[i];
    // checking if t lies inside this segment’s normalized window
    if (t >= seg.start && t < seg.end) { active = i - 1; break; }
  }
  state.activeStepIndex = active; // persisting which step is currently active
  return t;                       // returning t so callers can compute local progress
}


// toggling hero visibility and the active class on the currently visible step
// (hero hides after its segment ends; only the active step gets .active)
function updateStepVisibility(t) {
  const heroEl = document.getElementById("heroSection");
  const heroSeg = segmentOf("hero");

  // deciding if we are still inside the hero’s segment; falling back to index check if needed
  const inHero = heroSeg ? (t < heroSeg.end) : (state.activeStepIndex === -1);
  heroEl.classList.toggle("hidden", !inHero); // hiding hero once we leave its segment

  // adding .active only on the step whose index matches state.activeStepIndex
  config.steps.forEach((step, i) => {
    const stepEl = document.getElementById(`step-${step.id}`);
    stepEl.classList.toggle("active", i === state.activeStepIndex);
  });
  // hiding tooltips when switching steps:
  if (state._lastActiveStepIndex !== state.activeStepIndex) {
    hideAllTooltips();
    state._lastActiveStepIndex = state.activeStepIndex;
  }
}


// switching the viewport background to grid only while inside steps (not in hero)
// (purely visual cue: gridded bg helps the story feel structured)
function updateViewportBackgroundGrid() {
  const viewportBg = document.getElementById("viewportBg");
  // adding grid when a step is active; removing it in hero for a cleaner landing
  if (state.activeStepIndex >= 0) viewportBg.classList.add("grid-bg");
  else viewportBg.classList.remove("grid-bg");
}


// updating the compartment cross-fade progress and re-rendering the view
// (reads local progress and pushes it to the compartment renderer)
function updateCompartmentProgress(totalProgress) {
  // converting global t into local progress within the sampler-compartment segment
  state.compartmentProgress = localProgress(totalProgress, "sampler-compartment");
  updateCompartmentView(); // using the new progress to set opacities/label/progress bar
}


// revealing sampler-intro thumbnails progressively as you scroll through that step
// (tiles appear one by one as thresholds are crossed)
function updateSamplerIntroReveal(totalProgress) {
  const stepIndex = config.steps.findIndex(s => s.id === "sampler-intro");
  if (state.activeStepIndex !== stepIndex) return; // doing nothing unless that step is active

  const p = localProgress(totalProgress, "sampler-intro"); // local 0..1
  const step = document.getElementById("step-sampler-intro");
  if (!step) return;

  // revealing tiles one by one as p crosses evenly spaced thresholds
  const items = step.querySelectorAll(".sampler-item");
  items.forEach((el, k) => {
    const threshold = k / items.length;         // distributing thresholds across items
    el.classList.toggle("visible", p > threshold);
  });
}


// loading a new category in the object grid whenever the local progress crosses each quartile
// (grid steps through 4 categories evenly across the segment)
function updateObjectGridProgress(totalProgress) {
  const stepId = "rituals";
  const stepIndex = config.steps.findIndex(s => s.id === stepId);
  if (state.activeStepIndex !== stepIndex) return; // only reacting while in the grid step

  const p = localProgress(totalProgress, stepId);  // local 0..1 within the grid segment
  const n = GRID_CATEGORIES.length;                // expected to be 4 categories
  const idx = Math.min(n - 1, Math.floor(p * n));  // mapping quarters to indices 0..3

  // switching only when the bucket changes to avoid redundant reloads
  if (idx !== state.objectGridCategory) {
    loadCategory(idx); // fetching/caching manifest and rendering the 7×3 grid
  }
}



// computing a two-image cross-fade between adjacent sampler images with a 30% blend window
// (the math here sets opacities for the stacked images and updates label/progress)
function updateCompartmentView() {
  // finding the sampler-compartment step and its dom
  const i = config.steps.findIndex((s) => s.id === "sampler-compartment");
  const stepEl = document.getElementById("step-sampler-compartment");
  if (i === -1 || !stepEl) return;

  // grabbing data and elements once to avoid repeated lookups inside the loop
  const items = config.steps[i].content.compartments;   // array of {image, label}
  const wraps = stepEl.querySelectorAll(".viewport-image"); // each wrap holds one stacked image
  const labelEl = stepEl.querySelector("#viewportLabel");   // small pill label over the image
  const fillEl = stepEl.querySelector(".progress-fill");    // progress bar inside the card

  // deriving which two images should be blending right now
  const n = items.length;
  const local = state.compartmentProgress;    // progress within this step, 0..1
  const idxFloat = local * (n - 1);           // mapping 0..1 across (n-1) transitions
  const idx = Math.floor(idxFloat);           // base image index on the left side of the blend
  const frac = idxFloat - idx;                // fractional progress between idx and idx+1, 0..1

  // defining the cross-fade window centered around frac = 0.5
  // example with blend=0.30: active blend window = [0.35 .. 0.65]
  const blend = 0.30;                         // 30% overlap
  const start = 0.5 - blend / 2;              // where the fade-out/fade-in begins
  const end   = 0.5 + blend / 2;              // where the fade finishes

  // setting opacity for each stacked image:
  // - image at idx fades out across the window
  // - image at idx+1 fades in across the same window
  // - all other images stay hidden
  wraps.forEach((w, k) => {
    let a = 0;
    if (k === idx) {
      // left image staying fully visible before the blend,
      // then linearly fading to 0 across [start..end]
      a = frac < start ? 1 : frac > end ? 0 : 1 - (frac - start) / blend;
    } else if (k === idx + 1) {
      // right image staying at 0 before the blend,
      // then linearly rising to 1 across [start..end]
      a = frac < start ? 0 : frac > end ? 1 : (frac - start) / blend;
    } else a = 0;
    w.style.opacity = a;
  });

  // updating the label to describe whichever image is visually dominant:
  // - before midpoint (frac <= .5): show current idx label
  // - after midpoint (frac > .5): show next label
  if (labelEl) {
    const showIdx = Math.min(idx + (frac > 0.5 ? 1 : 0), n - 1);
    labelEl.textContent = items[showIdx]?.label || "";
  }

  // updating the progress bar to match overall local progress (not the blend fraction)
  if (fillEl) fillEl.style.width = `${(local * 100).toFixed(1)}%`;
}



// simple helper that jumps just past the hero boundary when clicking the chevron
function setupHeroDownArrow() {
  const arrow = document.getElementById("scrollIndicator");
  const container = document.getElementById("scrollContainer");
  const heroSeg = segmentOf("hero");
  if (!arrow || !container || !heroSeg) return;

  arrow.addEventListener("click", () => {
    const scrollHeight = container.scrollHeight - container.clientHeight;
    // forcing a position just past the hero/first-step boundary so activation logic definitely flips out of "hero"
    // using ceil() + small extra pixels avoids landing exactly on the boundary (float rounding can keep you in hero)
    const target = Math.ceil(heroSeg.end * scrollHeight) + 2;
    container.scrollTo({ top: target, behavior: "instant" });
  });
}

// enabling the persistent “up” arrow button to scroll back to top and toggle its visibility
// (two parts: click handler for smooth scroll; plus a visibility toggle driven by scroll distance)
function enableUpArrow() {
  const btn = document.getElementById("upArrow");
  const container = document.getElementById("scrollContainer");
  if (!btn || !container) return;

  // scrolling smoothly to the very top of the internal scroller
  btn.addEventListener("click", () => container.scrollTo({ top: 0, behavior: "smooth" }));

  // seeding initial visibility state (also updated on scroll)
  updateUpArrowVisibility();
}

function updateUpArrowVisibility() {
  const btn = document.getElementById("upArrow");
  const container = document.getElementById("scrollContainer");
  if (!btn || !container) return;

  // showing the button only after user has scrolled roughly 80% of one viewport height
  // using window.innerHeight keeps the threshold stable across devices
  const show = container.scrollTop > window.innerHeight * 0.8;
  btn.classList.toggle("visible", show);
}

// toggling whether the compartment carousel loops when navigating via arrows
// (set to true so left at the first wraps to last, and vice versa)
const COMPARTMENT_LOOP = true; // setting false disables wrap-around at ends

// delegating click events for the left/right arrows inside the compartment step
// (listen on document; arrows may be rendered after the first paint)
function onImageArrowClick(e) {
  if (!e.target.matches(".img-arrow-left, .img-arrow-right")) return;

  const stepEl = document.getElementById("step-sampler-compartment");
  if (!stepEl) return;

  // reading how many stacked images are present; needing at least two to step
  const n = stepEl.querySelectorAll(".viewport-image").length;
  if (n < 2) return;

  // computing one "step" of progress as the distance between adjacent images
  const dir = e.target.classList.contains("img-arrow-left") ? -1 : 1;
  const stepSize = 1 / (n - 1);

  // moving the local progress by one image, either backward or forward
  let next = state.compartmentProgress + dir * stepSize;

  if (COMPARTMENT_LOOP) {
    // wrapping around when stepping past either end (creating a loop)
    if (next < 0) next = 1;
    if (next > 1) next = 0;
  } else {
    // clamping to the ends when looping is disabled
    next = Math.max(0, Math.min(1, next));
  }

  // applying the new progress and re-rendering the cross-fade
  state.compartmentProgress = next;
  updateCompartmentView();
}

// caches for grid manifests (image paths) and optional csv metadata
// (both keyed by category.key; we lazily fetch and then reuse across switches)
const _gridManifestCache = new Map();
const _gridMetaCache     = new Map(); // storing per-category Map(id -> metadata row)

// ensuring a singleton tooltip element for grid cards
// (created once at first use; keeps DOM stable while hovering many tiles)
function ensureTooltip(){
  let el = document.getElementById("gridTooltip");
  if (!el) {
    // creating once and reusing to avoid dom churn during hover
    el = document.createElement("div");
    el.id = "gridTooltip";
    document.body.appendChild(el);
  }
  return el;
}

// extracting a stable id from a file path for joining with metadata (dropping extension)
// (e.g., ".../foo/bar/abc_123.jpg" → "abc_123")
function idFromPath(path){
  return path.split("/").pop().replace(/\.[^.]+$/, "");
}

// indexing csv rows by the last segment of EDANurl (removing query/hash; decoding safely)
// this makes tooltip lookup O(1) by the same id scheme we derive from image paths
function indexMetadata(rows){
  const idx = new Map();
  rows.forEach(r => {
    let u = (r.EDANurl || "").trim();
    if (!u) return;

    // selecting the last path piece, then stripping query/hash if present
    let seg = u.split("/").pop() || u;
    seg = seg.split("?")[0].split("#")[0];

    // decoding percent-encoded pieces defensively
    try { seg = decodeURIComponent(seg); } catch(e) {}

    // dropping any file extension to align with idFromPath()
    seg = seg.replace(/\.[^.]+$/, "");

    if (seg && !idx.has(seg)) idx.set(seg, r);
  });
  return idx;
}

// choosing the best-available field among a list for the tooltip (first non-empty wins)
function pick(row, keys) {
    for (const k of keys) {
        const v = (row?.[k] ?? "").toString().trim();
        if (v) return v;
    }
    return "";
}
// filtering out generic titles (keeping the tooltip compact)
function isLowValueTitle(t) {
        // Only hide if empty
        return !t || !t.trim();
}

// Capitalize first letter if not already uppercase
function capitalizeFirstLetter(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1);
}

// constructing tooltip html (favoring title, linking to EDAN when available; date removed)
// (keeps copy lightweight; adds materials line when present)
function tooltipHTML(row){
    if (!row) return "";

    // choosing fields with a small fallback strategy
    const titleRaw = pick(row, ["title"]);
    const materials = pick(row, ["materials"]);
    const url      = pick(row, ["EDANurl","edanurl","URL","Url"]);

    // capitalize first letter for all tooltip elements
    const title = capitalizeFirstLetter(titleRaw);
    const materialsCap = capitalizeFirstLetter(materials);

    // deciding whether the title adds value (many records use overly generic titles)
    const showTitle = title && !isLowValueTitle(title);

    // accumulating only meaningful parts, then joining them at the end
    const parts = [];
    if (showTitle) {
        // linking to the EDAN page when available; keeping link noopener for safety
        parts.push(
            `<div class="tt-title">${
                url ? `<a href="${url}" target="_blank" rel="noopener">${title}</a>` : title
            }</div>`
        );
    }

    // falling back to a simple “view record” link if title is empty
    if (!parts.length && url) {
        parts.push(`<div class="tt-row"><a href="${url}" target="_blank" rel="noopener">View object record</a></div>`);
    }

    // add materials as the last row if present, prefixed with "materials:"
    if (materialsCap) {
        parts.push(`<div class="tt-row tt-materials">Materials: ${materialsCap}</div>`);
    }

    return parts.join("");
}

// positioning the tooltip near the cursor while avoiding viewport overflow
// (bottom-right bias; flips when close to edges; stays inside viewport)
function positionTooltip(el, clientX, clientY){
  const pad = 12;                            // keeping a small padding from edges
  el.style.display = "block";                // ensuring layout is measurable
  el.style.left = "0px"; el.style.top = "0px";
  const rect = el.getBoundingClientRect();   // measuring tooltip size

  // defaulting to bottom-right offset from the cursor
  let x = clientX + 14;
  let y = clientY + 14;

  // flipping horizontally if the tooltip would overflow the viewport
  if (x + rect.width + pad > window.innerWidth)  x = clientX - rect.width - 14;
  // flipping vertically when necessary
  if (y + rect.height + pad > window.innerHeight) y = clientY - rect.height - 14;

  // clamping to stay inside the viewport with a small pad
  el.style.left = Math.max(pad, x) + "px";
  el.style.top  = Math.max(pad, y) + "px";
}

// rendering a 7×3 grid (21 tiles) from a set of image paths, wiring tooltips if metadata is available
// (data-join keyed by path; handles broken images quietly; lazy loads)
function renderGridFromPaths(paths, metaIndex = null) {
  const sel = d3.select("#imageGrid");
  const visible = paths.slice(0, 21); // enforcing 7×3 cap

  // joining data to .grid-item cards (keyed by path so updates map cleanly)
  const cards = sel.selectAll(".grid-item")
    .data(visible, d => d)
    .join(
      enter => {
        // creating a wrapper per tile and adding <img> once
        const g = enter.append("div").attr("class", "grid-item");
        g.append("img");
        return g;
      },
      update => update,      // keeping existing nodes as-is
      exit => exit.remove()  // removing tiles that fall out of the 21 cap
    );

  // updating the <img> attributes for both enter and update selections
  const imgs = cards.select("img");
  imgs
    .attr("loading", "lazy")                                  // letting the browser defer offscreen images
    .attr("src", d => encodeURI(d))                           // encoding any spaces or special chars
    .attr("alt", (d, i) =>                                    // supplying a simple, indexed alt text
      `${GRID_CATEGORIES[state.objectGridCategory].label} ${i+1}`
    )
    .on("error", function (event, d) {                        // marking broken sources (optional styling hook)
      this.classList.add("img-broken");
      console.warn("Image failed:", d);
    });

  // wiring tooltips on the card container for consistent enter/leave behavior
  const tip = ensureTooltip();

  cards
    .on("mouseenter", function (event, d) {
      if (!metaIndex) return;                 // skipping tooltips when no metadata is loaded
      const id  = idFromPath(d);              // extracting id key from path
      const row = metaIndex.get(id);          // looking up metadata row by id
      const html = tooltipHTML(row);          // building compact html
      if (!html) return;
      tip.innerHTML = html;                   // injecting content
      tip.style.display = "block";            // showing tooltip
      positionTooltip(tip, event.clientX, event.clientY);
    })
    .on("mousemove", function (event) {
      // updating position only if tooltip is currently visible
      if (tip.style.display !== "none") {
        positionTooltip(tip, event.clientX, event.clientY);
      }
    })
    .on("mouseleave", function () {
      tip.style.display = "none";             // hiding tooltip when leaving the tile
    });
}

// fetching the manifest for the selected category, optionally loading csv metadata, then rendering the grid
// (manifest and metadata are both cached by category.key; failures degrade gracefully)
function loadCategory(idx) {
  state.objectGridCategory = idx;

 document.querySelectorAll(".category-option").forEach((b, k) => {
  const on = (k === idx);
  b.classList.toggle("active", on);
  b.setAttribute("aria-checked", on ? "true" : "false");
});


  // finding the selected category config (paths + optional csv metadata)
  const cat = GRID_CATEGORIES[idx];
  if (!cat) return Promise.resolve();

  // preparing (or loading) the image manifest for this category
  const manifestP = _gridManifestCache.has(cat.key)
    ? Promise.resolve(_gridManifestCache.get(cat.key))     // reusing cached list
    : d3.json(cat.manifest)                                 // fetching json: ["a.jpg","b.jpg",...]
        .then((names = []) => names.map(n => `${cat.path}/${n}`))  // resolving to full paths
        .catch(() => [])                                    // failing gracefully to an empty list
        .then(paths => { _gridManifestCache.set(cat.key, paths); return paths; });

  // preparing (or loading) the metadata index for tooltips (optional)
  const metaP = (cat.csv
    ? (_gridMetaCache.has(cat.key)
        ? Promise.resolve(_gridMetaCache.get(cat.key))      // reusing cached index
        : d3.csv(cat.csv).then(rows => {
            const idx = indexMetadata(rows || []);          // building Map(id -> row)
            _gridMetaCache.set(cat.key, idx);
            return idx;
          }).catch(() => null))                              // failing gracefully when csv missing/broken
    : Promise.resolve(null));

  // resolving both in parallel, then updating the grid
  return Promise.all([manifestP, metaP]).then(([paths, metaIndex]) => {
    renderGridFromPaths(paths, metaIndex);
  });
}

// wiring clicks on the category buttons, nudging scroll to the matching quartile, and loading the category
// (keeps UX snappy by jumping the scroller to the relevant quarter)
function setupCategoryButtons() {
  const sel = document.getElementById("categorySelector");
  if (!sel) return;

  sel.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-option");
    if (!btn) return;
    e.preventDefault(); // <-- important with buttons inside scroll contain, so that they don't jump to the hero
    
    // reading which category index was clicked
    const idx = Number(btn.dataset.categoryIndex);
    if (!Number.isFinite(idx)) return; // safety guard

    // nudging local scroll position inside the "rituals" segment to align with the selected bucket
    const seg = segmentOf("rituals");
    const container = document.getElementById("scrollContainer");
    if (seg && container) {
      const n     = document.querySelectorAll(".category-option").length || GRID_CATEGORIES.length;
      const span  = seg.end - seg.start;
      const local = seg.start + ((idx + 0.5) / n) * span; // bucket CENTER
      const y = local * (container.scrollHeight - container.clientHeight); // converting to pixels
      container.scrollTo({ top: y, behavior: "instant" });      // jumping without animation for snappiness
    }

    // loading the chosen category (renders grid; caches manifests/metadata)
    loadCategory(idx);
  });
}



// initializing the whole experience: building timeline, rendering, wiring listeners, and seeding first frame
// (single entry point; called on DOMContentLoaded at the bottom)
function init() {
  state.segments = buildSegments();
  renderSteps();
  updateCompartmentView();   // seeding first frame so the first image is visible
  setupCategoryButtons();
  loadCategory(0);           // showing Samplers immediately
  setupHeroObjectsButton();
  setupAboutModal();
// Wiring the "Explore other objects by use" button in the outro card to scroll to treemap

  setTrackHeight();
  setupScrollListener();
  setupHeroDownArrow();      // note: this earlier version is overridden by the later duplicate
  enableUpArrow();

  const t0 = computeProgressAndActive();
  updateStepVisibility(t0);
  updateCompartmentProgress(t0);
  updateSamplerIntroReveal(t0);
  updateObjectGridProgress(t0);
  updateUpArrowVisibility();
  updateViewportBackgroundGrid();

  document.addEventListener("click", onImageArrowClick);
}

// auto-hiding floating tooltips whenever the user scrolls or touches
// (prevents stickiness when user moves around quickly)
(function attachTooltipAutohide(){
  const hide = () => {
    const g = document.getElementById('gridTooltip'); if (g) g.style.display = 'none';
    const t = document.getElementById('treemap-tooltip'); if (t) t.style.display = 'none';
  };
  document.addEventListener('wheel', hide, { passive: true });
  document.addEventListener('touchmove', hide, { passive: true });
  // if desired, scoping to the scroller instead of the whole document:
  // document.getElementById('scrollContainer')?.addEventListener('scroll', hide, { passive: true });
})();


// bootstrapping when the dom is ready (treemap.js loads after this and binds to injected markup)
// (order note: app.js builds the steps markup, then treemap.js selects #treemap-svg etc.)
window.addEventListener("DOMContentLoaded", init);
