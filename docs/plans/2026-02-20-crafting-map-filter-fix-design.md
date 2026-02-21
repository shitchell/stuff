# Crafting Map Filter Fix — Design

## Problem

When multiple maps are selected on the crafting page (including "All Maps"), only A6 Polaris items appear. Base game recipes (Maple, Pine, Birch wood items, etc.) are missing.

**Root cause:** `computeMapBlacklist()` applies map blacklists sequentially. A6 Polaris has `allow_core_blueprints: false`, which strips all base recipes. When subsequent maps (PEI, Washington, etc.) are processed, the base recipes are already gone — and those maps have no blacklists to restore them.

## Solution

Change `computeMapBlacklist()` from sequential filtering to **per-map independent filtering with union merge**.

### Current flow (broken)

```
baseGraph
  → applyCraftingBlacklists(result, peiData)     → full base graph
  → applyCraftingBlacklists(result, a6Data)       → A6 only (base recipes gone)
  → applyCraftingBlacklists(result, washData)     → still A6 only (nothing to restore)
```

### New flow (fixed)

```
For each selected map, independently from baseGraph:
  PEI:       applyCraftingBlacklists(baseGraph, peiData, null)      → full base graph
  A6 Polaris: applyCraftingBlacklists(baseGraph, a6Data, a6Graph)   → A6-only graph
  Washington: applyCraftingBlacklists(baseGraph, washData, null)    → full base graph

Union merge: PEI ∪ A6 ∪ Washington → all base recipes + A6 recipes
```

## Scope

- **Change:** `computeMapBlacklist()` in `crafting.js` (~30 lines)
- **No change:** `applyCraftingBlacklists()` in `common.js` — already works correctly for a single map
- **No change:** UI, data loading, rendering pipeline

## Union merge logic

- **Edges:** collect all per-map edges, deduplicate by edge ID
- **Nodes:** collect all node IDs referenced by merged edges, build combined node pool from base + all map nodes, keep referenced ones
- **Blueprint groups & crafting categories:** rebuild from merged edges (reuse existing rebuild logic from `applyCraftingBlacklists`)

## Verification

- Select "All Maps" → search "Maple" → should show Maple items with recipes
- Select only A6 Polaris → should show only A6 recipes (no base game Maple, etc.)
- Select only PEI → should show full base recipes
- Select PEI + A6 → should show base recipes AND A6 recipes (union)
- No `[CRAFTING] Unresolved numeric ID` warnings in console

## Investigation notes

Only `crafting_blacklists` affects recipe filtering on the crafting page. Other map config fields (`spawn_resolution`, `config`, `level_asset`) do not participate in crafting graph filtering.
