# Crafting UI Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix hover card blueprint filtering, deduplicate hover card recipes, show map display names, and show the Useable field in hover cards.

**Architecture:** Four JS-side fixes in `crafting.js` and minor data plumbing: (1) filter tooltip edges by active blueprint types, (2) deduplicate tooltip recipe display text, (3) load map display names from map.json for filter labels, (4) pass Useable/raw data to crafting nodes and display in tooltip.

**Tech Stack:** Vanilla JS (browser)

---

### Task 1: Filter hover card recipes by active Blueprint Filters

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js:1284-1354`

**Context:** The `onNodeMouseOver()` function builds the tooltip by iterating all incoming/outgoing edges without checking `getActiveBlueprintTypes()` or `getActiveCraftingCategories()`. The graph view filters correctly, but the tooltip doesn't.

**Step 1: Read the current tooltip code**

Read `crafting.js` lines 1284-1354 to confirm the current implementation.

**Step 2: Add filtering to the tooltip edge loops**

In `onNodeMouseOver()`, after getting edges (line 1301-1302), add filtering before the grouping loops. Change lines 1298-1312 to:

```js
    // Build recipe descriptions (use filtered edges if map filter is active)
    const activeET = getActiveEdgesByTarget();
    const activeES = getActiveEdgesBySource();
    const incoming = activeET[origId] || [];
    const outgoing = activeES[origId] || [];

    // Apply blueprint type and crafting category filters to tooltip edges
    const bpTypes = getActiveBlueprintTypes();
    const craftCats = getActiveCraftingCategories();

    // Group incoming by blueprintId (filtered)
    const craftRecipes = {};
    for (const e of incoming) {
        if (bpTypes && !bpTypes.includes(e.type)) continue;
        if (craftCats && !craftCats.includes(e.craftingCategory)) continue;
        if (!craftRecipes[e.blueprintId]) craftRecipes[e.blueprintId] = { type: e.type, ingredients: [], workstations: e.workstations || [], craftingCategory: e.craftingCategory || '' };
        const src = activeNM[e.source];
        craftRecipes[e.blueprintId].ingredients.push(
            (e.quantity > 1 ? e.quantity + 'x ' : '') + (src ? src.name : '?') + (e.tool ? ' (tool)' : '')
        );
    }

    // Group outgoing (salvage products etc) by blueprintId (filtered)
    const outRecipes = {};
    for (const e of outgoing) {
        if (bpTypes && !bpTypes.includes(e.type)) continue;
        if (craftCats && !craftCats.includes(e.craftingCategory)) continue;
        if (!outRecipes[e.blueprintId]) outRecipes[e.blueprintId] = { type: e.type, products: [], workstations: e.workstations || [], craftingCategory: e.craftingCategory || '' };
        const tgt = activeNM[e.target];
        outRecipes[e.blueprintId].products.push(
            (e.quantity > 1 ? e.quantity + 'x ' : '') + (tgt ? tgt.name : '?')
        );
    }
```

Note: `getActiveBlueprintTypes()` returns `null` when all types are active (no filtering needed), or an array when some are unchecked. Same for `getActiveCraftingCategories()`.

**Step 3: Verify manually**

Serve the site and check:
- Set Blueprint Filters to only "Crafting" → hover card should only show Craft recipes, not Salvage/Repair
- Set all filters on → hover card shows everything
- Uncheck a crafting category → hover card should respect it

**Step 4: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/crafting/crafting.js
git commit -m "fix(unturned): filter hover card recipes by active blueprint types"
```

---

### Task 2: Deduplicate hover card recipe display text

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js:1324-1352`

**Context:** Self-referencing edges (source == target) appear in both `craftRecipes` (incoming) and `outRecipes` (outgoing), causing duplicates. Even apart from self-references, truly distinct blueprints can produce identical display text, which is confusing in the hover card.

**Step 1: Add deduplication after building recipe HTML**

In `onNodeMouseOver()`, after the two loops that build `recipesHtml` (around line 1350), add deduplication. Replace the recipe rendering section (lines 1324-1351) with:

```js
    let recipesHtml = '';
    const seenRecipeText = new Set();

    for (const bp of Object.values(craftRecipes)) {
        let line = `<div class="tt-recipe">`;
        line += `<span class="tt-recipe-type ${esc(bp.type)}">${esc(bp.type)}</span>`;
        if (bp.craftingCategory) line += ` <span style="color:#888;font-size:0.72rem">[${esc(bp.craftingCategory)}]</span>`;
        line += `: `;
        line += bp.ingredients.map(esc).join(' + ');
        line += ` &rarr; ${esc(n.name)}`;
        if (bp.workstations.length) {
            line += `<div class="tt-workstation">Requires: ${bp.workstations.map(esc).join(', ')}</div>`;
        }
        line += `</div>`;
        // Deduplicate by visible text content
        const textKey = `${bp.type}:${bp.ingredients.join('+')}→${n.name}`;
        if (!seenRecipeText.has(textKey)) {
            seenRecipeText.add(textKey);
            recipesHtml += line;
        }
    }

    for (const bp of Object.values(outRecipes)) {
        let line = `<div class="tt-recipe">`;
        line += `<span class="tt-recipe-type ${esc(bp.type)}">${esc(bp.type)}</span>`;
        if (bp.craftingCategory) line += ` <span style="color:#888;font-size:0.72rem">[${esc(bp.craftingCategory)}]</span>`;
        line += `: `;
        line += `${esc(n.name)} &rarr; `;
        line += bp.products.map(esc).join(' + ');
        if (bp.workstations.length) {
            line += `<div class="tt-workstation">Requires: ${bp.workstations.map(esc).join(', ')}</div>`;
        }
        line += `</div>`;
        const textKey = `${bp.type}:${n.name}→${bp.products.join('+')}`;
        if (!seenRecipeText.has(textKey)) {
            seenRecipeText.add(textKey);
            recipesHtml += line;
        }
    }
```

The deduplication key is based on visible text (type + ingredients/products), not blueprint ID. This collapses visually identical recipes while preserving genuinely different ones.

**Step 2: Verify manually**

- Hover over Jackhammer → should no longer show 4x "Craft: Jackhammer → Jackhammer"
- Hover over items with legitimately different recipes → should still show all distinct recipes

**Step 3: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/crafting/crafting.js
git commit -m "fix(unturned): deduplicate hover card recipe display text"
```

---

### Task 3: Show map display names in filter checkboxes

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js:278-309`

**Context:** `buildMapFilters()` uses the manifest map key (e.g., `"a6_polaris"`) as the checkbox label. The display name (e.g., `"A6 Polaris"`) is available in each map's `map.json` file under the `name` field.

**Step 1: Update `buildMapFilters()` to load display names**

Replace lines 278-309 with:

```js
async function buildMapFilters() {
    const manifest = await dataLoader.getManifest();
    const maps = Object.keys(manifest.maps).sort();
    if (maps.length === 0) return;

    $mapFilterSection.style.display = '';
    const savedMaps = lsGet('maps', null);

    // Load display names from each map's map.json
    const mapDisplayNames = {};
    for (const map of maps) {
        const mapData = await dataLoader.getMapData(map);
        mapDisplayNames[map] = mapData?.map?.name || map;
    }

    let html = '<label class="toggle-all-label"><input type="checkbox" id="map-all"> All</label>';
    for (const map of maps) {
        const checked = savedMaps === null ? false : savedMaps.includes(map);
        html += `<label><input type="checkbox" data-map="${esc(map)}" ${checked ? 'checked' : ''}> ${esc(mapDisplayNames[map])}</label>`;
    }
    $mapFilters.innerHTML = html;

    // Wire up All toggle
    const $mapAll = document.getElementById('map-all');
    $mapAll.checked = savedMaps !== null && maps.every(m => savedMaps.includes(m));
    $mapAll.addEventListener('change', () => {
        const boxes = $mapFilters.querySelectorAll('input[data-map]');
        for (const b of boxes) b.checked = $mapAll.checked;
        onFiltersChanged();
    });

    // Wire individual map checkboxes
    $mapFilters.addEventListener('change', (e) => {
        if (e.target.dataset.map) {
            updateMapAllState();
            onFiltersChanged();
        }
    });
}
```

Note: `data-map` still uses the directory key (for filtering logic), but the visible label uses the display name.

**Step 2: Verify manually**

- Map filter section should show "A6 Polaris" instead of "a6_polaris", "PEI" instead of "pei", etc.
- Filtering behavior should be unchanged

**Step 3: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/crafting/crafting.js
git commit -m "fix(unturned): show map display names in filter checkboxes"
```

---

### Task 4: Show Useable field in hover card

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js` (node creation in `buildCraftingGraph`)
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js:1284-1296` (tooltip rendering)

**Context:** The `Useable` field (e.g., "Consumeable", "Throwable", "Gun") is in each entry's `raw` dict. Nodes in the crafting graph currently only carry `name`, `type`, `rarity`, `category`, `maps`. We need to pass `raw.Useable` through to the tooltip.

**Step 1: Add `useable` to node data in `buildCraftingGraph`**

In `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`, the `ensureNode` function (line 940-953) creates nodes from `guidIndex.entries`. But `guidIndex.entries` only has `file`, `index`, `id`, `type`, `name` — no `raw` data. Instead, the full entry data is available in the `entryByGuid` lookup (line 957-960).

Update the node creation section. After `ensureNode` is called and the node is pushed, enrich it with entry data. Change the node push in `ensureNode` (line 945-952) to also check the `entryByGuid` map:

Actually, `ensureNode` doesn't have access to `entryByGuid`. The cleanest approach: after building `entryByGuid`, add a second pass that enriches nodes with entry data. Add after line 960:

In `buildCraftingGraph`, after the blueprint processing loop, add enrichment:

```js
  // Enrich nodes with entry data (rarity, useable, etc.)
  for (const node of nodes) {
    const entry = entryByGuid[node.id];
    if (entry) {
      node.rarity = entry.rarity || '';
      node.useable = (entry.raw && entry.raw.Useable) || '';
    }
  }
```

Wait — this should happen AFTER the main loop processes all entries, but the entries passed to `buildCraftingGraph` may not include all referenced items (some come from `guidIndex` only). So we should set `useable` in `ensureNode` too. The simplest approach: make `ensureNode` accept optional extra data.

Better approach: just check `entryByGuid` in the enrichment loop — nodes that don't have an entry in the local entries list will just have `useable: ''`, which is fine.

Actually, simplest: modify `ensureNode` to also accept the entries array. But `ensureNode` is a closure that already has access to `entryByGuid` at the outer scope. So:

```js
  function ensureNode(guid) {
    if (nodeSet.has(guid)) return true;
    const gi = guidIndex.entries[guid];
    if (!gi) return false;
    nodeSet.add(guid);
    const entry = entryByGuid[guid];
    nodes.push({
      id: guid,
      name: gi.name,
      type: gi.type || '',
      rarity: entry?.rarity || '',
      useable: entry?.raw?.Useable || '',
      category: [],
      maps: [],
    });
    return true;
  }
```

Wait — `entryByGuid` is built AFTER `ensureNode` is defined (line 957-960) but BEFORE the loop that calls it (line 963). So `ensureNode` can access it. But currently `ensureNode` is defined before `entryByGuid` is populated. Move `entryByGuid` population before `ensureNode`, or just reference it (JS closures capture variables by reference, not by value, so this works fine as long as `entryByGuid` is populated before `ensureNode` is called).

Actually, looking again: `ensureNode` is defined at line 940 and `entryByGuid` is built at line 957. Since JS closures capture by reference and `entryByGuid` is populated before any call to `ensureNode` (the processing loop starts at line 963), this works. Just update `ensureNode`.

**Step 2: Display useable in the tooltip**

In `crafting.js` `onNodeMouseOver()`, update the meta line (line 1296):

```js
    $meta.textContent = [n.type, n.useable, n.rarity].filter(Boolean).join(' \u2022 ') || 'Unknown';
```

This inserts the Useable value between Type and Rarity, e.g.: `"Food • Consumeable • Rare"`.

**Step 3: Verify manually**

- Hover over a food item → should show "Food • Consumeable • [rarity]"
- Hover over a gun → should show "Gun • Gun • [rarity]" ... hmm, that's redundant.

Actually, `type` often matches `useable` (Gun/Gun, Melee/Melee). Let's only show `useable` when it differs from `type`:

```js
    const metaParts = [n.type];
    if (n.useable && n.useable.toLowerCase() !== n.type.toLowerCase()) metaParts.push(n.useable);
    if (n.rarity) metaParts.push(n.rarity);
    $meta.textContent = metaParts.join(' \u2022 ') || 'Unknown';
```

This way:
- Food item with Useable=Consumeable: `"Food • Consumeable • Rare"`
- Gun with Useable=Gun: `"Gun • Rare"` (no redundancy)
- Throwable with type=Throwable, Useable=Throwable: `"Throwable • Uncommon"`

**Step 4: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/js/common.js site/unturned/crafting/crafting.js
git commit -m "feat(unturned): show Useable field in crafting hover cards"
```

---

### Task 5: Run existing tests and verify

**Step 1: Run playwright tests**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
npx playwright test tests/catalog-custom-tables.spec.mjs
```

Expected: All 5 pass.

**Step 2: Manual verification checklist**

Serve the site (`cd site && python3 -m http.server 8080`) and verify:
- [ ] Blueprint Filters restrict hover card recipes (Task 1)
- [ ] No duplicate recipe lines in hover cards (Task 2)
- [ ] Map filter shows "A6 Polaris" not "a6_polaris" (Task 3)
- [ ] Hover card shows Useable between type and rarity when different (Task 4)
- [ ] All map filtering still works correctly
- [ ] No console errors

**Step 3: Commit if any fixes needed**

---

## Execution Notes

- All tasks are in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`
- Tasks 1 and 2 both modify the same area of `crafting.js` (tooltip code) — run sequentially
- Task 3 modifies a different area of `crafting.js` — could run in parallel with 1-2
- Task 4 modifies both `common.js` and `crafting.js`
- After Plan A (exporter fixes) is done and data re-exported, the hover card improvements here will show correct data
