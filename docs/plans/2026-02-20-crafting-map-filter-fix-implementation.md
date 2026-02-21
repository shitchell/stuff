# Crafting Map Filter Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the crafting page so "All Maps" shows the union of recipes available across all selected maps, not just the last restrictive map's recipes.

**Architecture:** Replace the sequential blacklist application in `computeMapBlacklist()` with per-map independent filtering plus union merge. `applyCraftingBlacklists()` is unchanged — it already works correctly for a single map.

**Tech Stack:** Vanilla JS (browser)

**Design doc:** `docs/plans/2026-02-20-crafting-map-filter-fix-design.md`

---

### Task 1: Rewrite `computeMapBlacklist()` to use per-map union

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js:1421-1499`

**Step 1: Read the current function**

Read `crafting.js` lines 1421-1499 to confirm the current `computeMapBlacklist()` implementation.

**Step 2: Replace the function**

Replace the body of `computeMapBlacklist()` (lines 1421-1499) with:

```js
async function computeMapBlacklist(activeMaps) {
    console.log('[MAP-FILTER] computeMapBlacklist called, activeMaps:', activeMaps);

    if (!activeMaps || activeMaps.length === 0) {
        console.log('[MAP-FILTER] No active maps, clearing map filter state');
        mapFilteredGraph = null;
        mapFilteredNodeMap = null;
        mapFilteredEdgesByTarget = null;
        mapFilteredEdgesBySource = null;
        return;
    }

    const baseGraph = {
        nodes: rawData.nodes,
        edges: rawData.edges,
        blueprintGroups,
        craftingCategories: craftingCategoryList,
    };
    console.log('[MAP-FILTER] Base graph:', baseGraph.nodes.length, 'nodes,', baseGraph.edges.length, 'edges');

    // Filter each map independently from the base graph, then union the results
    const perMapEdges = [];
    const perMapNodes = [];

    for (const mapName of activeMaps) {
        const mapData = await dataLoader.getMapData(mapName);
        console.log('[MAP-FILTER] Loaded map data for', mapName, ':', mapData ? 'OK' : 'FAILED');
        if (!mapData) continue;

        // Maps with no blacklists pass the full base graph through unchanged
        if (!mapData.map?.crafting_blacklists || mapData.map.crafting_blacklists.length === 0) {
            console.log('[MAP-FILTER] No crafting_blacklists for', mapName, ', including full base graph');
            perMapEdges.push(baseGraph.edges);
            perMapNodes.push(baseGraph.nodes);
            continue;
        }

        // Build map-specific graph if the map has custom entries
        let mapGraph = null;
        if (mapData.entries && mapData.entries.length > 0) {
            const guidIndex = await dataLoader.getGuidIndex();
            mapGraph = buildCraftingGraph(mapData.entries, guidIndex, mapData.assets || {}, `map-${mapName}-bp`);
            console.log('[MAP-FILTER] Built map graph for', mapName, ':', mapGraph.nodes.length, 'nodes,', mapGraph.edges.length, 'edges');
        }

        // Apply this map's blacklist independently against the base graph
        const filtered = applyCraftingBlacklists(baseGraph, mapData, mapGraph);
        console.log('[MAP-FILTER] After applyCraftingBlacklists for', mapName, ':', filtered.nodes.length, 'nodes,', filtered.edges.length, 'edges');
        perMapEdges.push(filtered.edges);
        perMapNodes.push(filtered.nodes);
    }

    // Union merge: deduplicate edges by ID, collect all referenced nodes
    const seenEdgeIds = new Set();
    const mergedEdges = [];
    for (const edges of perMapEdges) {
        for (const e of edges) {
            const edgeId = e.id || `${e.source}-${e.blueprintId}-${e.target}`;
            if (!seenEdgeIds.has(edgeId)) {
                seenEdgeIds.add(edgeId);
                mergedEdges.push(e);
            }
        }
    }

    // Build combined node pool, then keep only referenced nodes
    const nodeById = {};
    for (const nodes of perMapNodes) {
        for (const n of nodes) {
            if (!nodeById[n.id]) nodeById[n.id] = n;
        }
    }
    const referencedIds = new Set();
    for (const e of mergedEdges) {
        referencedIds.add(e.source);
        referencedIds.add(e.target);
    }
    const mergedNodes = [];
    for (const id of referencedIds) {
        if (nodeById[id]) mergedNodes.push(nodeById[id]);
    }

    // Rebuild blueprint groups and crafting categories
    const mergedBlueprintGroups = {};
    const mergedCategories = new Set();
    for (const e of mergedEdges) {
        if (!mergedBlueprintGroups[e.blueprintId]) mergedBlueprintGroups[e.blueprintId] = [];
        mergedBlueprintGroups[e.blueprintId].push(e);
        if (e.craftingCategory) mergedCategories.add(e.craftingCategory);
    }

    const currentGraph = {
        nodes: mergedNodes,
        edges: mergedEdges,
        blueprintGroups: mergedBlueprintGroups,
        craftingCategories: [...mergedCategories].sort(),
    };

    // Store the filtered result
    mapFilteredGraph = currentGraph;
    mapFilteredNodeMap = {};
    mapFilteredEdgesByTarget = {};
    mapFilteredEdgesBySource = {};
    for (const n of currentGraph.nodes) {
        mapFilteredNodeMap[n.id] = n;
    }
    for (const e of currentGraph.edges) {
        if (!mapFilteredEdgesByTarget[e.target]) mapFilteredEdgesByTarget[e.target] = [];
        mapFilteredEdgesByTarget[e.target].push(e);
        if (!mapFilteredEdgesBySource[e.source]) mapFilteredEdgesBySource[e.source] = [];
        mapFilteredEdgesBySource[e.source].push(e);
    }
    console.log('[MAP-FILTER] Final union graph stored:', currentGraph.nodes.length, 'nodes,', currentGraph.edges.length, 'edges');

    // Ensure map-specific nodes are included in selectedItems so they appear in the graph
    if (selectedItems) {
        let added = 0;
        for (const n of currentGraph.nodes) {
            if (!selectedItems.has(n.id)) {
                selectedItems.add(n.id);
                added++;
            }
        }
        if (added > 0) {
            console.log('[MAP-FILTER] Added', added, 'new map-specific nodes to selectedItems');
            saveSelectedItems();
        }
    }
}
```

**Step 3: Verify existing tests still pass**

Run: `cd /home/guy/code/git/github.com/shitchell/stuff && npx playwright test tests/catalog-custom-tables.spec.mjs`

Expected: All 5 pass (these test the catalog, not crafting, but confirm no regressions).

**Step 4: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/crafting/crafting.js
git commit -m "fix(unturned): use per-map union for crafting map filter"
```

---

### Task 2: Manual verification

**Step 1: Serve the site locally**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff/site
python3 -m http.server 8080
```

**Step 2: Test the crafting page**

Open `http://localhost:8080/unturned/crafting/` in a browser.

Verify:
- [ ] Select "All Maps" → search "Maple" → should show Maple items with recipes
- [ ] Select only A6 Polaris → should show only A6 recipes (no base game Maple)
- [ ] Select only PEI → should show full base recipes including Maple
- [ ] Select PEI + A6 → should show base recipes AND A6 recipes (union)
- [ ] Check browser console for any `[CRAFTING] Unresolved numeric ID` warnings (should be zero)
- [ ] Check that Snowberry Jam Sandwich recipe displays correctly with A6 selected

**Step 3: Fix any issues found**

If any verification fails, debug and fix.

**Step 4: Final commit if fixes were needed**

---

## Execution Notes

- This is entirely in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`
- Only one file changes: `site/unturned/crafting/crafting.js`
- `applyCraftingBlacklists()` in `common.js` is NOT modified
