# Complete Export — Design

## Problem

The Unturned data export pipeline captures basic item metadata (guid, type, name, rarity, size) and partial blueprint data, but drops most type-specific fields and several blueprint-level fields. Out of 61 item types and hundreds of type-specific properties defined by the game, only a handful are extracted into structured models. The rest exist only in the `raw` dict — an untyped, undocumented pass-through of the full .dat file contents. The Actions system (177+ items with cross-item recipe links) isn't parsed at all.

This means:
- The catalog page can't show type-specific columns (damage, range, firerate, armor, etc.) from structured data
- The crafting page can't filter by blueprint conditions, display skill requirements, or distinguish skin-swap recipes from real crafting
- Consumers must dig into `raw` with fragile string-key lookups and no validation
- Schema drift in the game data goes undetected — fields silently disappear or change type

## Solution

Replace `raw` pass-through with comprehensive typed Pydantic models for all 61 item types, enriched blueprint models, and a new Actions model. The export becomes the structured models only — no `raw` by default. A warning system flags any .dat fields not accounted for by the models.

### Design Philosophy

> Export stays raw/faithful to game data. Interpretation happens in JS.

This still holds, but "faithful" now means "fully structured and typed" rather than "dumped as a dict." Every field the game defines gets a corresponding Pydantic field with proper types and defaults. The structured export IS the faithful representation.

## Entry Structure

```python
class BundleEntry(BaseModel):
    # Identity
    guid: str
    type: str                      # "Gun", "Food", "Barricade", etc.
    id: int
    name: str
    description: str = ""
    rarity: str = ""

    # Common ItemAsset fields
    size_x: int = 0
    size_y: int = 0
    useable: str = ""
    slot: str = ""                 # NONE, PRIMARY, SECONDARY, TERTIARY, ANY
    can_use_underwater: bool = True
    equipable_movement_speed_multiplier: float = 1.0
    should_drop_on_death: bool = True
    # ... other common fields from ItemAsset base class ...

    # Structured systems
    blueprints: list[Blueprint] = []
    actions: list[Action] = []

    # Type-specific properties (polymorphic by type)
    properties: dict = {}          # Serialized from typed model per entry.type

    # Debugging only (opt-in via --include-raw)
    raw: dict = {}                 # Excluded from export by default
```

### JSON Output Shape

```json
{
  "guid": "abc123...",
  "type": "Gun",
  "id": 1,
  "name": "Eaglefire",
  "rarity": "Rare",
  "size_x": 4,
  "size_y": 2,
  "useable": "Gun",
  "slot": "PRIMARY",
  "blueprints": [
    {
      "name": "Craft",
      "inputs": ["guid1 x 7", "guid2"],
      "outputs": ["this"],
      "skill": "Craft",
      "skill_level": 2,
      "workstation_tags": ["guid3"],
      "build": "",
      "state_transfer": false,
      "conditions": [],
      "rewards": []
    }
  ],
  "actions": [],
  "properties": {
    "firerate": 8,
    "range": 200.0,
    "action": "Semi",
    "damage_player": 40.0,
    "damage_zombie": 99.0,
    "spread_hip": 0.04,
    "recoil_min_x": -2.0,
    "recoil_max_x": 2.0
  }
}
```

Conventions:
- `properties` keys are **snake_case**, matching Pydantic field names
- `properties` is **flat** (no nesting within) — maps cleanly to catalog columns and future JS type models
- `type` is the discriminator for which typed model produced `properties`
- Only one `properties` shape per `type` value

## Blueprint Model (enriched)

```python
class BlueprintCondition(BaseModel):
    type: str = ""          # "Holiday", "Flag_Short", "Flag_Bool", etc.
    id: str = ""            # Flag ID or reference
    value: Any = None       # Condition value
    logic: str = ""         # "Equal", "Not_Equal", etc.

class BlueprintReward(BaseModel):
    type: str = ""          # "Flag_Short", "Experience", "Quest", etc.
    id: str = ""            # Reward target ID
    value: Any = None       # Reward value
    modification: str = ""  # "Increment", "Assign", etc.

class Blueprint(BaseModel):
    # Existing fields
    name: str = ""                         # Craft, Repair, Salvage
    inputs: list[BlueprintItem] = []
    outputs: list[BlueprintItem] = []
    skill: str = ""
    skill_level: int = 0
    workstation_tags: list[str] = []
    category_tag: str = ""
    operation: str = ""

    # New fields
    build: str = ""                        # Workstation item ID/GUID
    level: int = 0                         # Required player level
    map: str = ""                          # Map-specific availability
    state_transfer: bool = False           # Skin-swap / state preservation
    tool_critical: bool = False            # Whether the tool is consumed
    conditions: list[BlueprintCondition] = []
    rewards: list[BlueprintReward] = []
```

## Action Model

```python
class Action(BaseModel):
    type: str = ""                         # "Blueprint" (only known value)
    source: str = ""                       # Numeric item ID of referenced item
    blueprint_indices: list[int] = []      # Which blueprint(s) on the source item
    key: str = ""                          # "Salvage", "Craft_Seed", "Stack", etc.
    text: str = ""                         # Custom display text (optional)
    tooltip: str = ""                      # Custom tooltip (optional)
```

## Type-Specific Properties

### Hierarchy

Mirrors the game's class inheritance:

```
ItemProperties (base — common weapon/damage fields if applicable)
├── WeaponProperties
│   ├── GunProperties
│   ├── MeleeProperties
│   └── ThrowableProperties
├── ConsumableProperties (shared by Food, Medical, Water)
├── ClothingProperties
│   ├── BagProperties (Backpack, Pants, Shirt, Vest)
│   └── GearProperties (Hat, Mask, Glasses)
├── AttachmentProperties
│   ├── SightProperties
│   ├── BarrelProperties
│   ├── GripProperties
│   ├── TacticalProperties
│   └── MagazineProperties
├── BarricadeProperties
│   ├── StorageProperties (→ SentryProperties)
│   ├── FarmProperties
│   ├── GeneratorProperties
│   ├── TrapProperties
│   ├── BeaconProperties
│   └── TankProperties
├── StructureProperties
└── ... (remaining simple types: Cloud, Map, Key, Fisher, Fuel, etc.)
```

### Examples

```python
class GunProperties(BaseModel):
    # Fire mechanics
    firerate: int = 0
    action: str = ""                    # Trigger, Bolt, Pump, Rail, etc.
    safety: bool = True
    semi: bool = True
    auto: bool = False
    bursts: int = 0

    # Damage (per target type)
    damage_player: float = 0
    damage_zombie: float = 0
    damage_animal: float = 0
    damage_barricade: float = 0
    damage_structure: float = 0
    damage_vehicle: float = 0
    damage_resource: float = 0
    damage_object: float = 0

    # Accuracy
    spread_hip: float = 0
    spread_aim: float = 0
    range: float = 0

    # Recoil
    recoil_min_x: float = 0
    recoil_max_x: float = 0
    recoil_min_y: float = 0
    recoil_max_y: float = 0

    # Magazine system
    ammo_min: int = 0
    ammo_max: int = 0
    default_magazine: int = 0
    # ... etc.


class ConsumableProperties(BaseModel):
    """Shared by Food, Medical, Water types."""
    health: int = 0
    food: int = 0
    water: int = 0
    virus: int = 0
    energy: int = 0
    disinfectant: int = 0
    oxygen: int = 0
    warmth: int = 0
    experience: int = 0
    vision: int = 0
    bleeding_modifier: str = ""         # None, Heal, Cut
    bones_modifier: str = ""            # None, Heal, Break
    aid: bool = False


class SightProperties(BaseModel):
    vision: str = ""                    # NONE, MILITARY, CIVILIAN
    zoom: float = 0
    holographic: bool = False
    nightvision_color: str = ""
    nightvision_fog_intensity: float = 0


class FarmProperties(BaseModel):
    growth: int = 0                     # Growth time
    grow: int = 0                       # Harvest item ID
    allow_fertilizer: bool = True
    harvest_reward_experience: int = 0
```

All 61 types get models. Types with no additional fields beyond the base class get an empty model (still registered in `TYPE_REGISTRY` so the warning system knows they're intentionally empty).

### Reference Source

Field names, types, and defaults are drawn from the wiki schema at `~/code/git/github.com/unturned-info/unturned-3-knowledgebase/data/ItemData.yml`. The Pydantic models are the source of truth for our pipeline; the YAML is the reference guide.

## Warning System

### How It Works

After extracting structured fields from the .dat dict, the pipeline diffs what was consumed vs what's in the original dict. Three categories:

1. **Handled** — field was extracted into a model field
2. **Ignored** — field is in the per-type ignore list (engine internals: effect GUIDs, mesh overrides, sound references, etc.)
3. **Uncovered** — field exists in the .dat file but isn't handled or ignored

### Default Behavior

```
WARNING: 3 uncovered fields in Gun entry "Eaglefire" (abc123):
  Muzzle, Shell, Shoot_Quest_Reward_0_Type
  → Update unturned_data/models/properties/weapons.py
```

Warnings are grouped by type and deduplicated (if 200 Guns all miss the same 3 fields, you see one warning with the count).

### CLI Flags

| Flag | Behavior |
|------|----------|
| (default) | Structured export only. Warnings for uncovered fields on stderr. |
| `--include-raw` | Adds `raw` dict to JSON output for debugging. |
| `--strict` | Uncovered fields → fatal error (non-zero exit). |
| `--show-ignored` | Prints intentionally-ignored fields to stdout. No JSON change. |

### Ignore Lists

Per-type lists of field name patterns to suppress warnings for:

```python
GLOBAL_IGNORE = {
    "GUID", "ID", "Type",       # Already extracted as top-level fields
}

GUN_IGNORE = {
    "Muzzle",                    # Effect GUID — engine visual only
    "Shell",                     # Effect GUID — engine visual only
    "Explosion",                 # Effect GUID
    r"Shoot_Quest_Reward_\d+_.*",  # Quest reward system (pattern match)
}
```

Patterns support regex for indexed fields.

## File Organization

```
unturned_data/
├── models/
│   ├── __init__.py              # Re-exports BundleEntry, Blueprint, Action
│   ├── entry.py                 # BundleEntry
│   ├── blueprint.py             # Blueprint, BlueprintCondition, BlueprintReward
│   ├── action.py                # Action
│   └── properties/
│       ├── __init__.py          # TYPE_REGISTRY: Type → Properties class
│       ├── base.py              # ItemProperties (shared base)
│       ├── weapons.py           # GunProperties, MeleeProperties, ThrowableProperties
│       ├── consumables.py       # ConsumableProperties
│       ├── clothing.py          # ClothingProperties + subtypes
│       ├── attachments.py       # Sight, Barrel, Grip, Tactical, Magazine
│       ├── barricades.py        # Storage, Farm, Generator, Trap, Beacon, Tank
│       ├── structures.py        # StructureProperties
│       └── misc.py              # Remaining types
├── categories/
│   └── ...                      # Updated to use new models
├── warnings.py                  # Uncovered field detection + reporting
└── exporter.py                  # Updated: no raw by default, new flags
```

## JS Impact (Plan D scope, not this plan)

Minimal breaking changes from removing `raw`:
- `entry.raw.Useable` (2 references in `common.js`) → `entry.useable` (now a base field)
- Catalog column auto-detection: needs to walk `entry.properties.*` for type-specific columns
- Everything else is additive (displaying new data that wasn't available before)

## Scope

**This plan (Plan C):** All Python-side work in `unturned-data` repo.
- Enriched Blueprint model with conditions, rewards, state_transfer, build, etc.
- New Action model and parser
- Typed Properties models for all 61 item types
- Warning system with --strict, --include-raw, --show-ignored
- Remove raw from default export
- Tests for all new models

**Separate plan (Plan D):** All JS-side work in `stuff` repo.
- Actions resolution in buildCraftingGraph
- Blueprint conditions/skill display in tooltips
- State_Transfer filtering
- Catalog integration with properties.* nesting
- Any new UI features enabled by richer data

## Dependencies

- Plan A (exporter fixes) should land first — it fixes Output_ key parsing, Tool→Salvage reclassification, and other blueprint parsing issues that this plan builds on
- Plan B (crafting UI fixes) ✅ complete — tooltip filtering and dedup are in place
