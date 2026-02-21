# UI Integration — Implementation Plan (Plan D)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consume Plan C's enriched export data in the JS frontend — resolve Actions into crafting edges, display blueprint skill/conditions, distinguish skin-swap recipes, integrate properties into catalog, and fix known arrow/salvage bugs.

**Architecture:** Five feature changes plus two bug fixes across `common.js` (graph builder), `crafting.js` (tooltip rendering + edge styling), and `catalog/` (column detection). All work is in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`. Plan C must be complete and re-exported before this plan executes.

**Tech Stack:** Vanilla JS (browser), Cytoscape.js (graph library)

---

### Task 1: Migrate `entry.raw.Useable` to `entry.useable`

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`

**Context:** Plan C promotes `Useable` to a base BundleEntry field and removes `raw` from the default export. Two references in `common.js` need updating.

**Step 1: Read the current code**

Read `common.js` and find the two `entry.raw.Useable` references (currently around lines 957 and 1051 in `buildCraftingGraph`).

**Step 2: Update both references**

Change:
```js
useable: entry?.raw?.Useable || '',
```
To:
```js
useable: entry?.useable || '',
```

Do this in both locations: inside `ensureNode()` and in the enrichment loop.

**Step 3: Verify no other `raw` references remain**

Search `common.js` and all JS files under `site/unturned/` for `.raw.` or `.raw[` to confirm nothing else depends on `raw`.

**Step 4: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "fix(unturned): migrate entry.raw.Useable to entry.useable"
```

---

### Task 2: Investigate and fix arrow direction bug

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`
- Possibly: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`

**Context:** Graph edges point the opposite direction from what's intuitive. Ingredients should arrow toward products. This is a pre-existing bug unrelated to Plan C data, but should be fixed before adding Action edges.

**Step 1: Read the edge creation code**

Read `buildCraftingGraph` in `common.js` — find where edges are pushed with `source` and `target`. Determine the convention: does `source` mean "ingredient" or "product"?

Also read the Cytoscape graph initialization in `crafting.js` — find the edge style configuration. Check if `target-arrow-shape` is set and which end the arrow points to.

**Step 2: Determine the fix**

The arrow should point from ingredient → product (source=ingredient, target=product, arrow on target end). Check whether:
- The edge `source`/`target` are swapped in `buildCraftingGraph`, OR
- The Cytoscape arrow style points the wrong way (e.g., `source-arrow-shape` instead of `target-arrow-shape`)

**Step 3: Apply the fix**

Fix whichever is wrong. If `source`/`target` are semantically correct (source=ingredient, target=product), fix the Cytoscape arrow config. If they're swapped, fix the edge creation.

**Step 4: Verify manually**

Serve the site and check that arrows point from ingredients toward crafted items.

**Step 5: Commit**

```bash
git add site/unturned/crafting/crafting.js site/unturned/js/common.js
git commit -m "fix(unturned): correct arrow direction in crafting graph"
```

---

### Task 3: Investigate and fix Salvage mislabeled as Craft

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`

**Context:** Many Salvage-type blueprints show as "Craft" in the graph and tooltip. Plan A reclassified `Tool` blueprint types as `Salvage` in the Python exporter, but the JS graph builder may have its own type mapping that isn't aware of this change.

**Step 1: Read the edge type determination code**

In `buildCraftingGraph`, find where `edgeType` is set. Look for:
- How `blueprint.name` maps to edge type
- Whether there's a hardcoded type mapping in JS
- Whether the Python export's `blueprint.name` field (which should now be "Salvage" for Tool types) is being used correctly

**Step 2: Read the exported data**

Check a few entries in the exported JSON to see what `blueprint.name` values actually look like after Plan A + Plan C. Are they "Salvage" or still "Tool"/"Craft"?

**Step 3: Identify and fix the mismatch**

The fix depends on what's found:
- If the exported `name` is correct ("Salvage") but JS overrides it → fix JS mapping
- If the exported `name` is wrong → fix in Plan C's exporter (add a note, not a code change here)
- If the JS has a fallback that catches too many types as "Craft" → tighten the fallback

**Step 4: Verify manually**

Check that items with salvage recipes show "Salvage" (not "Craft") in the tooltip and graph.

**Step 5: Commit**

```bash
git add site/unturned/js/common.js
git commit -m "fix(unturned): correctly label Salvage recipes in crafting graph"
```

---

### Task 4: Add State_Transfer "Skin Swap" display

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`

**Context:** Blueprints with `state_transfer: true` are skin-swap recipes (base ↔ skinned variant). Currently displayed as "Craft", causing confusing "REAPER Stock → REAPER Stock" tooltips. They should display as "Skin Swap" with distinct styling.

**Step 1: Read the edge type assignment in `buildCraftingGraph`**

Find where `edgeType` is determined from blueprint data. This is where we'll add the `state_transfer` check.

**Step 2: Add skin_swap edge type**

In `buildCraftingGraph`, when processing a blueprint, check for `state_transfer`:

```js
// After determining edgeType from blueprint.name:
if (bp.state_transfer) {
    edgeType = 'skin_swap';
}
```

This should come AFTER the normal type determination but BEFORE edge creation.

**Step 3: Add skin_swap styling in crafting.js**

Find the edge type style configuration (where craft, salvage, repair get their colors/shapes). Add an entry for `skin_swap`:

```js
skin_swap: { color: '#9b59b6', label: 'Skin Swap' }  // purple, or whatever fits the palette
```

**Step 4: Verify manually**

- Find a skin-swap item (e.g., REAPER Stock variants on A6 Polaris)
- Hover card should show "Skin Swap" instead of "Craft"
- Edge should have distinct color in graph

**Step 5: Commit**

```bash
git add site/unturned/js/common.js site/unturned/crafting/crafting.js
git commit -m "feat(unturned): display State_Transfer blueprints as Skin Swap"
```

---

### Task 5: Display blueprint skill requirements in tooltips

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`

**Context:** `edge.skill` and `edge.skillLevel` are already stored on graph edges by `buildCraftingGraph` but never displayed in the hover card tooltip. This task makes them visible.

**Step 1: Read the tooltip recipe rendering**

In `crafting.js`, find `onNodeMouseOver()` and read the recipe rendering section — specifically where workstations are displayed (the `tt-workstation` div).

**Step 2: Add skill display after workstations**

After the workstations line in both the `craftRecipes` and `outRecipes` loops, add:

```js
if (bp.skill) {
    let skillText = bp.skill;
    if (bp.skillLevel > 0) skillText += ` (Level ${bp.skillLevel})`;
    line += `<div class="tt-skill">Skill: ${esc(skillText)}</div>`;
}
```

Note: `bp` here refers to the grouped recipe object. Check whether `skill` and `skillLevel` are currently being passed into the recipe grouping objects (`craftRecipes[bpId]` and `outRecipes[bpId]`). If not, add them during the edge grouping step:

```js
if (!craftRecipes[e.blueprintId]) craftRecipes[e.blueprintId] = {
    type: e.type, ingredients: [], workstations: e.workstations || [],
    craftingCategory: e.craftingCategory || '',
    skill: e.skill || '',           // ADD
    skillLevel: e.skillLevel || 0,  // ADD
};
```

Same for `outRecipes`.

**Step 3: Add CSS styling**

In the crafting page CSS file, add:

```css
.tt-skill {
    color: #8e8;
    font-size: 0.72rem;
    margin-top: 2px;
}
```

**Step 4: Verify manually**

- Hover over an item with a skill requirement → should show "Skill: Craft (Level 2)" or similar
- Items without skill requirements should show no skill line

**Step 5: Commit**

```bash
git add site/unturned/crafting/crafting.js site/unturned/crafting/css/
git commit -m "feat(unturned): display blueprint skill requirements in hover card"
```

---

### Task 6: Display blueprint conditions in tooltips

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`

**Context:** Plan C adds `conditions` array to blueprints (holiday gates, flag checks, etc.). These need to flow through edge creation and display in tooltips.

**Step 1: Pass conditions through edge creation**

In `buildCraftingGraph`, when creating edges from blueprints, add `conditions` to the edge data:

```js
edges.push({
    source, target, type: edgeType, quantity, tool,
    workstations, skill, skillLevel, blueprintId,
    byproduct, craftingCategory,
    conditions: bp.conditions || [],  // ADD
});
```

**Step 2: Pass conditions into recipe grouping**

In `onNodeMouseOver()`, when building `craftRecipes` and `outRecipes`, include conditions:

```js
if (!craftRecipes[e.blueprintId]) craftRecipes[e.blueprintId] = {
    // ... existing fields ...
    conditions: e.conditions || [],  // ADD
};
```

**Step 3: Display conditions in tooltip**

After the skill line (from Task 5), add:

```js
if (bp.conditions && bp.conditions.length) {
    const condText = bp.conditions
        .map(c => c.type === 'Holiday' ? c.value : `${c.type}: ${c.value}`)
        .join(', ');
    line += `<div class="tt-condition">Requires: ${esc(condText)}</div>`;
}
```

**Step 4: Add CSS**

```css
.tt-condition {
    color: #e8a;
    font-size: 0.72rem;
    margin-top: 2px;
}
```

**Step 5: Verify manually**

- Find a holiday-gated blueprint (Christmas/Halloween items in vanilla) → should show "Requires: Christmas"
- Normal items should show no condition line

**Step 6: Commit**

```bash
git add site/unturned/js/common.js site/unturned/crafting/crafting.js site/unturned/crafting/css/
git commit -m "feat(unturned): display blueprint conditions in hover card"
```

---

### Task 7: Resolve Actions into crafting graph edges

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js`

**Context:** Entries can have an `actions` array where each Action points to a blueprint on another item. These cross-item recipe links (Craft_Seed, Stack, Unstack, etc.) need to become edges in the crafting graph.

**Step 1: Read the current graph builder**

Read `buildCraftingGraph` in `common.js`. Understand the main loop that processes entries and their blueprints. Find where edges are created. The action resolution should go AFTER the direct blueprint processing loop.

**Step 2: Implement action resolution**

After the main blueprint processing loop, add:

```js
// Resolve Actions into edges
for (const entry of entries) {
    if (!entry.actions || !entry.actions.length) continue;

    for (const action of entry.actions) {
        if (action.type !== 'Blueprint') continue;

        // Resolve action.source to GUID
        const sourceId = String(action.source);
        const sourceGuid = resolveNumericId(sourceId, guidIndex);
        if (!sourceGuid) continue;

        const sourceEntry = entryByGuid[sourceGuid];
        if (!sourceEntry || !sourceEntry.blueprints) continue;

        for (const bpIdx of action.blueprint_indices) {
            const bp = sourceEntry.blueprints[bpIdx];
            if (!bp) continue;

            // Determine edge type from action key
            const edgeType = action.key ? action.key.toLowerCase() : (bp.name?.toLowerCase() || 'craft');
            const bpId = `action-${sourceGuid}-${bpIdx}`;

            // Process inputs/outputs same as direct blueprints
            // but with the ACTION's owning entry as the context item
            // (the item that has the action menu, not the source item)
            const inputs = parseBlueprintRefs(bp.inputs, guidIndex);
            const outputs = parseBlueprintRefs(bp.outputs, guidIndex);

            // If no outputs, output is the action's owning entry
            if (outputs.length === 0) {
                outputs.push({ guid: entry.guid, quantity: 1, isTool: false });
            }

            // Create edges for each input→output pair
            for (const inp of inputs) {
                for (const out of outputs) {
                    if (!ensureNode(inp.guid) || !ensureNode(out.guid)) continue;
                    edges.push({
                        source: inp.guid,
                        target: out.guid,
                        type: edgeType,
                        quantity: inp.quantity,
                        tool: inp.isTool,
                        workstations: bp.workstation_tags || [],
                        skill: bp.skill || '',
                        skillLevel: bp.skill_level || 0,
                        blueprintId: bpId,
                        byproduct: false,
                        craftingCategory: bp.category_tag || '',
                        conditions: bp.conditions || [],
                    });
                }
            }
        }
    }
}
```

Note: `resolveNumericId` and `parseBlueprintRefs` may already exist as helpers in the graph builder, or may need to be extracted from the existing blueprint processing code. Read the code first to determine what can be reused.

**Step 3: Add action edge types to styling**

In `crafting.js`, add styling entries for common action keys:

```js
craft_seed: { color: '#2ecc71', label: 'Craft Seed' },
stack: { color: '#3498db', label: 'Stack' },
unstack: { color: '#e67e22', label: 'Unstack' },
```

Unknown action keys should fall back to a default style.

**Step 4: Verify manually**

- Search for Potato or other seed-craftable items → should show a "Craft Seed" recipe from the Action
- Stack items (Wood, Cloth, etc.) → should show Stack/Unstack recipes

**Step 5: Commit**

```bash
git add site/unturned/js/common.js site/unturned/crafting/crafting.js
git commit -m "feat(unturned): resolve Actions into crafting graph edges"
```

---

### Task 8: Catalog properties column integration

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/catalog/catalog.js` (or wherever column detection lives)

**Context:** Plan C adds `properties: {}` to entries with type-specific fields. The catalog's column auto-detection needs to discover these as available columns.

**Step 1: Read the column detection code**

Find the function that scans entries to determine available columns. Understand how columns are currently registered (field name → column config).

**Step 2: Extend column detection to walk properties**

After scanning top-level fields, also scan `entry.properties`:

```js
for (const [key, val] of Object.entries(entry.properties || {})) {
    if (val === '' || val === null || val === undefined) continue;
    // Register column with display name derived from key
    registerColumn({
        key: `properties.${key}`,
        label: snakeToTitle(key),  // "damage_player" → "Damage Player"
        getValue: (e) => e.properties?.[key] ?? '',
    });
}
```

**Step 3: Add snakeToTitle helper if needed**

```js
function snakeToTitle(s) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

**Step 4: Verify manually**

- Open catalog, select a weapon table → should see columns like "Firerate", "Range", "Damage Player"
- Select a food table → should see "Health", "Food", "Water", etc.
- Columns should sort and filter correctly

**Step 5: Commit**

```bash
git add site/unturned/catalog/
git commit -m "feat(unturned): auto-detect properties columns in catalog"
```

---

### Task 9: Run tests and verify

**Step 1: Run existing playwright tests**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
npx playwright test tests/catalog-custom-tables.spec.mjs
```

Expected: All pass.

**Step 2: Manual verification checklist**

Serve the site and verify:
- [ ] Arrows point ingredient → product in crafting graph (Task 2)
- [ ] Salvage recipes show as "Salvage" not "Craft" (Task 3)
- [ ] Skin-swap recipes show as "Skin Swap" with distinct color (Task 4)
- [ ] Skill requirements appear in hover card when present (Task 5)
- [ ] Holiday conditions appear in hover card when present (Task 6)
- [ ] Action-sourced recipes appear (Craft Seed, Stack, Unstack) (Task 7)
- [ ] Catalog shows properties columns for weapon/food tables (Task 8)
- [ ] No console errors
- [ ] No `entry.raw` references remaining in JS

**Step 3: Commit any fixes**

---

## Execution Notes

- All work is in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`
- **Plan C must be complete and re-exported** before executing this plan
- Tasks 1-3 (migration + bug fixes) should be done first — they fix existing issues
- Tasks 4-7 (new features) depend on Plan C's enriched data
- Task 8 (catalog) is independent of tasks 1-7
- Task 9 runs after everything else
