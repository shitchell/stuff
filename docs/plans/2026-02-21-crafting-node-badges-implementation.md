# Crafting Node Icon Badges — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add item-type icon badges to crafting graph nodes using Game Icons SVGs rendered via Cytoscape's native `background-image` node style.

**Architecture:** Download ~25 SVGs from [game-icons/icons](https://github.com/game-icons/icons) into `site/unturned/crafting/icons/`. Add a `TYPE_ICONS` mapping in `crafting.js` that maps item types to icon filenames. Set `iconUrl` on each node's data during graph element creation. Configure `background-image` in `buildCyStyle()` to display the icon inside each node. Add attribution for CC BY 3.0 license.

**Tech Stack:** Vanilla JS, Cytoscape.js, Game Icons (CC BY 3.0)

---

### Task 1: Download Game Icons SVGs

**Files:**
- Create: `site/unturned/crafting/icons/` directory with ~25 SVG files

**Step 1: Clone the Game Icons repo (shallow)**

```bash
git clone --depth 1 https://github.com/game-icons/icons.git /tmp/game-icons
```

**Step 2: Copy needed icons into the project**

```bash
mkdir -p site/unturned/crafting/icons

# Weapons
cp /tmp/game-icons/john-colburn/pistol-gun.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/broadsword.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/grenade.svg site/unturned/crafting/icons/

# Consumables
cp /tmp/game-icons/delapouite/meal.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/water-bottle.svg site/unturned/crafting/icons/
cp /tmp/game-icons/sbed/medical-pack.svg site/unturned/crafting/icons/

# Clothing
cp /tmp/game-icons/lucasms/shirt.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/trousers.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/billed-cap.svg site/unturned/crafting/icons/
cp /tmp/game-icons/skoll/kevlar-vest.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/knapsack.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/gas-mask.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/sunglasses.svg site/unturned/crafting/icons/

# Building
cp /tmp/game-icons/delapouite/brick-wall.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/house.svg site/unturned/crafting/icons/

# Vehicles & Magazines
cp /tmp/game-icons/delapouite/jeep.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/bullet-impacts.svg site/unturned/crafting/icons/

# Attachments
cp /tmp/game-icons/delapouite/crosshair.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/hand-grip.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/flashlight.svg site/unturned/crafting/icons/

# Tools & Utility
cp /tmp/game-icons/delapouite/swiss-army-knife.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/jerrycan.svg site/unturned/crafting/icons/
cp /tmp/game-icons/lorc/fishing-hook.svg site/unturned/crafting/icons/
cp /tmp/game-icons/delapouite/plant-seed.svg site/unturned/crafting/icons/

# Default
cp /tmp/game-icons/delapouite/perspective-dice-six-faces-six.svg site/unturned/crafting/icons/
```

**Step 3: Clean up**

```bash
rm -rf /tmp/game-icons
```

**Step 4: Verify icons are valid SVGs**

Open a few in the browser or check with `file site/unturned/crafting/icons/*.svg` — they should all be SVG XML.

**Step 5: Commit**

```bash
git add site/unturned/crafting/icons/
git commit -m "assets: add Game Icons SVGs for crafting node badges

Icons from game-icons.net (CC BY 3.0) by Lorc, Delapouite, Sbed,
John Colburn, Lucasms, and Skoll."
```

---

### Task 2: Add TYPE_ICONS mapping and set iconUrl on nodes

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`

**Step 1: Read crafting.js and find TYPE_SHAPES (around line 6)**

This is where item types are mapped to node shapes. Add a parallel `TYPE_ICONS` mapping nearby.

**Step 2: Add TYPE_ICONS mapping**

After `TYPE_SHAPES`, add:

```js
const TYPE_ICONS = {
    Gun: 'pistol-gun',
    Melee: 'broadsword',
    Throwable: 'grenade',
    Food: 'meal',
    Water: 'water-bottle',
    Medical: 'medical-pack',
    Shirt: 'shirt',
    Pants: 'trousers',
    Hat: 'billed-cap',
    Vest: 'kevlar-vest',
    Backpack: 'knapsack',
    Mask: 'gas-mask',
    Glasses: 'sunglasses',
    Barricade: 'brick-wall',
    Structure: 'house',
    Vehicle: 'jeep',
    Magazine: 'bullet-impacts',
    Sight: 'crosshair',
    Optic: 'crosshair',
    Barrel: 'crosshair',
    Grip: 'hand-grip',
    Tactical: 'flashlight',
    Fuel: 'jerrycan',
    Refill: 'jerrycan',
    Tool: 'swiss-army-knife',
    Fisher: 'fishing-hook',
    Farm: 'plant-seed',
};
const DEFAULT_ICON = 'perspective-dice-six-faces-six';
const ICON_BASE = 'icons/';
```

**Step 3: Set iconUrl on node data in buildGraphElements()**

Find where node data objects are created (around line 693-739 in `buildGraphElements()`). Add `iconUrl` to each node's data:

```js
// In the node data object:
iconUrl: ICON_BASE + (TYPE_ICONS[n.type] || DEFAULT_ICON) + '.svg',
```

**Step 4: Do the same in buildDiagramTree()**

Find where diagram nodes are created (around line 860+). Add the same `iconUrl` field to diagram node data objects. For recipe ghost nodes (small 16px nodes), set `iconUrl: ''` so they don't get icons.

**Step 5: Commit**

```bash
git add site/unturned/crafting/crafting.js
git commit -m "feat(unturned): add TYPE_ICONS mapping and iconUrl to node data"
```

---

### Task 3: Configure Cytoscape background-image style

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`

**Step 1: Read buildCyStyle() (around line 497)**

Find the base `node` selector style object.

**Step 2: Add background-image properties to the node style**

In the base `node` style, add these properties:

```js
'background-image': 'data(iconUrl)',
'background-width': '60%',
'background-height': '60%',
'background-opacity': 0.55,
'background-clip': 'node',
'background-image-crossorigin': 'anonymous',
```

**Step 3: Disable icons on special nodes**

For recipe ghost nodes (diagram mode), the icon should be hidden. Find the `node.diagram-recipe` or similar selector and override:

```js
'background-image': 'none',
```

Same for any other non-item node types (if any).

**Step 4: Verify manually**

Serve the site and check:
- Icons appear inside nodes
- Icons are subtle (not overpowering the border/rarity)
- Icons pan/zoom correctly with the graph
- Recipe ghost nodes have no icons
- Different item types show different icons

**Step 5: Commit**

```bash
git add site/unturned/crafting/crafting.js
git commit -m "feat(unturned): render item type icons inside crafting graph nodes"
```

---

### Task 4: Add Game Icons attribution

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/index.html`

**Step 1: Read the crafting page HTML**

Find the footer or bottom area of the page.

**Step 2: Add attribution**

Add a small attribution line (CC BY 3.0 requires it):

```html
<div class="attribution">
    Icons by <a href="https://game-icons.net" target="_blank">game-icons.net</a>
    under <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank">CC BY 3.0</a>
</div>
```

Style it small and unobtrusive (e.g., `font-size: 0.65rem; color: #666; text-align: center; margin-top: 8px;`).

**Step 3: Commit**

```bash
git add site/unturned/crafting/index.html
git commit -m "feat(unturned): add Game Icons attribution for CC BY 3.0"
```

---

### Task 5: Add icon toggle setting

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/crafting.js`
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/crafting/index.html`

**Context:** Users may prefer clean nodes without icons (especially on large graphs). Add a toggle.

**Step 1: Add checkbox to settings panel**

In `index.html`, find the settings/controls area (near other checkboxes like blueprint type filters). Add:

```html
<label><input type="checkbox" id="show-icons" checked> Show item icons</label>
```

**Step 2: Wire setting into getSettings()**

In `crafting.js`, find `getSettings()` and add:

```js
showIcons: document.getElementById('show-icons')?.checked ?? true,
```

**Step 3: Wire persistence in wireSettings() and onFiltersChanged()**

Follow the pattern of other checkbox settings (like `bpCraft`, `bpSalvage`). Persist to localStorage, restore on load.

**Step 4: Make background-image conditional**

In `buildCyStyle()`, the background-image should respect the setting:

```js
'background-image': settings.showIcons ? 'data(iconUrl)' : 'none',
```

Or alternatively, set `background-opacity: 0` when icons are disabled.

**Step 5: Verify toggle works**

- Icons visible when checked
- Icons hidden when unchecked
- Setting persists across page reload

**Step 6: Commit**

```bash
git add site/unturned/crafting/crafting.js site/unturned/crafting/index.html
git commit -m "feat(unturned): add toggle for item type icons on nodes"
```

---

### Task 6: Verify and test

**Step 1: Serve the site and manually verify**

- [ ] Icons appear on all node types (Gun, Food, Clothing, etc.)
- [ ] Different types show different icons
- [ ] Icons are subtle — rarity border/glow is still the primary visual
- [ ] Icons pan/zoom correctly
- [ ] Recipe ghost nodes (diagram mode) have no icons
- [ ] Toggle checkbox hides/shows icons
- [ ] Setting persists across reload
- [ ] No console errors
- [ ] Attribution visible on page

**Step 2: Run existing tests**

```bash
npx playwright test tests/catalog-custom-tables.spec.mjs
```

Expected: All pass (this feature doesn't touch catalog code).

**Step 3: Commit any fixes**

---

## Execution Notes

- All work is in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`
- Tasks 1-3 are the core implementation
- Task 4 is required for license compliance
- Task 5 is a UX nicety
- Task 6 is verification
- If any icon looks wrong, swap the SVG file in `icons/` and update `TYPE_ICONS`
