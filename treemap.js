
(function () {
  // wrap everything in an iife so we don’t leak variables into the global scope
  // (this is especially important on pages that load multiple scripts)
  document.addEventListener("DOMContentLoaded", () => {
    // =========================================================
    // 1) LOAD DATA (hierarchy + details)
    // =========================================================
    // we wait until the DOM is ready, then load both data files in parallel.
    //  - treemap_data.json → hierarchical counts for the treemap layout
    //  - object_details.json → per-type arrays with fields (title, unitCode, materials, urls, etc.)
    // once both are ready, we destructure the results into [treemapdata, detailsdata]
    Promise.all([
      d3.json("treemap_jsons/treemap_data.json"),   // families → types → value
      d3.json("treemap_jsons/object_details.json"), // { [typeName]: [record, ...] }
    ]).then(([treemapdata, detailsdata]) => {
      // keep raw handles to the two datasets; we’ll transform them further below
      const rawdata = treemapdata;
      const details = detailsdata;

      // =========================================================
      // 2) HELPERS / CONSTANTS
      // =========================================================
      // normalize a string for safe matching:
      //  - default to "" if null/undefined
      //  - lowercase
      //  - collapse whitespace (including nbsp)
      //  - trim edges
      const norm = (s) => (s || "").toLowerCase().replace(/[\s\u00A0]+/g, " ").trim();

      // canonical keys for the two “other …” buckets we synthesize
      const OTHER_KEY = "other actions";
      const OTHER_MAT_KEY = "other materials";
      // a neutral gray used to distinguish “other …” buckets visually
      const OTHER_COLOR = "#a2a1a1ff";

      // utility to check whether a node is one of the special grouped buckets
      const isOtherCombined = (node) => {
        const nm = norm(node?.data?.name);
        return nm === OTHER_KEY || nm === OTHER_MAT_KEY;
      };

      // list of families we want to group under “other actions” at the overview.
      // (editorial choice to keep the top view readable.)
      const outside_actions = ["work & build", "play", "worship", "smoke"];

      // friendly display names for families (so the UI reads well)
      const display_family = {
        "eat, cook & drink": "Eating, Cooking & Drinking",
        "read, write & record": "Reading, Writing & Recording",
        "dress & accessorize": "Dressing & Accessorizing",
        "heal & care": "Healing & Caring",
        "work & build": "Working & Building",
        "commemorate & symbolize": "Commemorating & Symbolizing",
        "decorate & furnish": "Decorating & Furnishing",
        "fight": "Fighting & Hunting",
        "ignite & manage fire": "Lighting & Firekeeping",
        "measure & navigate": "Measuring & Navigating",
        "perform music": "Performing Music",
        "play": "Playing",
        "smoke": "Smoking",
        "textile making": "Textiles Making",
        "worship": "Worshipping",
        "other actions": "Other Actions",
      };
      // wrapper that falls back to the raw name if we don’t have a pretty mapping
      const displayFamily = (name) => display_family[norm(name)] || name;

      // turn a raw material token into something nice to read:
      //  - replace separators with spaces
      //  - collapse spaces
      //  - title-case each word
      function displayMaterial(name) {
        return (name || "")
          .replace(/[-_]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      // friendly names for museum unit codes (for details list)
      const display_unitcodes = {
        AAA: "Archives of American Art",
        ACM: "Anacostia Community Museum",
        CHNDM: "Cooper Hewitt, Smithsonian Design Museum",
        FSG: "Freer Gallery of Art and Arthur M. Sackler Gallery",
        HMSG: "Hirshhorn Museum and Sculpture Garden",
        NMAAHC: "National Museum of African American History and Culture",
        NMAH: "National Museum of American History",
        NMAI: "National Museum of the American Indian",
        NPG: "National Portrait Gallery",
        NPM: "National Postal Museum",
        SAAM: "Smithsonian American Art Museum",
        SIL: "Smithsonian Libraries",
        // ... (you can add more codes as needed)
      };
      const displayMuseum = (unit) => display_unitcodes[unit] || "";

      // === Weighted-total explainer (used by the info icon) =======================
      // explains the difference between true object counts (details) vs weighted totals (materials overview)
      const MATERIAL_WEIGHT_EXPLAIN = `
        <div class="tt-title">Counts vs. weighted totals</div>
        <div>
          <strong>By Use</strong> overview shows the <strong>number of objects</strong> in each group.<br>
          <strong>By Material</strong> overview shows <strong>weighted totals</strong>.
        </div>
        <div style="margin-top:.4rem">
          In both views, when you click into a group (selecting an action or material), the counts shown are the
          <strong>number of objects</strong>.
        </div>
        <div style="margin-top:.6rem">
          <strong>How weighted totals work:</strong> <br>If an object lists multiple main materials,
          it contributes a fractional share to each. For example, if the main materials are linen and cotton,
          it counts as 0.5 toward each.
        </div>
      `;

      // =========================================================
      // 3) DOM / D3 REFERENCES
      // =========================================================
      // cache all the core nodes we’ll touch frequently:
      //  - the main svg (#treemap-svg.treemap)
      //  - a group for tiles + text (g)
      //  - a group dedicated to chip-style labels at overview (g.family-labels)
      const svg = d3.select("#treemap-svg.treemap");
      const g = svg.append("g");                     // tiles + leaf labels
      const gFamilyChips = svg.append("g").attr("class", "family-labels");

      // controls + details panel bits
      const back_button = d3.select(".back-to-all");
      const zoom_card = d3.select(".zoom-card");
      const detailsPanel = d3.select("#details");
      const detailsTitle = d3.select("#details-title");
      const detailsList = d3.select("#details-list");
      const detailsSubtitle = d3.select(".details-subtitle");

      // === Mode toggle UI =======================================================
      // default mode: “use” (families). we reflect the mode as an attribute on <svg> so CSS can react if needed.
      let currentMode = "use";
      svg.attr("data-mode", currentMode);

      // find a practical host container for the toggle (prefers a .treemap-wrapper if present;
      // falls back to .treemap-stage which is position:relative in CSS so absolute children position correctly)
      const host =
        d3.select(".treemap-wrapper").size()
          ? d3.select(".treemap-wrapper")
          : d3.select(".treemap-stage");  // this exists and is position:relative in CSS

      // create the mode toggle container directly in the DOM so it participates in layout + tab/reading order
      const toggle = host
        .append("div")
        .attr("class", "mode-toggle");

      // “By Use” button — starts pressed
      const btnUse = toggle
        .append("button")
        .attr("type", "button")
        .attr("aria-pressed", "true")
        .text("By Use");

      // “By Material” button — starts not pressed
      const btnMat = toggle
        .append("button")
        .attr("type", "button")
        .attr("aria-pressed", "false")
        .text("By Material");

      // info (i) button explaining weighted totals
      const infoBtn = toggle
        .append("button")
        .attr("type", "button")
        .attr("class", "info-btn")
        .attr("aria-label", "How weighted totals work")
        .html(`
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"></circle>
            <circle cx="12" cy="7" r="1.5" fill="currentColor"></circle>
            <rect x="11" y="10" width="2" height="8" rx="1" fill="currentColor"></rect>
          </svg>
        `);

      // the treemap tooltip is a single shared node. we select it once and reuse it.
      const tooltipNode = d3.select("#treemap-tooltip");

      // small helper to open the (i) explainer near the button, clamped to viewport
      function showInfo(ev) {
        // if a hover tooltip is up, hide it so the explainer isn’t layered under/over awkwardly
        if (typeof hideTooltip === "function") hideTooltip();

        const btnRect = ev.currentTarget.getBoundingClientRect();
        const margin = 12; // spacing from edges and from the button
        const tooltipSel = d3.select("#treemap-tooltip");

        // set html, show, and switch to fixed positioning so we can place it in viewport coords
        tooltipSel
          .html(MATERIAL_WEIGHT_EXPLAIN)        // your explainer HTML
          .style("position", "fixed")
          .style("display", "block")
          .attr("aria-hidden", "false");

        // measure the tooltip after content is set to get its true size
        const tooltipEl = tooltipSel.node();
        const ttRect = tooltipEl.getBoundingClientRect();

        // default placement: to the right of the button, aligned with its top
        let left = btnRect.right + margin;
        let top  = btnRect.top;

        // if it would overflow the right edge, flip it to the left side
        if (left + ttRect.width > window.innerWidth - margin) {
          left = btnRect.left - ttRect.width - margin;
        }
        // clamp horizontally just in case
        if (left < margin) left = margin;

        // vertically clamp inside the viewport (avoid running off top/bottom)
        const maxTop = window.innerHeight - ttRect.height - margin;
        if (top > maxTop) top = maxTop;
        if (top < margin) top = margin;

        // apply final pixel coords
        tooltipSel
          .style("left", `${Math.round(left)}px`)
          .style("top",  `${Math.round(top)}px`);
      }

      // hide + clear the info tooltip node
      function hideInfo() {
        d3.select("#treemap-tooltip")
          .style("display", "none")
          .attr("aria-hidden", "true")
          .html("");
      }

      // click to toggle the (i) panel; stop propagation so it doesn’t conflict with background handlers
      infoBtn.on("click", (ev) => {
        ev.stopPropagation();
        const visible = tooltipNode.style("display") !== "none";
        if (visible) hideInfo();
        else showInfo(ev);
      });

      // click anywhere outside the toggle → close the (i) panel; esc also closes
      d3.select(document).on("click.info", (ev) => {
        const t = ev.target;
        if (!t.closest || !t.closest(".mode-toggle")) hideInfo();
      });
      d3.select(document).on("keydown.info", (ev) => {
        if (ev.key === "Escape") hideInfo();
      });

      // set mode helper: flips aria state, updates svg attr, rebuilds hierarchy, and redraws
      function setMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;
        svg.attr("data-mode", currentMode);
        btnUse.attr("aria-pressed", String(mode === "use"));
        btnMat.attr("aria-pressed", String(mode === "material"));
        rebuildRootAndReset();

        // update the hint text below the viz based on mode
        const hint = document.querySelector('.viz-hint');
        if (hint) {
          if (mode === "use") {
            hint.textContent = "Explore objects from Revolutionary-era America by how they were used, drawn from the Smithsonian collections.";
          } else {
            hint.textContent = "Explore objects from Revolutionary-era America by what they were made of, drawn from Smithsonian collections.";
          }
        }
      }

      // wire the two mode buttons
      btnUse.on("click", () => setMode("use"));
      btnMat.on("click", () => setMode("material"));

      // --- color utils (hex -> luminance -> contrasting text) ---
      // converts #rrggbb (or #rgb) to r,g,b integers 0..255
      function hexToRGB(hex) {
        const h = hex.replace('#','').trim();
        const v = h.length === 3
          ? h.split('').map(x => x + x).join('')
          : h.padEnd(6, '0').slice(0,6);
        const r = parseInt(v.slice(0,2), 16);
        const g = parseInt(v.slice(2,4), 16);
        const b = parseInt(v.slice(4,6), 16);
        return [r, g, b];
      }
      // lightweight perceived luminance estimator (good enough for choosing black/white text)
      function luminanceFromHex(hex) {
        const [r,g,b] = hexToRGB(hex);
        return (0.299*r + 0.587*g + 0.114*b) / 255;
      }
      // pick dark text on light tiles, light text on dark tiles
      function textForBG(hex, light = '#ffffff', dark = '#222222', threshold = 0.6) {
        return luminanceFromHex(hex) > threshold ? dark : light;
      }

      // =========================================================
      // 4) ACTIONS DATA SHAPING (keep “Other Actions”)
      // =========================================================
      // groups any families in `cats` into a single “Other Actions” node at root.
      // returns a new tree { name, children: [...] } so we don’t mutate the original.
      function regroup_by_category(data, cats) {
        const families = Array.isArray(data?.children) ? data.children : [];
        const main = [];
        const grouped = [];
        for (const fam of families) (cats.includes(norm(fam.name)) ? grouped : main).push(fam);
        const children = grouped.length
          ? [...main, { name: "Other Actions", children: grouped }]
          : main;
        return { name: data.name, children };
      }

      // build the root tree with a final “Other Actions” child at the end (cosmetic ordering)
      const viz_data = (() => {
        const d = regroup_by_category(rawdata, outside_actions);
        const i = d.children.findIndex((c) => norm(c.name) === OTHER_KEY);
        if (i > -1) d.children.push(...d.children.splice(i, 1));
        return d;
      })();

      // =========================================================
      // 5) COLOR PALETTES
      // =========================================================
      // palette for families (by-use mode). note we keep a neutral for “other actions”.
      const familyColors = {
        "eat, cook & drink": "#868D7A",
        "heal & care": "#9C9C80",
        "ignite & manage fire": "#8D927C",
        "textile making": "#8F8C81",
        "dress & accessorize": "#8F8C81",
        "decorate & furnish": "#7A7875",
        "read, write & record": "#8B928A",
        "perform music": "#8A726B",
        "smoke": "#8A726B",
        "fight": "#8F837A",
        "measure & navigate": "#a49c98ff",
        "other actions": "#A5A5A2",
      };
      const color = (fam) => familyColors[norm(fam)] || "#999";

      // palette for materials (by-material mode). muted, earthy tones to match the design.
      const materialColors = {
        wood: "#C2B9A3",
        iron: "#A4A4A4",
        steel: "#B0B0B0",
        copper: "#B37F6A",
        brass: "#bcb093ff",
        bronze: "#A78968",
        silver: "#C9C9C9",
        gold: "#C8B26E",
        pewter: "#9D9D9D",
        metal: "#A5A5A5",
        stone: "#C2BFB9",
        ivory: "#E1D9C9",
        bone: "#D6CAB7",
        horn: "#BDAE95",
        leather: "#9e8e83ff",
        "mother-of-pearl": "#CFCAC3",
        pearl: "#D9D5CF",
        glass: "#B7C0C6",
        ceramic: "#B9B2AA",
        earthenware: "#B19782",
        porcelain: "#D2CDC6",
        paste: "#C9C2BB",
        textile: "#B6B2A7",
        cotton: "#D0CABE",
        linen: "#CFCABC",
        silk: "#C9C0B2",
        wool: "#C6BFB0",
        paper: "#DDD8CD",
        paint: "#BDB6AE",
        enamel: "#B8B3AE",
        varnish: "#BAB4AB",
        lacquer: "#B6B0A7",
        gesso: "#CCC6BC",
        coarse: "#C2BEB6",
        wire: "#A9A9A9",
      };
      const colorMaterial = (mat) => materialColors[norm(mat)] || "#B8B6B3";

      // =========================================================
      // 6) DETAILS PANEL (Open Access API thumbs)
      // =========================================================
      // small, careful image loader that:
      //  - fetches a SI record by EDAN id
      //  - extracts the first media url (if any)
      //  - caches results to avoid repeated requests
      const apiKey = "wbx4TjCnMRmZCBPVwinDqyouiwiV2bWLfzaN53AV";
      const objectBaseURL = "https://api.si.edu/openaccess/api/v1.0/content/";
      const imgCache = new Map();
      const getPrimaryImageUrl = (r) =>
        r?.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content || null;

      async function fetchFirstImageById(id) {
        if (imgCache.has(id)) return imgCache.get(id);
        try {
          const res = await fetch(`${objectBaseURL}${id}?api_key=${apiKey}`);
          if (!res.ok) {
            imgCache.set(id, null);
            return null;
          }
          const data = await res.json();
          const url = getPrimaryImageUrl(data.response) || null;
          imgCache.set(id, url);
          return url;
        } catch {
          imgCache.set(id, null);
          return null;
        }
      }

      // render the details overlay for a given object type (and a parent key: family or material)
      // in material mode we filter rows by whether the object includes the selected material (true count, not weighted)
      async function showDetails(objectTypeName, parentKey) {
        const all = details[objectTypeName] || details[norm(objectTypeName)] || [];

        let rows;
        if (currentMode === "material") {
          // material mode: keep only rows whose main_material includes the selected material token
          const matKey = norm(parentKey);
          rows = all.filter((r) => {
            const raw = (r.main_material || "").toLowerCase();
            if (!raw || raw === "unknown") return false; // exclude Unknown in materials mode
            const toks = raw
              .split(/[,/&;]|\sand\s|\+|\|/g)
              .map((t) => t.trim())
              .filter(Boolean);
            return new Set(toks).has(matKey);
          });
        } else {
          // by-use mode: filter by family/action name
          rows = all.filter((r) => norm(r.action_family) === norm(parentKey));
        }

        // header text (title + small count)
        detailsTitle.text(objectTypeName);
        detailsSubtitle.text(`${rows.length} object${rows.length === 1 ? "" : "s"}`);

        // show the panel and reset its scroll position
        detailsPanel.attr("hidden", null);
        const nPanel = detailsPanel.node();
        if (nPanel) nPanel.scrollTop = 0;

        // data join (key by EDANurl to keep identity stable)
        const items = detailsList.selectAll("li").data(rows, (d) => d.EDANurl);
        items.exit().remove();
        items
          .enter()
          .append("li")
          .merge(items)
          .attr("class", "details-item")
          .html((r) => {
            const unit = (r.unitCode || "").trim();
            const full = displayMuseum(unit);
            const unitHTML = unit
              ? ` — <em>${full ? `${full} <span class="unitcode">(${unit})</span>` : unit}</em>`
              : "";
            return `
              <a href="${r.collectionsURL}" target="_blank" rel="noopener" class="details-placeholder">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
              </a>
              <div class="details-text">
                <strong>${r.title || "(Untitled)"}</strong>${unitHTML}
              </div>
            `;
          });

        // try to fetch thumbs for the first N rows; as images arrive, we replace the placeholder and mark the row
        const cap = 50;
        const first = rows.slice(0, cap);
        for (let i = 0; i < first.length; i++) {
          const row = first[i];
          const imgUrl = await fetchFirstImageById(row.EDANurl);
          if (!imgUrl) continue;
          const liSel = detailsList.selectAll("li").filter((d) => d === row);
          if (!liSel.empty()) {
            liSel.select(".details-placeholder").remove();
            liSel
              .insert("a", ":first-child")
              .attr("href", row.collectionsURL)
              .attr("target", "_blank")
              .attr("rel", "noopener")
              .append("img")
              .attr("class", "details-thumb")
              .attr("src", imgUrl)
              .style("opacity", 1);
            liSel.classed("has-thumb", true);
          }
        }

        // one-time reorder: put rows with thumbnails on top for a nicer first impression
        const ul = detailsList.node();
        if (ul) {
          const liArray = Array.from(ul.children);
          liArray
            .sort(
              (a, b) =>
                (b.classList.contains("has-thumb") ? 1 : 0) -
                (a.classList.contains("has-thumb") ? 1 : 0)
            )
            .forEach((li) => ul.appendChild(li));
        }
      }

      // hide + clear the details panel (used when closing and when zooming back to root)
      function hideDetails() {
        detailsPanel.attr("hidden", true);
        const n = detailsPanel.node();
        if (n) n.scrollTop = 0;
        detailsList.selectAll("li").remove();
        detailsSubtitle.text("");
      }
      d3.select(".details-close").on("click", hideDetails);

      // =========================================================
      // 7) HIERARCHY + CAMERA SCALES
      // =========================================================
      // build a materials hierarchy on the fly from the details file.
      // important: parent totals are weighted by how many materials each object lists.
      function buildMaterialHierarchy(detailsByType) {
        const root = { name: "Materials", children: [] };
        const matMap = new Map(); // mat -> Map(type -> weightedSum)

        for (const [typeName, rows] of Object.entries(detailsByType)) {
          for (const r of rows) {
            const raw = (r.main_material || "").toLowerCase();
            if (!raw || raw === "unknown") continue; // skip Unknown
            // split by commas/and/&/etc., trim, and dedupe per row
            const toks = raw
              .split(/[,/&;]|\sand\s|\+|\|/g)
              .map((t) => t.trim())
              .filter(Boolean);
            const uniq = Array.from(new Set(toks));
            if (!uniq.length) continue;
            const weight = 1 / uniq.length; // fractional share for each listed material

            // accumulate weighted counts per (material, type)
            for (const m of uniq) {
              if (!matMap.has(m)) matMap.set(m, new Map());
              const byType = matMap.get(m);
              byType.set(typeName, (byType.get(typeName) || 0) + weight);
            }
          }
        }

        // convert the nested map structure into a d3-friendly hierarchy
        for (const [mat, byType] of matMap.entries()) {
          const children = Array.from(byType.entries()).map(([type, value]) => ({
            name: type,
            value,
          }));
          root.children.push({ name: mat, children });
        }

        // materials overview sorted by total weighted share (largest first)
        root.children.sort((a, b) => {
          const sa = d3.sum(a.children, (c) => c.value || 0);
          const sb = d3.sum(b.children, (c) => c.value || 0);
          return sb - sa;
        });

        return root;
      }

      // group relatively small materials under “other materials” to keep the overview readable.
      // threshold is a share of the total weighted count (e.g., 0.02 = 2% or more are kept).
      function regroupMaterialsByThreshold(materialRoot, threshold = 0.01, keepList = []) {
        if (!materialRoot || !Array.isArray(materialRoot.children)) return materialRoot;

        const totalWeighted = d3.sum(materialRoot.children, (m) =>
          d3.sum(m.children || [], (t) => t.value || 0)
        );

        const keep = [];
        const small = [];

        for (const m of materialRoot.children) {
          const mTotal = d3.sum(m.children || [], (t) => t.value || 0);
          const share = totalWeighted > 0 ? mTotal / totalWeighted : 0;
          if (keepList.includes(norm(m.name)) || share >= threshold) keep.push(m);
          else small.push(m);
        }

        const out = { name: materialRoot.name, children: [...keep] };
        if (small.length) out.children.push({ name: "Other Materials", children: small });

        // cosmetic: ensure “other materials” is the last child
        const i = out.children.findIndex((c) => norm(c.name) === OTHER_MAT_KEY);
        if (i > -1) out.children.push(...out.children.splice(i, 1));

        return out;
      }

      // cache the prebuilt materials tree (grouped by threshold) so we can switch modes instantly
      let material_data = regroupMaterialsByThreshold(buildMaterialHierarchy(details), 0.02, []);

      // build the actions hierarchy (by-use) once; we’ll rebuild on mode change
      let root = d3
        .hierarchy(viz_data)
        .sum((d) => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // small getter that returns whichever hierarchy should be active for the current mode
      function getActiveHierarchy() {
        if (currentMode === "material") return material_data;
        return viz_data;
      }

      // camera scales: map treemap layout coords → pixel coords (we will set domains/ranges later)
      const sx = d3.scaleLinear();
      const sy = d3.scaleLinear();
      // track where we’re zoomed into; start at root
      let current = root; // zoom target

      // =========================================================
      // 8) CHIP LABELS (overview in both modes)
      // =========================================================
      // draw the chip-style labels at overview (both modes). they hide while zoomed.
      function draw_family_labels_all() {
        if (current !== root) {
          gFamilyChips.attr("display", "none").style("opacity", 0);
          return;
        }
        gFamilyChips.attr("display", null).style("opacity", 1);

        const topLevel = root.children || [];

        const chips = gFamilyChips
          .selectAll("g.family-chip")
          .data(topLevel, d => d.data.name);

        const chipsEnter = chips.enter()
          .append("g")
          .attr("class", "family-chip")
          .on("click", (_, d) => zoom_to(d));  // click a chip → zoom to that group

        chipsEnter.append("foreignObject")
          .attr("class", "chip-fo")
          .style("pointer-events", "auto")
          .append("xhtml:div")
          .attr("class", "family-labels-html");

        const chipsAll = chipsEnter.merge(chips);

        // layout: up to 2 lines, shallow height so tiles still get hover
        const MAX_LINES = 2;
        const LINE_H = 18;   // rough line-height in px (keep in sync with CSS if you tweak)
        const PAD_V   = 8;   // vertical padding inside the chip

        chipsAll.select("foreignObject.chip-fo")
          .attr("x", d => sx(d.x0) + 8)
          .attr("y", d => sy(d.y0) + 10)
          .attr("width",  d => Math.max(0, sx(d.x1) - sx(d.x0) - 16))
          .attr("height", d => {
            const band = PAD_V * 2 + LINE_H * MAX_LINES;
            const boxH = Math.max(0, sy(d.y1) - sy(d.y0) - 16);
            return Math.min(band, boxH);
          });

        // text differs by mode: families vs materials at overview
        chipsAll.select("div.family-labels-html")
          .text(d => currentMode === "material"
            ? displayMaterial(d.data.name)
            : displayFamily(d.data.name)
          );

        chips.exit().remove();
      }

      // =========================================================
      // 9) TEXTURE + BODY TOOLTIP
      // =========================================================
      // soft background texture to add a subtle material feel (weave-like pattern)
      const defs = svg.append("defs");
      const weave = defs
        .append("pattern")
        .attr("id", "weave")
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 3)
        .attr("height", 3);
      weave
        .append("path")
        .attr("d", "M0 0 L3 0 M0 0 L0 3 M0 3 L3 0")
        .attr("stroke", "rgba(80,60,40,.22)")
        .attr("stroke-width", "0.5");

      // the texture rectangle sits under the tiles but over the background
      const textureRect = svg
        .insert("rect", "g.family-labels")
        .attr("class", "treemap-texture")
        .attr("fill", "url(#weave)")
        .attr("opacity", ".62")
        .style("mix-blend-mode", "multiply")
        .style("pointer-events", "none");

      // ensure correct paint order for groups (tiles above texture; chips above tiles)
      g.raise();
      textureRect.raise();
      gFamilyChips.raise();

      // guarantee a single #treemap-tooltip in <body>; create it if missing or wrongly placed
      (function ensureTreemapTooltip() {
        let tEl = document.getElementById("treemap-tooltip");
        if (!tEl) {
          tEl = document.createElement("div");
          tEl.id = "treemap-tooltip";
          tEl.className = "treemap-tooltip";
          document.body.appendChild(tEl);
        } else if (tEl.parentNode !== document.body) {
          document.body.appendChild(tEl);
        }
      })();

      // micro tooltip helpers used for hover when moving the mouse
      const tooltip = d3.select("#treemap-tooltip");
      function showTooltip(ev, html) {
        const pad = 12;
        tooltip.style("display", "block").html(html);
        const r = tooltip.node().getBoundingClientRect();
        const W = innerWidth, H = innerHeight;
        let left = ev.clientX + pad, top = ev.clientY + pad;
        if (left + r.width + 2 > W) left = ev.clientX - r.width - pad;
        if (top  + r.height + 2 > H) top  = ev.clientY - r.height - pad;
        left = Math.max(4, Math.min(W - r.width  - 4, left));
        top  = Math.max(4, Math.min(H - r.height - 4, top));
        tooltip.style("left", left + "px").style("top", top + "px");
      }
      const hideTooltip = () => tooltip.style("display", "none");

      // =========================================================
      // 10) DRAW (for current zoom state)
      // =========================================================
      // single draw pass that:
      //  - picks the right set of nodes for the current state (overview, other-bucket, or inside a group)
      //  - binds to g.cell
      //  - positions + colors rects
      //  - handles tooltips and click behavior
      //  - writes labels into foreignObjects (when zoomed in)
      function draw(node) {
        const nodes =
          node === root
            ? root.leaves()
            : isOtherCombined(node)
            ? (node.children || [])
            : (node.leaves() || []);

        const cells = g
          .selectAll("g.cell")
          .data(
            nodes,
            d => d.ancestors().map(a => a.data.name).join("/") // stable key across zooms
          )
          .join(enter => {
            const cell = enter.append("g").attr("class", "cell");
            cell.append("rect").attr("class", "tile-rect");
            cell
              .append("foreignObject")
              .attr("class", "leaf-fo")
              .style("pointer-events", "none")
              .append("xhtml:div")
              .attr("class", "leaf-html")
              .style("pointer-events", "none");
            return cell;
          });

        // color chooser by mode. neutralize “other …” buckets so they stand out softly.
        function fillFor(d) {
          if (currentMode === "use") {
            if (norm(d.data?.name) === OTHER_KEY) return OTHER_COLOR;
            if (isOtherCombined(node)) return OTHER_COLOR;
            const inOther = d.ancestors().slice(1).some(a => norm(a.data?.name) === OTHER_KEY);
            if (inOther) return OTHER_COLOR;

            // normal case: color by the immediate parent bucket (family) at this level
            const bucket =
              node === root
                ? (d.parent?.data?.name || "")
                : (d.parent?.data?.name || d.data?.name || "");
            return color(bucket);
          } else {
            if (norm(d.data?.name) === OTHER_MAT_KEY) return OTHER_COLOR;
            if (isOtherCombined(node)) return OTHER_COLOR;
            const inOtherM = d.ancestors().slice(1).some(a => norm(a.data?.name) === OTHER_MAT_KEY);
            if (inOtherM) return OTHER_COLOR;

            // material mode: color by the immediate parent bucket (material)
            const bucket =
              node === root
                ? (d.parent?.data?.name || "")
                : (d.parent?.data?.name || d.data?.name || "");
            return colorMaterial(bucket);
          }
        }

        // position + size + color the rectangles every time we draw
        cells.select("rect.tile-rect")
          .attr("x", d => sx(d.x0))
          .attr("y", d => sy(d.y0))
          .attr("width", d => Math.max(0, sx(d.x1) - sx(d.x0)))
          .attr("height", d => Math.max(0, sy(d.y1) - sy(d.y0)))
          .attr("fill", fillFor)
          .style("fill", fillFor);

        // set leaf label text color to contrast the tile fill (esp. in material mode)
        cells.each(function(d){
          const bg = d3.select(this).select("rect.tile-rect").attr("fill") || "#cccccc";
          const color = textForBG(bg);  // → '#222' on pale tiles, '#fff' on dark tiles
          d3.select(this).select(".leaf-html").style("color", color);
        });

        // --------------------------
        // Hover (tooltips)
        // --------------------------
        cells
          .on("mousemove", (ev, d) => {
            // 1) overview (root): hovering a leaf shows its parent bucket summary
            if (node === root) {
              const parentNode = d.parent;
              const name = (currentMode === "material")
                ? displayMaterial(parentNode?.data?.name || "")
                : displayFamily(parentNode?.data?.name || "");
              const total = parentNode ? (parentNode.value || 0) : (d.value || 0);
              const totalText = (currentMode === "material")
                ? `Weighted total: ${Math.round(total)}`
                : `Total objects: ${total}`;
              showTooltip(ev, `<div class="tt-title">${name}</div><div>${totalText}</div>`);
              return;
            }

            // 2) inside an “other …” bucket: show the child bucket + matching total label
            if (isOtherCombined(node)) {
              const label = (currentMode === "material")
                ? displayMaterial(d.data.name || "")
                : displayFamily(d.data.name || "");
              const val = Math.round(d.value || 0);
              const line = (currentMode === "material")
                ? `Weighted total: ${val}`   // note: weighted at this parent level
                : `Total: ${val}`;
              showTooltip(ev, `<div class="tt-title">${label}</div><div>${line}</div>`);
              return;
            }

            // 3) inside a specific bucket (family or material)
            const bucketLabel = (currentMode === "material")
              ? displayMaterial(d.parent?.data?.name ?? "—")
              : displayFamily(d.parent?.data?.name ?? "—");

            if (currentMode === "material") {
              // inside one material, children are types. compute *true* object count for this type under that material.
              const typeName = d.data.name;
              const rows = details[typeName] || details[norm(typeName)] || [];
              const mat = norm(node?.data?.name || "");
              let count = 0;
              for (const r of rows) {
                const raw = (r.main_material || "").toLowerCase();
                if (!raw || raw === "unknown") continue;
                const toks = raw
                  .split(/[,/&;]|\sand\s|\+|\|/g)
                  .map(t => t.trim())
                  .filter(Boolean);
                if (new Set(toks).has(mat)) count += 1;
              }
              showTooltip(
                ev,
                `<div class="tt-title">${typeName}</div>
                 <div>Material: ${bucketLabel}</div>
                 <div>Total objects: ${count}</div>`
              );
            } else {
              // by-use: show the object type within the chosen family, with its count
              showTooltip(
                ev,
                `<div class="tt-title">${d.data.name}</div>
                 <div>Family: ${bucketLabel}</div>
                 <div>Count: ${d.value || 0}</div>`
              );
            }
          })
          .on("mouseleave", hideTooltip)
          .on("click", (ev, d) => {
            if (current === root) {
              // overview: click any leaf → zoom to its parent (family or material). if leaf lives under an “other …” group, zoom to that group.
              const ocAction = d.ancestors().find(a => norm(a.data?.name) === OTHER_KEY);
              const ocMat   = d.ancestors().find(a => norm(a.data?.name) === OTHER_MAT_KEY);
              zoom_to(ocAction || ocMat ? (ocAction || ocMat) : d.parent);
            } else if (isOtherCombined(node)) {
              // inside an “other …” bucket: click a child small-bucket to zoom into it
              zoom_to(d);
            } else {
              // inside a specific bucket: click a type → open details panel for that type within this bucket
              const typeName = d?.data?.name || "";
              const parentKey = d?.parent?.data?.name || "";
              if (typeName) showDetails(typeName, parentKey);
              ev.stopPropagation?.();
            }
          });

        // labels inside tiles (only visible when zoomed in)
        cells.select("foreignObject.leaf-fo")
          .attr("x", d => sx(d.x0) + 6)
          .attr("y", d => sy(d.y0) + 6)
          .attr("width", d => Math.max(0, sx(d.x1) - sx(d.x0) - 12))
          .attr("height", d => Math.max(0, sy(d.y1) - sy(d.y0) - 12))
          .style("display", current === root ? "none" : "block");

        // fill label text depending on mode + zoom state
        cells.select("div.leaf-html").each(function (d) {
          if (current === root) { this.textContent = ""; return; }
          const w = sx(d.x1) - sx(d.x0);
          const h = sy(d.y1) - sy(d.y0);
          if (w < 70 || h < 30) { this.textContent = ""; return; }

          if (currentMode === "material") {
            // inside “other materials” at one level deeper → just show the material name (no weighted count in the label)
            if (norm(current?.data?.name) === OTHER_MAT_KEY) {
              this.textContent = displayMaterial(d.data.name);
              return;
            }
            // otherwise we’re inside a specific material bucket, children are TYPES → show TRUE object count per type
            const base = d.data.name;
            const rows = details[base] || details[norm(base)] || [];
            const mat = norm(current?.data?.name || "");
            let count = 0;
            for (const r of rows) {
              const raw = (r.main_material || "").toLowerCase();
              if (!raw || raw === "unknown") continue;
              const toks = raw.split(/[,/&;]|\sand\s|\+|\|/g).map(t => t.trim()).filter(Boolean);
              if (new Set(toks).has(mat)) count += 1;
            }
            this.textContent = `${base} (${count})`;
          } else {
            // by-use mode: inside a family (or inside “other actions” where children are small families)
            const base = isOtherCombined(current) ? displayFamily(d.data.name) : d.data.name;
            this.textContent = `${base} (${d.value || 0})`;
          }
        });
      }

      // =========================================================
      // 11) ZOOM + BACK
      // =========================================================
      // back button always returns to the overview (root)
      back_button.on("click", () => zoom_to(root));

      // animate camera + update headers/chips, then redraw for the new focus
      function zoom_to(node) {
        if (!node || node === current) return;

        current = node;
        const at_root = node === root;

        if (at_root) hideDetails();

        // header + back label states
        if (at_root) {
          back_button.classed("is-ghost", true);
          zoom_card
            .classed("is-ghost", false)
            .select(".zoom-title")
            .text(currentMode === "material" ? "All Materials" : "All Actions");
        } else {
          back_button
            .classed("is-ghost", false)
            .text(currentMode === "material" ? "← Back to all materials" : "← Back to all actions");
          const title =
            currentMode === "material"
              ? displayMaterial(node?.data?.name || "")
              : displayFamily(node?.data?.name || "");
          zoom_card.classed("is-ghost", false).select(".zoom-title").text(title);
        }

        // “camera” is the scale domain: focus the selected node’s box to the full viewport
        sx.domain([node.x0, node.x1]);
        sy.domain([node.y0, node.y1]);

        // animate rect positions for a smooth zoom
        const t = svg.transition().duration(550);
        g.selectAll("g.cell")
          .transition(t)
          .select("rect")
          .attr("x", (d) => sx(d.x0))
          .attr("y", (d) => sy(d.y0))
          .attr("width", (d) => Math.max(0, sx(d.x1) - sx(d.x0)))
          .attr("height", (d) => Math.max(0, sy(d.y1) - sy(d.y0)));

        // chips are shown only at overview (regardless of mode)
        if (at_root) gFamilyChips.attr("display", null).style("opacity", 1);
        else gFamilyChips.attr("display", "none").style("opacity", 0);

        // when transition completes, run a fresh draw for the new focus level
        t.on("end", () => draw(node));
      }

      // =========================================================
      // 12) MODE REBUILD
      // =========================================================
      // rebuilds the active hierarchy after a mode flip, resets to overview, and re-lays out
      function rebuildRootAndReset() {
        // rebuild hierarchy for active mode
        const activeTree = getActiveHierarchy();
        root = d3
          .hierarchy(activeTree)
          .sum((d) => d.value || 0)
          .sort((a, b) => (b.value || 0) - (a.value || 0));

        current = root;
        hideDetails();

        // clear any leftover chips (fresh render in the new mode)
        gFamilyChips.selectAll("g.family-chip").remove();

        // header text + back button states for the new mode
        if (currentMode === "material") {
          zoom_card.classed("is-ghost", false).select(".zoom-title").text("All Materials");
          back_button.text("← Back to all materials").classed("is-ghost", true);
        } else {
          zoom_card.classed("is-ghost", false).select(".zoom-title").text("All Actions");
          back_button.text("← Back to all actions").classed("is-ghost", true);
        }

        // chips at root in both modes
        gFamilyChips.attr("display", null).style("opacity", 1);

        // recompute layout + draw at the current container size
        relayoutAndDraw();
      }

      // =========================================================
      // 13) RESPONSIVE LAYOUT
      // =========================================================
      // we derive the svg viewBox from the .treemap-stage width and choose an aspect ratio
      // that’s a bit taller on mobile. whenever the stage resizes, we recompute the layout.
      const stageEl = document.querySelector(".treemap-stage");

      function relayoutAndDraw() {
        if (!stageEl) return;
        const { width } = stageEl.getBoundingClientRect();
        const mobile = window.innerWidth <= 780;
        const height = Math.round(width * (mobile ? 4 / 3 : 480 / 1000)); // reduced from 520 to 480

        // update the svg viewBox so d3.treemap can lay out in screen coords directly
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        // run the treemap layout for the active root at the chosen size
        d3.treemap().size([width, height]).paddingInner(1)(root);

        // scales: make the currently focused node's box fill the viewport
        sx.range([0, width]).domain([current.x0, current.x1]);
        sy.range([0, height]).domain([current.y0, current.y1]);

        // resize the subtle weave texture
        textureRect.attr("x", 0).attr("y", 0).attr("width", width).attr("height", height);

        // overview chips + main draw pass
        draw_family_labels_all();
        draw(current);
      }

      // observe the stage for size changes; when it resizes, recompute layout
      const ro = new ResizeObserver(relayoutAndDraw);
      if (stageEl) ro.observe(stageEl);

      // pointer cursor indicates interactivity over the svg
      svg.style("cursor", "pointer");

      // initial layout + first render
      relayoutAndDraw();

      // hide tooltip when the user scrolls or pans (so floating UI doesn’t get stuck)
      const hideFloaters = () => {
        const t = document.getElementById("treemap-tooltip");
        if (t) t.style.display = "none";
      };
      document.addEventListener("wheel", hideFloaters, { passive: true });
      document.addEventListener("touchmove", hideFloaters, { passive: true });
    });
  });
})();
