# Crafting Viewer TODO

## Quick Fixes

### 1. Popup viewport clamping
The detail popup can overflow the viewport when it's long. Clamp its
position so it stays fully visible (check bottom and right edges, shift
up/left as needed).

### 2. Increase `x<N>` font size on diagram arrows
The quantity labels on directional arrows in diagram view are too small
to read comfortably. Bump the font 2-3x larger. Consider adding a
"Fonts" or "Text" config section with controls for different text
categories (node labels, edge labels, etc.).

## Features

### 3. Show workstation / crafting-tag requirements
Category tags like `RequiresNearbyCraftingTags` (e.g. "Cooking Table"
for Sandwich_Beef) are parsed in the data but not displayed in the
recipe/diagram view. These are crucial context for crafting. Show them
somewhere visible -- maybe as a badge or subtitle on the recipe card.

### 4. Legend
Add a togglable legend explaining colors, line styles, and symbols.
Controlled by a "Show legend" toggle in the basic config panel. When
visible, render as a semi-transparent overlay (~15% background opacity)
in a corner of the graph/diagram view.

### 5. Primitive materials summary (sticky footer)
For a given item's diagram, compute the full set of raw/primitive
materials needed and their total counts, recursively flattening the
crafting tree. Display as a sticky footer at the bottom of the diagram.

Example: Metal Rifle Rack needs 2x Metal Sheet + 2x Metal Bar +
Workbench. Expanding: 8x Metal Scrap + Blowtorch + Workbench.

**Open questions:**
- Heuristic for choosing between alternate recipes (e.g. Metal Bar from
  2x Metal Scrap vs. from Wire). Default to cheapest-primitives? Let
  user pick?
- How to handle tools (Blowtorch) that aren't consumed -- show them
  separately as "requires" vs "consumes"?
- What counts as a "primitive"? Items with no craft recipe? Or items
  that are loot/harvest only?

### 6. Recipe disambiguation ✓ (implemented)
Items with multiple blueprints (162 total) now support two display
modes via "Multi-Recipe" dropdown in the Display sidebar section:

**Ghost Nodes** (default): Intermediate recipe nodes inserted between
the target and its ingredients when 2+ blueprints exist. Labeled
"Recipe N" with optional `\n(Workstation)`. Small, dashed-border,
dimmer style. Applies at all tree depths.

**Carousel**: Big `◁`/`▷` arrow buttons on the left/right edges of
the diagram area with a "Recipe X of Y" indicator at top-center.
Only shows one recipe at a time for the root item. Sub-items show
all recipes flat. Wraps around at edges.

**Future (ties into #5):** Click a ghost node to select that recipe
branch, hiding others. Part of the "pick your path to primitives"
workflow. Clicking the "Cheapest" label in the primitives footer
should auto-select the cheapest path through all ghost nodes.

### 7. Noise reduction / item decomposition limits
Full recipe trees can be very noisy. Investigate ways to reduce
clutter:

- **Stop-list**: User-defined list of items that should not be
  further decomposed in diagrams (e.g. "Metal Scrap" — treat as
  primitive even though it technically has salvage sources).
- **Auto-detection**: Heuristic to identify "common base materials"
  that appear in many recipes and auto-collapse them.
- **Decomposition toggle per item**: Click a leaf node to
  expand/collapse its sub-recipes on demand (lazy expansion).
- **Hide salvage-only paths**: Option to exclude recipes where
  the only way to obtain an ingredient is via salvage (breaking
  down a rarer item into a common one is rarely the intended path).

**Open questions:**
- Where does the stop-list live? localStorage? A config panel?
- Should the default stop-list be auto-generated from the data
  (e.g. items with no craft recipe, or items appearing as
  ingredients in 10+ recipes)?
- How does this interact with Recipe Depth? Depth limits the tree
  globally; a stop-list limits specific branches.

### 8. Favorites / starred items
Add a star outline (CSS, hidden by default, visible on hover) to the
left of each item in the sidebar item list. Clicking the star fills
it in and "favorites" the item (persisted to localStorage).

Favorited items are pinned to the top of the list, but only when
they pass the current search/category filters. E.g. a favorited
"Water Tank" does not appear at the top when the search filter
"rifle" is active.

Sort order: favorites first (alphabetical), then non-favorites
(alphabetical).
