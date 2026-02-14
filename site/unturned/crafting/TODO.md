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
