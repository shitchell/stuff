# Crafting Node Icon Badges — Design

**Goal:** Add item-type icon badges to crafting graph nodes using Game Icons SVGs rendered via Cytoscape's native `background-image` node style.

## Approach

Use Cytoscape's `background-image` node style property. Icons are rendered as part of the node itself, automatically panning/zooming with the graph. No HTML overlay layers or event synchronization needed.

## Icon Source

Download ~25 SVGs from [game-icons/icons](https://github.com/game-icons/icons) (CC BY 3.0) into `site/unturned/crafting/icons/`. White foreground on transparent background.

## Category-to-Icon Mapping

| Type | Icon file | Type | Icon file |
|------|-----------|------|-----------|
| Gun | `pistol-gun` | Barricade | `brick-wall` |
| Melee | `broadsword` | Structure | `house` |
| Throwable | `grenade` | Vehicle | `jeep` |
| Food | `meal` | Magazine | `bullet-impacts` |
| Water | `water-bottle` | Sight/Optic | `crosshair` |
| Medical | `medical-pack` | Tool | `swiss-army-knife` |
| Shirt | `shirt` | Fuel/Refill | `jerrycan` |
| Pants | `trousers` | Fisher | `fishing-hook` |
| Hat | `peaked-cap` | Farm | `plant-seed` |
| Vest | `kevlar-vest` | Barrel (attachment) | `silenced` |
| Backpack | `knapsack` | Grip | `grip` |
| Mask | `gas-mask` | Glasses | `sunglasses` |
| Tactical | `flashlight` | *Default* | `perspective-dice-six` |

## Visual Treatment

- Icon fills ~60% of node area, centered
- White fill, 0.5-0.6 opacity (subtle, not overpowering)
- Rarity border + glow remain the primary visual signal
- Node shape still communicates broad category (diamond=weapon, ellipse=consumable, etc.)
- Icons add specificity within those broad categories

## Cytoscape Style

```javascript
// In buildCyStyle(), node selector:
'background-image': 'data(iconUrl)',
'background-width': '60%',
'background-height': '60%',
'background-opacity': 0.55,
'background-clip': 'node',
```

## What Changes

- **New**: `site/unturned/crafting/icons/` — ~25 SVG files (~2-5KB each)
- **Modified**: `crafting.js` — `background-image` in `buildCyStyle()` node style
- **Modified**: `crafting.js` or `common.js` — `TYPE_ICONS` mapping, `iconUrl` on node data

## What Doesn't Change

- Node shapes (still type-based via TYPE_SHAPES)
- Border colors (still rarity-based)
- Node sizes (still fixed/connectivity modes)
- Edge styling, tooltip behavior

## Attribution

Game Icons by [game-icons.net](https://game-icons.net/) — CC BY 3.0. Attribution in page footer or credits.
