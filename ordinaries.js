// loading data, and setting up a promise (".then") to run the rest of the code once the data is ready

Promise.all([
  d3.json("treemap_data.json"),
  d3.json("object_details.json")
]).then(([treemapdata, detailsdata]) => {
  
    // storing the loaded data in variables for easier access
    const rawdata = treemapdata; // the hierarchical data for the treemap
    const details = detailsdata; // the flat data with details for each object type
    
    /* ===== BASIC ELEMENTS AND FUNCTIONS THAT WILL BE USED LATER ===== */

    const norm = s => (s || "").toLowerCase().replace(/[\s\u00A0]+/g, " ").trim(); // normalize strings for matching action verbs: it covers trim, lowercase, and collapses spaces. 
    // mostly used to avoid having to use upper/lowercase in the js

    const other_combined_key = "other actions";  // normalized form
    const other_color = "#6f6f6f";

    // mapping the raw data family names that come from treemap.data.json (keys) to names that will be displayed on the front end (values)
    const display_family = {
      "eat, cook & drink": "Eating, Cooking & Drinking",
      "read, write & record": "Reading, Writing & Recording",
      "dress & accessorize": "Dressing & Accessorizing",
      "heal & care": "Healing & Caring",
      "work & build": "Working & Building",
      "commemorate & symbolize": "Commemorating & Symbolizing",
      "decorate & furnish": "Decorating & Furnishing",
      "fight": "Fighting",
      "ignite & manage fire": "Igniting & Managing Fire",
      "measure & navigate": "Measuring & Navigating",
      "perform music": "Performing Music",
      "play": "Playing",
      "smoke": "Smoking",
      "textile making": "Making Textiles",
      "worship": "Worshipping",
      "other": "Other",
      "other actions": "Other Actions"
    };
    // function to get the display name for a family
    const display_family_name = name => display_family[norm(name)];
    
    // selecting the SVG canvas for the treemap, defined in HTML
    const svg = d3.select(".treemap");
    // using the same size set in the html viewBox (0 0 1000 620) so the layout uses the same internal coordinate system */
    const width = 990; 
    const height = 620;

    // appending a group "g" inside the SVG to hold all the tiles and chart elements (like labels)
    // tiles will be appended as children of this group (g class="cells")
    const g = svg.append("g");

    // selecting other HTML elements that will be used for interactivity, defined in HTML
    const button_row = d3.select(".button-row"); // flex container that contains the button and aligns it to the right
    const back_button   = d3.select(".back-to-all"); // “Back to all actions” button
    const zoom_card  = d3.select(".zoom-card");   // small card showing current zoomed action family
    const tooltip = d3.select(".treemap-tooltip"); // tooltip for showing info on hover
    const detailsPanel = d3.select("#details");      // details panel overlay to show more information about a selected object
    const detailsTitle = d3.select("#details-title");
    const detailsList  = d3.select("#details-list");
    const detailsSubtitle = d3.select(".details-subtitle");

    // defining set of action families to drop from the visualization
    // explanation: Categories ‘Pay & exchange’ (mostly banknotes and coins) and ‘Portray, display & decorate’ (mostly silhouettes and prints)
    // overpower the visualization because either they don't really represent "everyday actions" (like prints and silhouettes) and/or they have very high counts (like bank notes)
    // so they were dropped to allow more interesting families to be seen
    // this editorial choice is specified in the note below the viz
    const drop_actions = ["portray, display & decorate", "pay & exchange", "other"];
    
    // filter out dropped families from the database
    const filtered_data = {
      name: rawdata.name,
      // children names (action families) will be taken from the JSON if present, otherwise default to an empty array
      // the ? is optional chaining to avoid errors if the element in rawdata is null or undefined (instead of throwing an error, it will just return undefined)
      children: (rawdata?.children || [])
      // creating a new array with only the families that are not in the drop_actions list
      // for each child object called f (a family name), it checks if the normalized name of f is in the drop_actions array
      // if it is not in the array (!), it keeps it in the new array
      .filter(f => !drop_actions.includes(norm(f.name)))
    };

    // when the total count in an action family is less than the defined cap, it will be grouped into “Other Actions” in the viz (to avoid having too many tiny families)
    const cap = 70;
    // function to check if a node is the "Other Actions" combined node
    // this will be used to determine interactivity functionality when zoomed into this node (since it behaves differently than normal families)
    function is_other_combined(node) {
      // if node, node.data or node.data.name is missing, it assigns it false by default
      if (!node || !node.data || !node.data.name) return false;
      // it compares normalized names to the other_combined_key and returns true if they match
      const name = norm(node.data.name);
      return name === other_combined_key; // e.g., "other actions"
    }

    // function to group small families under a single group named “Other Actions”
    function regroup_with_other(treemap_data, cap){
      // getting the list of top-level children (families). If any is missing, default to an empty array to avoid errors
      const families = Array.isArray(treemap_data?.children) ? treemap_data.children : [];

      // the main array bucket will hold families whose total >= cap
      // the small array will hold families whose total  < cap
      const main = [];
      const small = [];

      // looping through each family to calculate its total count (the sum of its leave's values)
      for (const fam of families) {
        // getting the children (object types) for that family, making sure they are in an array
        // default to an empty array otherwise to avoid errors
        const object_types = Array.isArray(fam.children) ? fam.children : [];

        // sum values of all leafs (object types) in this family
        let total = 0;
        for (const leaf of object_types) {
          // if value is missing, default to 0
          total += leaf?.value || 0;
        }
        // pushing the family node into the right bucket based on its total count
        if (total >= cap) {
          main.push(fam);
        } else {
          small.push(fam);
        }
      }

      // building a new array containing everything in main (...main) and appending a new node called "Other Actions", whose children are the "small" families
      // if there are no small families (small.length == 0), it just returns the main array as is
      const children = small.length > 0
        ? [...main, { name: "Other Actions", children: small }]
        : main;

      // return a new object representing the treemap with the regrouped children
      return { 
        name: treemap_data.name, 
        children 
      };
    }

    // apply the regrouping function to the filtered data
    const viz_data = regroup_with_other(filtered_data, cap);
    // creating a new array by looping over viz_data.children and pulling out each child’s name
    const families = viz_data.children.map(f => f.name);



    // using the Smithsonian API to fetch data about a specific object by its ID
    const apiKey = "wbx4TjCnMRmZCBPVwinDqyouiwiV2bWLfzaN53AV";  
    // access to individual objects by ID
    const objectBaseURL = "https://api.si.edu/openaccess/api/v1.0/content/";


    // simple in-memory cache for image URLs to avoid redundant fetches for the same object ID
    const imgCache = new Map();


    // --- helpers to pull images from the Smithsonian API ---
    function getPrimaryImageUrl(response) {
      // reach into the nested response object, and try to get the first media URL
      // response.content.descriptiveNonRepeating.online_media.media
      // "(?." is optional chaining: if any step is undefined/null, it returns undefined instead of throwing an error)
      return response?.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content || null;
    }


    async function fetchFirstImageById(id) {
      // 1) check the cache first. If there's a stored value (including null), return it (to avoid redundant fetches)
      if (imgCache.has(id)) return imgCache.get(id);

      try {
        // 2) fetch the JSON record for this object ID from the Smithsonian API
        const res = await fetch(`${objectBaseURL}${id}?api_key=${apiKey}`);

        // 3) if the HTTP response is not ok (404 / 500 / etc), return null
        if (!res.ok) {
          imgCache.set(id, null);   // store “no image found”
          return null;
        }

        // 4) parse the JSON body from the response
        const data = await res.json();

        // 5) use the helper to extract the URL of the first image (or null if not found)
        const imgUrl = getPrimaryImageUrl(data.response) || null;

        // 6) cache the result (URL or null) so the next call for this ID is instant
        imgCache.set(id, imgUrl);

        // 7) return the URL to the caller function (showDetails)
        return imgUrl;

      } catch (err) {
        // 8) if the fetch fails, log a warning but still return null, 
        // to avoid a broken image blocking the rest of the list
        console.warn("Image fetch failed:", id, err);
        imgCache.set(id, null);     // remember that this ID failed
        return null;
      }
    }

    /* ===== COLOR SCALES ===== */

    // defining the color scale for families
    // the domain is the list of unique family names (normalized)
    // filtering out the "other actions" combined node so it can have a fixed gray color
    const domain = Array.from(new Set(families.map(n => norm(n))))
    .filter(k => k !== other_combined_key);

    // defining a color palette to pair with each family
    const palette = [
      "#5A686F","#6B7C8A","#5C6F66",
      "#7A7A6C","#6E7B6F","#746D64","#7A6A74",
      "#6A6472","#7B595E","#6A727D","#626A55",
      "#8A7E5A","#6E5F6B","#4F5E5A"
    ];

    // scaleOrdinal creates an ordinal scale based on a discrete domain (family name) and range (palette)
    const color = d3.scaleOrdinal()
      .domain(domain)
      .range(palette)


    /* ===== HIERARCHY, LAYOUT, AND SCALES ===== */

    // building the hierarchy from the viz_data
    // sum() sets the value for each node, used to size the tiles
    // sort() orders nodes so bigger tiles are drawn first
    // if value is missing, default to 0 to avoid errors
    const root = d3.hierarchy(viz_data)
      .sum(d => d.value || 0)
      .sort((a,b) => (b.value||0) - (a.value||0));

    // creating the treemap layout function
    // size() sets the layout size to match the SVG viewBox
    // paddingInner() adds small gaps between tiles
    // invoking the function with root hierarchy
    d3.treemap()
      .size([width, height])
      .paddingInner(1)
      (root);

    // creating linear scales that map from the layout coordinates of each node (defined by the treemap layout)
    // to the coordinates of the viewBox of the SVG
    // these scales will be updated when zooming to a node
    const sx = d3.scaleLinear().domain([root.x0, root.x1]).range([0, width]);
    const sy = d3.scaleLinear().domain([root.y0, root.y1]).range([0, height]);

    // creating a variable to track which node is currently zoomed (click handlers will check this to decide behavior)
    // it starts at the root (no zoom)
    let current = root;


    /* ===== FAMILY LABELS ===== */

    // creating a group inside the SVG to hold the family labels
    // these labels are only shown at the root level (when not zoomed in)
    const g_labels = svg.append("g").attr("class", "family-labels");

    // drawing family labels as chips inside the tiles of verb families
    function draw_family_labels_all() {
      // getting the list of families from the root node (it any is missing, default to an empty array)
      const families = root.children || [];

      // selecting all existing family chips (g elements with class "family-chip") and binding them to the families data
      // using the family name as the key for the data join
      // the join() method appends a new g element with class "family-chip" and a text label with class "chip-fo" inside it for each new family
      const chips = g_labels.selectAll("g.family-chip")
      .data(families, d => d.data.name)
      .join(
        enter => {
        const g = enter.append("g")
          .attr("class", "family-chip")
          .attr("pointer-events", "none"); // so that it doesn't interact with the mouse
        // appending the text label as an HTML foreignObject so it has the flexibility of HTML elements (mainly for wrapping the text)
        // but the HTML is created inside the SVG coordinate system, so it aligns with the tiles and stays responsive during transitions
        g.append("foreignObject") // SVG element that can contain the HTML
          .attr("class", "chip-fo")
          // adding a div inside the foreignObject to hold the actual text
          .append("xhtml:div")
          .attr("class", "family-labels-html");
        return g;
        }
      );

      // placing and sizing each label chip to the family’s tile
      g_labels.selectAll("foreignObject.chip-fo")
      // converting the tile coordinates from the treemap layout space to the SVG viewBox using the scales
      // adding some padding so the label doesn’t touch the tile edges
      // sx(d.x0) = svg coordinate for the left edge of the tile
      // sx(d.x1) = svg coordinate for the right edge
      // sy(d.y0) = svg coordinate for the top edge
      // sy(d.y1) = svg coordinate for the bottom edge
      .attr("x", d => sx(d.x0) + 8) // left edge of the tile plus padding
      .attr("y", d => sy(d.y0) + 10) // top edge of the tile plus padding
      // the width is the tile width minus padding
      // the height is the tile height minus padding
      .attr("width",  d => sx(d.x1) - sx(d.x0) - 16)
      .attr("height", d => sy(d.y1) - sy(d.y0) - 16)

      // setting the text inside the div to the display name of the family
      g_labels.selectAll("div.family-labels-html")
        .text(d => display_family_name(d.data.name));
    };

    // drawing the family labels
    draw_family_labels_all();



    /* ===== DETAIL PANEL ===== */
    // details panel elements, these will appear when clicking on an object type
    // (already selected above)

    // details helpers:

    // function to show details for a clicked object type
    // (simple + fast)
    // 1) render *all* rows as text immediately
    // 2) fetch thumbnails ONLY for the first 50 rows (one image per row)
    // 3) as each image arrives, insert it into its <li> and tag that item
    // 4) after the fetch loop, reorder once so items-with-image go to the top
    async function showDetails(objectTypeName, familyKey){
      // look up rows for this object type (handle both raw and normalized keys)
      const all = details[objectTypeName] || details[norm(objectTypeName)] || [];
      // if familyKey is given, filter to only those in that family
      const rows = all.filter(r => norm(r.action_family) === norm(familyKey));


      // title, list, thumbnails

      // 1) update the panel header (object type name + small count line)
      detailsTitle.text(objectTypeName); // big title at the top of the panel
      detailsSubtitle.text(
        // show "N objects" (singular when N=1)
        `${rows.length} object${rows.length === 1 ? "" : "s"}`
      );

      // 2) reveal the overlay and reset its scroll position
      // - removing [hidden] makes the panel visible
      // - the scrollbar is reset to the top so the user always starts at the beginning when opening a new panel
      detailsPanel.attr("hidden", null);
      const nPanel = detailsPanel.node();
      if (nPanel) {
        nPanel.scrollTop = 0; // immediate reset (in case panel was open)
      }

      // 3) render the text list for all rows right away (no waiting for the thumbnails to load)
      // binding by EDANurl (which is unique per object)
      const items = detailsList
        .selectAll("li")
        .data(rows, d => d.EDANurl);

      // remove any <li> that no longer has a backing row, for when closing and opening different panels
      items.exit().remove();

      // create the missing <li>, and keep existing ones (merge) so they can be updated in place
      items.enter()
        .append("li")
        .merge(items)
        .attr("class", "details-item")
        .html(r => `
          <div class="details-text">
            <strong>${r.title || "(Untitled)"}</strong>
            ${r.unitCode ? ` — <em>${r.unitCode}</em>` : ""}
            ${r.collectionsURL ? ` — <a href="${r.collectionsURL}" target="_blank" rel="noopener">Link to catalog data</a>` : ""}
          </div>
        `);

      // 4) thumbnails: fetch only images for the first 50 rows (to keep it fast and avoid getting a 429 from the API)
      const cap = 50; // cap for how many images to attempt
      const first = rows.slice(0, cap);

      for (let i = 0; i < first.length; i++) {
        const row = first[i];
        try {
          // single-object fetch helper; returns a URL or null
          const imgUrl = await fetchFirstImageById(row.EDANurl);
          if (!imgUrl) continue; // skip rows without images

          // find this row’s <li>, insert the <img> at the top, and tag the item
          const liSel = detailsList
            .selectAll("li")
            .filter(d => d === row);

          liSel.insert("img", ":first-child")
            .attr("class", "details-thumb")
            .attr("src", imgUrl)
            .style("opacity", 1);

          liSel.classed("has-thumb", true); // mark to reorder later
        } catch (err) {
          // intentionally quiet: broken images shouldn’t block the list
          // console.warn("Thumbnail fetch failed:", row.EDANurl, err);
        }
      }

      // 5) reorder items to put rows that have a thumbnail at the top
      // this is a one-time reorder after all fetches are done
      const ul = detailsList.node();
      if (ul) {
        const liArray = Array.from(ul.children);
        liArray.sort((a, b) => {
          // items with .has-thumb should float to the top (1 before 0)
          const A = a.classList.contains('has-thumb') ? 1 : 0;
          const B = b.classList.contains('has-thumb') ? 1 : 0;
          return B - A;
        });
        // append in the new order (so the DOM reflects the sorted order)
        liArray.forEach(li => ul.appendChild(li));
      }

    }


    // function to hide the details panel and clear its content
    // used when clicking the close button or zooming back to root
    function hideDetails(){
      detailsPanel.attr("hidden", true);
      const n = detailsPanel.node();
      if (n) n.scrollTop = 0; // reset on close as well
      detailsList.selectAll("li").remove();
      detailsSubtitle.text("");
    }

    // "×" close button inside the header
    d3.select(".details-close").on("click", hideDetails);


    /* ===== DRAWING ===== */

    function draw(node) {
      // defining a boolean to check if the user is at the root level (not zoomed in)
      const at_root = (node === root);
      // picking which nodes to show as tiles
      // if the user is at the root, show all families
      // if zoomed into a family, show only its leaves (object types)
      // if zoomed into the “Other Actions” combined node, show its children (the small families)
      const nodes = (node === root)
        ? root.leaves()
        : (is_other_combined(node) ? (node.children || []) : (node.leaves() || []));

      // selecting the existing tiles (g elements with class "cell") and binding them to the nodes data
      const cells = g.selectAll("g.cell")
        // building a key function that uniquely identifies each node by its full path in the hierarchy
        // this helps D3 keep track of nodes during zooming and transitions
        // it creates a string by joining the names of all ancestors with slashes
        .data(nodes, d => d.ancestors().map(a => a.data.name).join("/"))
        .join(
          // this "enter" appends new elements on each redraw/zoom
          enter => {
            // create the g element for each new tile (cell)
            const cell = enter.append("g").attr("class", "cell");
            // adding a rectangle for the tile background
            cell.append("rect").attr("class", "tile-rect");
            // adding a foreignObject for the HTML content
            const fo = cell.append("foreignObject")
              // adding the class to the foreignObject
              .attr("class", "leaf-fo")
              // IMPORTANT: let pointer events pass through to the rect
              .style("pointer-events", "none");
            // adding a div inside the foreignObject to hold the actual text
            fo.append("xhtml:div")
              .attr("class", "leaf-html");
            return cell;
          }
        );

      /* ===== tooltip helpers ===== */

      // show + position the tooltip near the cursor (and keep it inside the viewport)
      function showTooltip(ev, html) {
        const pad = 12;
        // make sure it's visible and set the HTML first
        tooltip.style("display", "block").html(html);
        // measure after setting HTML
        const r = tooltip.node().getBoundingClientRect();
        const W = window.innerWidth, H = window.innerHeight;
        // try to place bottom-right of the cursor, flip if overflowing
        let left = ev.clientX + pad;
        let top  = ev.clientY + pad;
        if (left + r.width + 2 > W) left = ev.clientX - r.width - pad;
        if (top  + r.height + 2 > H) top  = ev.clientY - r.height - pad;
        // clamp inside viewport
        left = Math.max(4, Math.min(W - r.width  - 4, left));
        top  = Math.max(4, Math.min(H - r.height - 4, top));
        tooltip.style("left", left + "px").style("top", top + "px");
      }

      // hide tooltip helper to pair with mouseleave
      function hideTooltip() {
        tooltip.style("display", "none");
      }

      /* ===== rectangles: position → size → fill → events ===== */

      // positioning and sizing each tile rectangle
      cells.select("rect")
        // converting from layout coordinates to SVG viewBox coordinates
        .attr("x", d => sx(d.x0))
        .attr("y", d => sy(d.y0))
        // tile width and height, with a minimum of 0 to avoid negative sizes
        .attr("width",  d => Math.max(0, sx(d.x1) - sx(d.x0)))
        .attr("height", d => Math.max(0, sy(d.y1) - sy(d.y0)))

        // coloring the tiles
        .attr("fill", d => {
          // if zoomed into the "Other Actions" node, gray everything there
          if (is_other_combined(node)) return other_color;
          // otherwise, gray anything that has "Other Actions" anywhere above it
          const inOther = d.ancestors().slice(1).some(a => norm(a.data?.name) === other_combined_key);
          if (inOther) return other_color;
          // normal case: color by immediate parent family
          return color(norm(d.parent?.data?.name || ""));
        })

        // show tooltip on mousemove ("ev" is the event, "d" is the data for the hovered node)
        .on("mousemove", (ev, d) => {
          // fill the tooltip differently by level of zoom
          if (node === root) {
            // case 1: at root, show family name + total count
            // finding the full family node and checking if it’s inside “Other Actions”
            // if so, get the name and total from that node instead of the parent (since parent is root)
            const oc = d.ancestors().find(a => norm(a.data?.name) === other_combined_key);
            // if not, just get the parent family's count and name
            const fam_rawdata = oc ? oc.data.name : (d.parent?.data?.name ?? "—");
              // get the display name and total count
              const fam_name = display_family_name(fam_rawdata);
            // computing the total count for the family
            // if inside "Other Actions", get it from that node; otherwise, from the parent
            const fam_total = oc ? (oc.value ?? 0) : (d.parent?.value ?? d.value ?? 0);
            // building the tooltip HTML with image (if available), family name, and total count
            const tooltipHtml = `
              <div class="tip-stack">
                <div class="tip-text">
                <strong>${fam_name}</strong><br><br>Total objects: ${fam_total}</div>
              </div>`;
            showTooltip(ev, tooltipHtml);
          } else if (is_other_combined(node)) {
            // case 2: inside "Other Actions", show small family name + total count
            const html = `<div class="tip-text"><strong>${display_family_name(d.data.name)}</strong><br>Total: ${d.value || 0}</div>`;
            showTooltip(ev, html);
          } else {
            // case 3: inside a normal family, show object type name + parent family + count
            const html = `<div class="tip-text"><strong>${d.data.name}</strong><br>Family: ${display_family_name(d.parent?.data?.name ?? "—")}<br>Count: ${d.value || 0}</div>`;
            showTooltip(ev, html);
          }
        })

        // hide tooltip when leaving the tile
        .on("mouseleave", () => {
          hideTooltip();
        })

        // clicking behavior:
        // – from root, clicking a leaf zooms to its parent family (or the “Other Actions” node)
        // – inside “Other Actions”, clicking a child zooms to that small family
        // – inside a normal family, clicking an object-type tile shows the details
        .on("click", (ev, d) => {
          if (current === root) {
            // at root: clicking a leaf zooms to its parent family (or “Other Actions”)
            const oc = d.ancestors().find(a => norm(a.data?.name) === other_combined_key);
            zoom_to(oc ? oc : d.parent);
          } else if (is_other_combined(node)) {
            // inside “Other Actions”: click a child to zoom to that small family
            zoom_to(d);
          } else {
            // inside a normal family: clicking an object-type tile shows the details
            const name = d?.data?.name || "";
            // get the family key (name) from the parent node
            const famKey = d?.parent?.data?.name || "";
            if (name) showDetails(name, famKey);
            // prevent zooming when clicking to show details
            ev.stopPropagation?.();
          }
        });

      // inner labels for object types (show only when tiles are big enough)
      // positioning, sizing, and filling the foreignObject and its div
      cells.select("foreignObject.leaf-fo")
        // positioning and sizing the foreignObject to fit inside the tile with some padding
        .attr("x", d => sx(d.x0) + 6)
        .attr("y", d => sy(d.y0) + 6)
        .attr("width",  d => Math.max(0, sx(d.x1) - sx(d.x0) - 12))
        .attr("height", d => Math.max(0, sy(d.y1) - sy(d.y0) - 12))
        // when at the root, hide all inner labels; otherwise, show them
        .style("display", (node === root) ? "none" : "block");

      // setting the text inside the div to the object type name + count
      cells.select("div.leaf-html")
        .each(function (d) {
          // 1. when at the root level (showing the family tiles),
          //the inner object-type labels shouldn't be visible
          if (node === root) {
            this.textContent = "";
            return;
          }

          // 2. calculating this tile’s visible width and height
          const w = sx(d.x1) - sx(d.x0);
          const h = sy(d.y1) - sy(d.y0);

          // 3. defining minimum width and height to decide which labels to show
          const minWidth = 70; // too short to display any text
          const minHeight = 30;  // must be at least this wide to also show labels

          // 4. if the tile is smaller than the minimums, show no label
          if (w < minWidth || h < minHeight) {
            this.textContent = "";
            return;
          }

          // 5. otherwise set the label text
          const base = is_other_combined(node)
            ? display_family_name(d.data.name)
            : d.data.name;

          this.textContent = `${base} (${d.value || 0})`;
        });

    } 

    /* ===== zoom behaviour and buttons ===== */

    // clicking the back button zooms back to the root
    back_button.on("click", () => zoom_to(root));

    // zooming function
    function zoom_to(node){
      if (!node || node === current) return;
      current = node;

      // boolean to check if the user is at the root level (not zoomed in)
      const at_root = (node === root);

      // hiding the details panel when zooming
      if (at_root) hideDetails();

      // showing and hiding the back button and its container
      // using attr("hidden", true) to hide, and attr("hidden", null) to show
      // when at the root, hide the button; otherwise, show it
      button_row.attr("hidden", at_root ? true : null);
      back_button.attr("hidden", at_root ? true : null);

      // showing and hiding the zoom card
      // when at the root, hide the card
      if (at_root) {
        zoom_card.attr("hidden", true);
      } else {
        // pick a readable family name; never show empty
        const famRaw = node?.data?.name || "";
        const title  = display_family_name(famRaw) || famRaw; // fallback to raw

        if (title) {
          zoom_card
            .attr("hidden", null)
            .html(`<span class="zoom-title">${title}</span>`);
        } else {
          // nothing sensible to show → hide card
          zoom_card.attr("hidden", true);
        }
      }

      // updating the scale domains to the clicked node (this is the “zoom”)
      sx.domain([node.x0, node.x1]);
      sy.domain([node.y0, node.y1]);

      // animating tiles + labels to their new positions
      // creating a transition for the SVG that lasts 550ms
      const t = svg.transition().duration(550);
      // transitioning the tiles to their new positions and sizes
      // transition(t) applies the transition to all selected elements
      g.selectAll("g.cell").transition(t).select("rect")
        .attr("x", d => sx(d.x0)).attr("y", d => sy(d.y0))
        .attr("width",  d => Math.max(0, sx(d.x1) - sx(d.x0)))
        .attr("height", d => Math.max(0, sy(d.y1) - sy(d.y0)));

      // family labels visible only at root; hide labels while zoomed
      if (at_root) {
        g_labels.attr("display", null).style("opacity", 1);
      } else {
        g_labels.attr("display", "none").style("opacity", 0);
      }

      // after the transition finishes, redraw the correct level’s nodes
      t.on("end", () => draw(node));
    }

    /* ===== CAROUSEL  ===== */

    // selecting DOM elements for the carousel
    const prevBtn = d3.select('#prevBtn');
    const nextBtn = d3.select('#nextBtn');
    const container = d3.select('.carousel-track-container'); // scrollable viewport
    const track = d3.select('.carousel-track'); // row of cards
    const cards = d3.selectAll('.card').nodes(); // all the cards as an array of DOM nodes (each card is a div with class "card")

    /* helper function that calculates how far to scroll per click (one card + gap) */
    function step(){
      if (!cards.length) return 0; // no cards, no step
      const cardW = cards[0].getBoundingClientRect().width; // width of one card
      const gap = parseFloat(getComputedStyle(track.node()).gap || 0); // gap between cards
      return cardW + gap; // per-click distance
    }

    /* helper function that enables/disables nav buttons at the edges */
    function clampButtons(){
      const el  = container.node(); // the scrollable element
      const max = el.scrollWidth - el.clientWidth - 1; // total scrollable distance
      // set disabled attribute and check if at the buttons are at the edge; if so, disable that button
      prevBtn.attr('disabled', el.scrollLeft <= 0 ? true : null); // left edge
      nextBtn.attr('disabled', el.scrollLeft >= max ? true : null); // right edge
    }

    /* click handlers: scroll smoothly and by one step */
    nextBtn.on('click', () => {
      container.node().scrollBy({ left:  step(), behavior: 'smooth' });
    });
    prevBtn.on('click', () => {
      container.node().scrollBy({ left: -step(), behavior: 'smooth' });
    });

    /* keep buttons in sync with position and layout changes */
    container.on('scroll', clampButtons); // as the user scrolls
    d3.select(window).on('resize.carousel', clampButtons); // re-measure after layout shifts (like window resize)

    /* initial clamp after first paint so buttons start correct, mainly to make sure that the first left button is enabled correctly */
    requestAnimationFrame(clampButtons);

    // setting the cursor to pointer when hovering over the SVG to indicate interactivity
    svg.style("cursor","pointer");

    // finally, now that everything is set up, draw the first render of the treemap at the root level
    draw(root);

});
