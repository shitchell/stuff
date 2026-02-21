# Complete Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the untyped `raw` pass-through with comprehensive typed Pydantic models for all 61 item types, enriched blueprints with conditions/rewards, a new Actions parser, and a warning system that flags uncovered .dat fields.

**Architecture:** BundleEntry gains common ItemAsset base fields (useable, slot, etc.), a `properties: dict` field populated by per-type Properties models, and an `actions: list[Action]` field. The `parsed` computed field and subclass-per-type pattern (Gun, Clothing, etc.) are replaced by a single BundleEntry class with polymorphic properties dispatch. A warning system diffs consumed vs available .dat keys to catch schema drift.

**Tech Stack:** Python 3.10+, Pydantic v2

**Repo:** `/home/guy/code/git/github.com/shitchell/unturned-data/`
**Branch:** `feat/complete-export` (create from `main`)

---

## Task 1: Create `models/` package and migrate existing models

**Goal:** Move `models.py` into a `models/` package without changing any behavior. All existing imports continue to work.

### Files to create/modify

- **Create** `unturned_data/models/__init__.py`
- **Create** `unturned_data/models/entry.py`
- **Create** `unturned_data/models/blueprint.py`
- **Move** `unturned_data/models.py` content into the new files
- **Delete** `unturned_data/models.py` (after migration)

### Steps

1. Create the `unturned_data/models/` directory.

2. Create `unturned_data/models/blueprint.py` with:
   - `Blueprint`, `BlueprintCondition`, `BlueprintReward` classes
   - `_parse_items()`, `_parse_string_list()` helpers
   - All blueprint formatting helpers (`_resolve_guid`, `_format_single_input`, `format_blueprint_ingredients`, `format_blueprint_workstations`, `_SKIP_BLUEPRINT_NAMES`, `_GUID_X_RE`, `_BARE_GUID_RE`)

3. Create `unturned_data/models/entry.py` with:
   - `DamageStats`, `ConsumableStats`, `StorageStats`
   - `BundleEntry`
   - `SpawnTableEntry`, `SpawnTable`
   - `CraftingBlacklist`
   - Import `Blueprint` from `.blueprint`

4. Create `unturned_data/models/__init__.py` that re-exports everything:
   ```python
   from unturned_data.models.entry import (
       BundleEntry, CraftingBlacklist, ConsumableStats,
       DamageStats, SpawnTable, SpawnTableEntry, StorageStats,
   )
   from unturned_data.models.blueprint import (
       Blueprint, BlueprintCondition, BlueprintReward,
       format_blueprint_ingredients, format_blueprint_workstations,
   )
   ```

5. Delete `unturned_data/models.py`.

6. Verify all existing imports work by running the full test suite.

### Test command

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
python -m pytest unturned_data/tests/ -v
```

All existing tests must pass with zero changes to test files.

### Commit message

```
refactor: restructure models.py into models/ package

Move models into models/entry.py and models/blueprint.py with
re-exports from models/__init__.py. No behavioral changes.
```

---

## Task 2: Enrich Blueprint model with conditions, rewards, and new fields

**Goal:** Add `BlueprintCondition`, `BlueprintReward`, and new fields (`state_transfer`, `tool_critical`, `level`, `map`, `conditions`, `rewards`) to the Blueprint model. Parse them from both modern and legacy formats.

### Files to modify

- `unturned_data/models/blueprint.py`
- **Create** `unturned_data/tests/fixtures/legacy_blueprint_conditions/` (fixture with conditions)
- `unturned_data/tests/test_models.py`

### Steps

1. Add `BlueprintCondition` model to `blueprint.py`:
   ```python
   class BlueprintCondition(BaseModel):
       type: str = ""
       value: Any = None
       logic: str = ""
       id: str = ""
   ```

2. Add `BlueprintReward` model to `blueprint.py`:
   ```python
   class BlueprintReward(BaseModel):
       type: str = ""
       id: str = ""
       value: Any = None
       modification: str = ""
   ```

3. Add new fields to `Blueprint`:
   ```python
   class Blueprint(BaseModel):
       # ... existing fields ...
       level: int = 0
       map: str = ""
       state_transfer: bool = False
       tool_critical: bool = False
       conditions: list[BlueprintCondition] = []
       rewards: list[BlueprintReward] = []
   ```

4. Update modern blueprint parsing in `list_from_raw()` to extract the new fields from modern format dicts:
   ```python
   # In the modern format branch:
   state_transfer=bool(bp_raw.get("State_Transfer", False)),
   conditions=_parse_conditions(bp_raw),
   rewards=_parse_rewards(bp_raw),
   ```

5. Update `_parse_legacy_blueprints()` to extract:
   - `Blueprint_{i}_State_Transfer` (flag -> bool)
   - `Blueprint_{i}_Tool_Critical` (flag -> bool)
   - `Blueprint_{i}_Level` (already parsed as skill_level, keep that)
   - `Blueprint_{i}_Map` (string)
   - `Blueprint_{i}_Condition_{j}_Type`, `Blueprint_{i}_Condition_{j}_Value`, `Blueprint_{i}_Condition_{j}_Logic` -> `conditions` list
   - `Blueprint_{i}_Reward_{j}_Type`, `Blueprint_{i}_Reward_{j}_Value`, `Blueprint_{i}_Reward_{j}_ID`, `Blueprint_{i}_Reward_{j}_Modification` -> `rewards` list

6. Add helper functions `_parse_legacy_conditions(raw, prefix)` and `_parse_legacy_rewards(raw, prefix)`.

7. Create test fixture `legacy_blueprint_conditions/` with a .dat file modeled on the Barbedwire_Ornamental pattern:
   ```
   GUID 00000000000000000000000000000001
   Type Trap
   ID 99901
   Blueprints 1
   Blueprint_0_Type Barricade
   Blueprint_0_Supply_0_ID 65
   Blueprint_0_Supply_0_Amount 2
   Blueprint_0_Build 27
   Blueprint_0_Conditions 1
   Blueprint_0_Condition_0_Type Holiday
   Blueprint_0_Condition_0_Value Christmas
   ```

8. Write tests in `test_models.py`:
   - `test_legacy_blueprint_conditions` — parses conditions from fixture
   - `test_legacy_blueprint_state_transfer` — flag correctly parsed as True
   - `test_legacy_blueprint_tool_critical` — flag correctly parsed as True
   - `test_legacy_blueprint_map` — string field parsed
   - `test_legacy_blueprint_rewards` — reward entries parsed
   - `test_blueprint_condition_serializes` — model_dump produces expected dict
   - `test_blueprint_reward_serializes` — model_dump produces expected dict

### Test command

```bash
python -m pytest unturned_data/tests/test_models.py -v -k "blueprint"
```

### Commit message

```
feat: enrich Blueprint with conditions, rewards, and state_transfer

Parse BlueprintCondition and BlueprintReward from both modern and
legacy .dat formats. Add state_transfer, tool_critical, level, map
fields to Blueprint model.
```

---

## Task 3: Add Action model and parser

**Goal:** Parse `Action_N_*` fields from .dat files into a structured `Action` model.

### Files to create/modify

- **Create** `unturned_data/models/action.py`
- Update `unturned_data/models/__init__.py` (re-export Action)
- Update `unturned_data/models/entry.py` (add `actions` field to BundleEntry)
- **Create** `unturned_data/tests/fixtures/action_stack_sheet/` (fixture)
- Update `unturned_data/tests/test_models.py`

### Steps

1. Create `unturned_data/models/action.py`:
   ```python
   from __future__ import annotations
   from typing import Any
   from pydantic import BaseModel

   class Action(BaseModel):
       type: str = ""
       source: str = ""
       blueprint_indices: list[int] = []
       key: str = ""
       text: str = ""
       tooltip: str = ""

       @staticmethod
       def list_from_raw(raw: dict[str, Any]) -> list[Action]:
           """Parse Action_N_* fields from a parsed .dat dict."""
           count = raw.get("Actions")
           if not count or not isinstance(count, int):
               return []

           results: list[Action] = []
           for i in range(count):
               prefix = f"Action_{i}_"
               action_type = str(raw.get(f"{prefix}Type", ""))
               source = str(raw.get(f"{prefix}Source", ""))

               # Parse blueprint indices
               bp_count = raw.get(f"{prefix}Blueprints", 0)
               indices: list[int] = []
               if isinstance(bp_count, int):
                   for j in range(bp_count):
                       idx = raw.get(f"{prefix}Blueprint_{j}_Index")
                       if idx is not None:
                           indices.append(int(idx))

               key = str(raw.get(f"{prefix}Key", ""))
               text = str(raw.get(f"{prefix}Text", ""))
               tooltip = str(raw.get(f"{prefix}Tooltip", ""))

               results.append(Action(
                   type=action_type,
                   source=source,
                   blueprint_indices=indices,
                   key=key,
                   text=text,
                   tooltip=tooltip,
               ))
           return results
   ```

2. Update `unturned_data/models/__init__.py` to re-export `Action`.

3. Add `actions: list[Action] = []` field to `BundleEntry` in `entry.py`.

4. Update `BundleEntry.from_raw()` to parse actions:
   ```python
   actions=Action.list_from_raw(raw),
   ```

5. Create fixture `action_stack_sheet/` with `Stack_Sheet.dat` and `English.dat` modeled on the real Stack_Sheet data (simplified):
   ```
   # Stack_Sheet.dat
   GUID eb3dcd948171403e9d9c55f7e2d30a03
   Type Barricade
   Rarity Uncommon
   Useable Barricade
   Build Barricade
   ID 1910
   Size_X 3
   Size_Y 2
   Health 300
   Range 4
   Blueprints 2
   Actions 1
   Action_0_Type Blueprint
   Action_0_Source 1910
   Action_0_Blueprints 1
   Action_0_Blueprint_0_Index 1
   Action_0_Key Unstack
   ```

6. Write tests:
   - `TestAction.test_parse_from_fixture` — loads fixture, verifies action fields
   - `TestAction.test_parse_type` — action.type == "Blueprint"
   - `TestAction.test_parse_source` — action.source == "1910"
   - `TestAction.test_parse_blueprint_indices` — [1]
   - `TestAction.test_parse_key` — action.key == "Unstack"
   - `TestAction.test_no_actions_returns_empty` — item without Actions returns []
   - `TestAction.test_actions_in_bundle_entry` — BundleEntry.from_raw includes actions
   - `TestAction.test_action_serializes` — model_dump produces expected dict

### Test command

```bash
python -m pytest unturned_data/tests/test_models.py -v -k "action or Action"
```

### Commit message

```
feat: add Action model and parser for Action_N_* fields

Parse Action fields from .dat files into structured Action objects
with type, source, blueprint_indices, key, text, and tooltip.
```

---

## Task 4: Add common ItemAsset fields to BundleEntry

**Goal:** Extract commonly useful ItemAsset base fields into BundleEntry so they appear at the top level of the JSON export (not buried in properties).

### Files to modify

- `unturned_data/models/entry.py`
- `unturned_data/tests/test_models.py`

### Steps

1. Add these fields to `BundleEntry`:
   ```python
   useable: str = ""
   slot: str = ""
   can_use_underwater: bool = True
   equipable_movement_speed_multiplier: float = 1.0
   should_drop_on_death: bool = True
   allow_manual_drop: bool = True
   ```

2. Update `BundleEntry.from_raw()` to extract them:
   ```python
   useable=str(raw.get("Useable", "")),
   slot=str(raw.get("Slot", "")),
   can_use_underwater=bool(raw.get("Can_Use_Underwater", True)),
   equipable_movement_speed_multiplier=float(raw.get("Equipable_Movement_Speed_Multiplier", 1.0)),
   should_drop_on_death=bool(raw.get("Should_Drop_On_Death", True)),
   allow_manual_drop=bool(raw.get("Allow_Manual_Drop", True)),
   ```

3. Update `SCHEMA_C_FIELDS` in `exporter.py` to include the new fields:
   ```python
   "useable", "slot", "can_use_underwater",
   "equipable_movement_speed_multiplier",
   "should_drop_on_death", "allow_manual_drop",
   "actions",
   ```

4. Write tests:
   - `test_base_fields_gun` — gun fixture has useable="Gun", slot="Primary"
   - `test_base_fields_food` — food fixture has useable="Consumeable"
   - `test_base_fields_defaults` — minimal entry has correct defaults
   - `test_base_fields_in_schema_c` — model_dump(include=SCHEMA_C_FIELDS) includes new fields

5. Remove the `slot` field from `Gun`, `MeleeWeapon` category models in `categories/items.py` since it's now on the base class. Update their `from_raw()` methods to stop extracting it. Update their `parsed` computed fields to remove it.

6. Run full test suite. Some existing tests may need updates where they check `parsed` keys (e.g., `test_gun_parsed_keys` expects "slot" in parsed).

### Test command

```bash
python -m pytest unturned_data/tests/ -v
```

### Commit message

```
feat: add common ItemAsset base fields to BundleEntry

Extract useable, slot, can_use_underwater, movement speed multiplier,
should_drop_on_death, and allow_manual_drop to the base entry model.
Remove duplicate slot field from Gun and MeleeWeapon subclasses.
```

---

## Task 5: Create properties infrastructure and base classes

**Goal:** Set up the `models/properties/` package with the base class, TYPE_REGISTRY, ignore lists, and the `properties` field on BundleEntry.

### Files to create/modify

- **Create** `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/models/properties/base.py`
- **Create** `unturned_data/warnings.py`
- Update `unturned_data/models/entry.py` (add `properties` field)
- Update `unturned_data/models/__init__.py` (re-export)
- **Create** `unturned_data/tests/test_properties.py`

### Steps

1. Create `unturned_data/models/properties/base.py`:
   ```python
   """Base properties class and field tracking infrastructure."""
   from __future__ import annotations
   from typing import Any, ClassVar
   import re
   from pydantic import BaseModel


   # Fields handled at the BundleEntry level (identity, blueprints, actions, etc.)
   # These are never "uncovered" regardless of item type.
   GLOBAL_HANDLED: set[str] = {
       "GUID", "ID", "Type", "Rarity", "Size_X", "Size_Y",
       "Useable", "Slot", "Can_Use_Underwater",
       "Equipable_Movement_Speed_Multiplier",
       "Should_Drop_On_Death", "Allow_Manual_Drop",
       # Blueprint system keys (consumed by Blueprint.list_from_raw)
       "Blueprints",
       # Action system keys (consumed by Action.list_from_raw)
       "Actions",
   }

   # Regex patterns for globally handled indexed keys
   GLOBAL_HANDLED_PATTERNS: list[re.Pattern] = [
       re.compile(r"^Blueprint_\d+_"),
       re.compile(r"^Action_\d+_"),
   ]

   # Fields intentionally ignored everywhere (engine visuals, audio, mesh)
   GLOBAL_IGNORE: set[str] = {
       "Size_Z", "Size2_Z",
       "Use_Auto_Icon_Measurements",
       "Shared_Skin_Lookup_ID",
       "Econ_Icon_Use_Id",
       "Backward",
       "Procedurally_Animate_Inertia",
       "Can_Player_Equip",
       "EquipAudioClip",
       "InspectAudioDef",
       "InventoryAudio",
       "WearAudio",
       "Bypass_Hash_Verification",
       "Override_Show_Quality",
       "Should_Delete_At_Zero_Quality",
       "Pro",
       "Quality_Min", "Quality_Max",
   }


   def is_globally_handled(key: str) -> bool:
       """Check if a key is handled at the base level."""
       if key in GLOBAL_HANDLED:
           return True
       for pattern in GLOBAL_HANDLED_PATTERNS:
           if pattern.match(key):
               return True
       return False


   class ItemProperties(BaseModel):
       """Base class for type-specific properties.

       Subclasses must implement from_raw() and may override IGNORE
       to suppress warnings for type-specific engine fields.
       """

       # Per-type ignore list: field name strings or regex patterns.
       # Subclasses override this as a ClassVar.
       IGNORE: ClassVar[set[str]] = set()
       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = []

       @classmethod
       def from_raw(cls, raw: dict[str, Any]) -> ItemProperties:
           """Extract typed properties from parsed .dat dict.

           Base implementation returns empty properties.
           Subclasses override to extract their specific fields.
           """
           return cls()

       @classmethod
       def consumed_keys(cls, raw: dict[str, Any]) -> set[str]:
           """Return the set of .dat keys consumed by from_raw().

           Default: returns all field names that exist in the raw dict,
           mapped from snake_case back to PascalCase. Subclasses with
           non-trivial key mapping should override.
           """
           # Build mapping from field defaults
           keys: set[str] = set()
           for field_name in cls.model_fields:
               # Common convention: snake_case -> Title_Case
               dat_key = _snake_to_dat_key(field_name)
               if dat_key in raw:
                   keys.add(dat_key)
           return keys

       @classmethod
       def is_ignored(cls, key: str) -> bool:
           """Check if a key should be ignored for this type."""
           if key in cls.IGNORE:
               return True
           for pattern in cls.IGNORE_PATTERNS:
               if pattern.match(key):
                   return True
           return False


   def _snake_to_dat_key(name: str) -> str:
       """Convert snake_case field name to .dat PascalCase key.

       e.g., 'damage_player' -> 'Player_Damage'
             'firerate' -> 'Firerate'
             'spread_hip' -> 'Spread_Hip'
       """
       return "_".join(part.capitalize() for part in name.split("_"))
   ```

2. Create `unturned_data/models/properties/__init__.py`:
   ```python
   """Properties registry mapping Type values to Properties classes."""
   from __future__ import annotations
   from typing import Any
   from unturned_data.models.properties.base import ItemProperties

   # Will be populated as property modules are added
   PROPERTIES_REGISTRY: dict[str, type[ItemProperties]] = {}


   def get_properties_class(item_type: str) -> type[ItemProperties] | None:
       """Look up the Properties class for a given Type value."""
       return PROPERTIES_REGISTRY.get(item_type)
   ```

3. Create `unturned_data/warnings.py`:
   ```python
   """Warning system for uncovered .dat fields."""
   from __future__ import annotations
   import logging
   import re
   from collections import defaultdict
   from typing import Any

   from unturned_data.models.properties.base import (
       GLOBAL_HANDLED, GLOBAL_IGNORE, GLOBAL_HANDLED_PATTERNS,
       is_globally_handled,
   )

   logger = logging.getLogger(__name__)


   class FieldCoverageReport:
       """Tracks which .dat fields are handled, ignored, or uncovered."""

       def __init__(self) -> None:
           # {type: {field_name: count}}
           self.uncovered: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
           self.total_entries: int = 0
           self.entries_with_uncovered: int = 0

       def check_entry(
           self,
           item_type: str,
           raw: dict[str, Any],
           consumed_keys: set[str],
           properties_cls: type | None = None,
       ) -> list[str]:
           """Check a single entry for uncovered fields.

           Returns list of uncovered field names.
           """
           self.total_entries += 1
           uncovered: list[str] = []

           for key in raw:
               if key in consumed_keys:
                   continue
               if is_globally_handled(key):
                   continue
               if key in GLOBAL_IGNORE:
                   continue
               if properties_cls and hasattr(properties_cls, 'is_ignored') and properties_cls.is_ignored(key):
                   continue
               uncovered.append(key)

           if uncovered:
               self.entries_with_uncovered += 1
               for field in uncovered:
                   self.uncovered[item_type][field] += 1

           return uncovered

       def format_warnings(self) -> str:
           """Format uncovered field warnings for stderr output."""
           if not self.uncovered:
               return ""
           lines: list[str] = []
           for item_type, fields in sorted(self.uncovered.items()):
               field_list = ", ".join(sorted(fields.keys()))
               total = sum(fields.values())
               lines.append(
                   f"WARNING: {len(fields)} uncovered field(s) in {item_type} "
                   f"entries ({total} occurrences): {field_list}"
               )
           return "\n".join(lines)

       def has_uncovered(self) -> bool:
           return bool(self.uncovered)
   ```

4. Add `properties: dict[str, Any] = {}` field to BundleEntry in `entry.py`.

5. Update `SCHEMA_C_FIELDS` in `exporter.py` to include `"properties"`.

6. Write tests in `test_properties.py`:
   - `test_base_properties_from_raw_empty` — ItemProperties.from_raw({}) returns empty
   - `test_global_handled_keys` — known keys are handled
   - `test_global_handled_patterns` — Blueprint_0_Type matches
   - `test_field_coverage_report_no_uncovered` — all keys consumed
   - `test_field_coverage_report_uncovered` — unknown key flagged
   - `test_snake_to_dat_key` — conversion works

### Test command

```bash
python -m pytest unturned_data/tests/test_properties.py -v
```

### Commit message

```
feat: add properties infrastructure with base class and warning system

Create models/properties/ package with ItemProperties base, ignore
lists, PROPERTIES_REGISTRY, and FieldCoverageReport warning system.
```

---

## Task 6: Weapon properties (weapons.py)

**Goal:** Create `GunProperties`, `MeleeProperties`, `ThrowableProperties` with full field coverage from ItemData.yml.

### Files to create/modify

- **Create** `unturned_data/models/properties/weapons.py`
- Update `unturned_data/models/properties/__init__.py` (register types)
- **Create** `unturned_data/tests/test_properties_weapons.py`

### Steps

1. Create `unturned_data/models/properties/weapons.py`:

   ```python
   """Weapon property models: Gun, Melee, Throwable."""
   from __future__ import annotations
   import re
   from typing import Any, ClassVar
   from pydantic import BaseModel
   from unturned_data.models.properties.base import ItemProperties


   class GunProperties(ItemProperties):
       """Properties for Type=Gun items."""

       # Fire mechanics
       firerate: int = 0
       action: str = ""              # Trigger, Bolt, Pump, Rail, String, Break, Rocket, Minigun
       safety: bool = False
       semi: bool = False
       auto: bool = False
       bursts: int = 0
       turret: bool = False

       # Damage per target type
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0

       # Damage multipliers
       player_skull_multiplier: float = 0
       player_spine_multiplier: float = 0
       player_arm_multiplier: float = 0
       player_leg_multiplier: float = 0
       zombie_skull_multiplier: float = 0
       zombie_spine_multiplier: float = 0
       zombie_arm_multiplier: float = 0
       zombie_leg_multiplier: float = 0
       animal_skull_multiplier: float = 0
       animal_spine_multiplier: float = 0
       animal_leg_multiplier: float = 0

       # Damage modifiers
       player_damage_bleeding: str = ""   # Default, Always, Never, Heal
       player_damage_bones: str = ""      # None, Always, Heal
       player_damage_food: float = 0
       player_damage_water: float = 0
       player_damage_virus: float = 0
       player_damage_hallucination: float = 0

       # Accuracy
       spread_hip: float = 0
       spread_aim: float = 0
       spread_sprint: float = 1.25
       spread_crouch: float = 0.85
       spread_prone: float = 0.7

       # Range
       range: float = 0
       range_rangefinder: float = 0

       # Recoil
       recoil_min_x: float = 0
       recoil_max_x: float = 0
       recoil_min_y: float = 0
       recoil_max_y: float = 0
       recoil_aim: float = 1.0
       aiming_recoil_multiplier: float = 1.0
       recover_x: float = 0
       recover_y: float = 0
       recoil_sprint: float = 1.25
       recoil_crouch: float = 0.85
       recoil_prone: float = 0.7

       # Physical recoil (shake)
       shake_min_x: float = 0
       shake_min_y: float = 0
       shake_min_z: float = 0
       shake_max_x: float = 0
       shake_max_y: float = 0
       shake_max_z: float = 0

       # Ballistics
       ballistic_steps: int = 0
       ballistic_travel: float = 10.0
       ballistic_drop: float = 0
       ballistic_force: float = 0
       damage_falloff_range: float = 1.0
       damage_falloff_multiplier: float = 1.0

       # Projectile
       projectile_lifespan: float = 30.0
       projectile_penetrate_buildables: bool = False
       projectile_explosion_launch_speed: float = 0

       # Magazine system
       ammo_min: int = 0
       ammo_max: int = 0
       caliber: int = 0
       magazine_calibers: list[int] = []
       attachment_calibers: list[int] = []
       default_sight: int = 0
       default_tactical: int = 0
       default_grip: int = 0
       default_barrel: int = 0
       default_magazine: int = 0
       hook_sight: bool = False
       hook_tactical: bool = False
       hook_grip: bool = False
       hook_barrel: bool = False

       # Magazine handling
       delete_empty_magazines: bool = False
       should_delete_empty_magazines: bool = False
       requires_nonzero_attachment_caliber: bool = False
       allow_magazine_change: bool = True
       unplace: float = 0
       replace: float = 0
       ammo_per_shot: int = 1
       infinite_ammo: bool = False

       # Reload / timing
       reload_time: float = 0
       hammer_timer: float = 0
       fire_delay_seconds: float = 0

       # Misc
       alert_radius: float = 0
       instakill_headshots: bool = False
       can_aim_during_sprint: bool = False
       aiming_movement_speed_multiplier: float = 0
       can_ever_jam: bool = False
       jam_quality_threshold: float = 0.4
       jam_max_chance: float = 0.1
       unjam_chamber_anim: str = "UnjamChamber"
       gunshot_rolloff_distance: float = 0
       durability: float = 0
       wear: int = 0
       invulnerable: bool = False
       stun_zombie_always: bool = False
       stun_zombie_never: bool = False

       # Magazine replacements
       magazine_replacements: list[dict[str, Any]] = []

       IGNORE: ClassVar[set[str]] = {
           "Muzzle", "Shell", "Explosion",  # Effect IDs (engine visual)
           "BladeIDs", "BladeID",
           "Allow_Flesh_Fx",
           "Bypass_Allowed_To_Damage_Player",
       }
       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^Shoot_Quest_Reward_\d+"),  # Quest reward system
           re.compile(r"^Hook_"),  # Parsed into hook_* bools
           re.compile(r"^BladeID_\d+"),
           re.compile(r"^Magazine_Replacement_\d+"),  # Parsed into magazine_replacements
           re.compile(r"^Magazine_Caliber_\d+"),
           re.compile(r"^Attachment_Caliber_\d+"),
       ]

       @classmethod
       def from_raw(cls, raw: dict[str, Any]) -> GunProperties:
           # Parse magazine calibers
           mag_cal_count = int(raw.get("Magazine_Calibers", 0))
           mag_cals = []
           for i in range(mag_cal_count):
               cal = raw.get(f"Magazine_Caliber_{i}")
               if cal is not None:
                   mag_cals.append(int(cal))

           # Parse attachment calibers
           att_cal_count = int(raw.get("Attachment_Calibers", 0))
           att_cals = []
           for i in range(att_cal_count):
               cal = raw.get(f"Attachment_Caliber_{i}")
               if cal is not None:
                   att_cals.append(int(cal))

           # Parse magazine replacements
           mag_rep_count = int(raw.get("Magazine_Replacements", 0))
           mag_reps = []
           for i in range(mag_rep_count):
               rep = {
                   "id": int(raw.get(f"Magazine_Replacement_{i}_ID", 0)),
                   "map": str(raw.get(f"Magazine_Replacement_{i}_Map", "")),
               }
               mag_reps.append(rep)

           return cls(
               firerate=int(raw.get("Firerate", 0)),
               action=str(raw.get("Action", "")),
               safety=bool(raw.get("Safety", False)),
               semi=bool(raw.get("Semi", False)),
               auto=bool(raw.get("Auto", False)),
               bursts=int(raw.get("Bursts", 0)),
               turret=bool(raw.get("Turret", False)),
               damage_player=float(raw.get("Player_Damage", 0)),
               damage_zombie=float(raw.get("Zombie_Damage", 0)),
               damage_animal=float(raw.get("Animal_Damage", 0)),
               damage_barricade=float(raw.get("Barricade_Damage", 0)),
               damage_structure=float(raw.get("Structure_Damage", 0)),
               damage_vehicle=float(raw.get("Vehicle_Damage", 0)),
               damage_resource=float(raw.get("Resource_Damage", 0)),
               damage_object=float(raw.get("Object_Damage", 0)),
               player_skull_multiplier=float(raw.get("Player_Skull_Multiplier", 0)),
               player_spine_multiplier=float(raw.get("Player_Spine_Multiplier", 0)),
               player_arm_multiplier=float(raw.get("Player_Arm_Multiplier", 0)),
               player_leg_multiplier=float(raw.get("Player_Leg_Multiplier", 0)),
               zombie_skull_multiplier=float(raw.get("Zombie_Skull_Multiplier", 0)),
               zombie_spine_multiplier=float(raw.get("Zombie_Spine_Multiplier", 0)),
               zombie_arm_multiplier=float(raw.get("Zombie_Arm_Multiplier", 0)),
               zombie_leg_multiplier=float(raw.get("Zombie_Leg_Multiplier", 0)),
               animal_skull_multiplier=float(raw.get("Animal_Skull_Multiplier", 0)),
               animal_spine_multiplier=float(raw.get("Animal_Spine_Multiplier", 0)),
               animal_leg_multiplier=float(raw.get("Animal_Leg_Multiplier", 0)),
               player_damage_bleeding=str(raw.get("Player_Damage_Bleeding", "")),
               player_damage_bones=str(raw.get("Player_Damage_Bones", "")),
               player_damage_food=float(raw.get("Player_Damage_Food", 0)),
               player_damage_water=float(raw.get("Player_Damage_Water", 0)),
               player_damage_virus=float(raw.get("Player_Damage_Virus", 0)),
               player_damage_hallucination=float(raw.get("Player_Damage_Hallucination", 0)),
               spread_hip=float(raw.get("Spread_Hip", 0)),
               spread_aim=float(raw.get("Spread_Aim", 0)),
               spread_sprint=float(raw.get("Spread_Sprint", 1.25)),
               spread_crouch=float(raw.get("Spread_Crouch", 0.85)),
               spread_prone=float(raw.get("Spread_Prone", 0.7)),
               range=float(raw.get("Range", 0)),
               range_rangefinder=float(raw.get("Range_Rangefinder", 0)),
               recoil_min_x=float(raw.get("Recoil_Min_X", 0)),
               recoil_max_x=float(raw.get("Recoil_Max_X", 0)),
               recoil_min_y=float(raw.get("Recoil_Min_Y", 0)),
               recoil_max_y=float(raw.get("Recoil_Max_Y", 0)),
               recoil_aim=float(raw.get("Recoil_Aim", 1.0)),
               aiming_recoil_multiplier=float(raw.get("Aiming_Recoil_Multiplier", 1.0)),
               recover_x=float(raw.get("Recover_X", 0)),
               recover_y=float(raw.get("Recover_Y", 0)),
               recoil_sprint=float(raw.get("Recoil_Sprint", 1.25)),
               recoil_crouch=float(raw.get("Recoil_Crouch", 0.85)),
               recoil_prone=float(raw.get("Recoil_Prone", 0.7)),
               shake_min_x=float(raw.get("Shake_Min_X", 0)),
               shake_min_y=float(raw.get("Shake_Min_Y", 0)),
               shake_min_z=float(raw.get("Shake_Min_Z", 0)),
               shake_max_x=float(raw.get("Shake_Max_X", 0)),
               shake_max_y=float(raw.get("Shake_Max_Y", 0)),
               shake_max_z=float(raw.get("Shake_Max_Z", 0)),
               ballistic_steps=int(raw.get("Ballistic_Steps", 0)),
               ballistic_travel=float(raw.get("Ballistic_Travel", 10.0)),
               ballistic_drop=float(raw.get("Ballistic_Drop", 0)),
               ballistic_force=float(raw.get("Ballistic_Force", 0)),
               damage_falloff_range=float(raw.get("Damage_Falloff_Range", 1.0)),
               damage_falloff_multiplier=float(raw.get("Damage_Falloff_Multiplier", 1.0)),
               projectile_lifespan=float(raw.get("Projectile_Lifespan", 30.0)),
               projectile_penetrate_buildables=bool(raw.get("Projectile_Penetrate_Buildables", False)),
               projectile_explosion_launch_speed=float(raw.get("Projectile_Explosion_Launch_Speed", 0)),
               ammo_min=int(raw.get("Ammo_Min", 0)),
               ammo_max=int(raw.get("Ammo_Max", 0)),
               caliber=int(raw.get("Caliber", 0)),
               magazine_calibers=mag_cals,
               attachment_calibers=att_cals,
               default_sight=int(raw.get("Sight", 0)),
               default_tactical=int(raw.get("Tactical", 0)),
               default_grip=int(raw.get("Grip", 0)),
               default_barrel=int(raw.get("Barrel", 0)),
               default_magazine=int(raw.get("Magazine", 0)),
               hook_sight=bool(raw.get("Hook_Sight", False)),
               hook_tactical=bool(raw.get("Hook_Tactical", False)),
               hook_grip=bool(raw.get("Hook_Grip", False)),
               hook_barrel=bool(raw.get("Hook_Barrel", False)),
               delete_empty_magazines=bool(raw.get("Delete_Empty_Magazines", False)),
               should_delete_empty_magazines=bool(raw.get("Should_Delete_Empty_Magazines", False)),
               requires_nonzero_attachment_caliber=bool(raw.get("Requires_NonZero_Attachment_Caliber", False)),
               allow_magazine_change=bool(raw.get("Allow_Magazine_Change", True)),
               unplace=float(raw.get("Unplace", 0)),
               replace=float(raw.get("Replace", 0)),
               ammo_per_shot=int(raw.get("Ammo_Per_Shot", 1)),
               infinite_ammo=bool(raw.get("Infinite_Ammo", False)),
               reload_time=float(raw.get("Reload_Time", 0)),
               hammer_timer=float(raw.get("Hammer_Timer", 0)),
               fire_delay_seconds=float(raw.get("Fire_Delay_Seconds", 0)),
               alert_radius=float(raw.get("Alert_Radius", 0)),
               instakill_headshots=bool(raw.get("Instakill_Headshots", False)),
               can_aim_during_sprint=bool(raw.get("Can_Aim_During_Sprint", False)),
               aiming_movement_speed_multiplier=float(raw.get("Aiming_Movement_Speed_Multiplier", 0)),
               can_ever_jam=bool(raw.get("Can_Ever_Jam", False)),
               jam_quality_threshold=float(raw.get("Jam_Quality_Threshold", 0.4)),
               jam_max_chance=float(raw.get("Jam_Max_Chance", 0.1)),
               unjam_chamber_anim=str(raw.get("Unjam_Chamber_Anim", "UnjamChamber")),
               gunshot_rolloff_distance=float(raw.get("Gunshot_Rolloff_Distance", 0)),
               durability=float(raw.get("Durability", 0)),
               wear=int(raw.get("Wear", 0)),
               invulnerable=bool(raw.get("Invulnerable", False)),
               stun_zombie_always=bool(raw.get("Stun_Zombie_Always", False)),
               stun_zombie_never=bool(raw.get("Stun_Zombie_Never", False)),
               magazine_replacements=mag_reps,
           )


   class MeleeProperties(ItemProperties):
       """Properties for Type=Melee items."""

       # Damage
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0

       # Multipliers
       player_skull_multiplier: float = 0
       player_spine_multiplier: float = 0
       player_arm_multiplier: float = 0
       player_leg_multiplier: float = 0
       zombie_skull_multiplier: float = 0
       zombie_spine_multiplier: float = 0
       zombie_arm_multiplier: float = 0
       zombie_leg_multiplier: float = 0
       animal_skull_multiplier: float = 0
       animal_spine_multiplier: float = 0
       animal_leg_multiplier: float = 0

       # Damage modifiers
       player_damage_bleeding: str = ""
       player_damage_bones: str = ""
       player_damage_food: float = 0
       player_damage_water: float = 0
       player_damage_virus: float = 0
       player_damage_hallucination: float = 0

       # Melee-specific
       range: float = 0
       strength: float = 0
       weak: float = 0
       strong: float = 0
       stamina: int = 0
       repair: bool = False
       repeated: bool = False
       light: bool = False
       alert_radius: float = 0
       durability: float = 0
       wear: int = 0
       invulnerable: bool = False
       stun_zombie_always: bool = False
       stun_zombie_never: bool = False

       IGNORE: ClassVar[set[str]] = {
           "Explosion",  # Effect ID
           "Allow_Flesh_Fx",
           "Bypass_Allowed_To_Damage_Player",
           "ImpactAudioDef",
           "SpotLight_Range", "SpotLight_Angle", "SpotLight_Intensity",
           "Spotlight_Color_R", "Spotlight_Color_G", "Spotlight_Color_B",
           "BladeIDs", "BladeID",
       }
       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^BladeID_\d+"),
       ]

       @classmethod
       def from_raw(cls, raw: dict[str, Any]) -> MeleeProperties:
           return cls(
               damage_player=float(raw.get("Player_Damage", 0)),
               damage_zombie=float(raw.get("Zombie_Damage", 0)),
               damage_animal=float(raw.get("Animal_Damage", 0)),
               damage_barricade=float(raw.get("Barricade_Damage", 0)),
               damage_structure=float(raw.get("Structure_Damage", 0)),
               damage_vehicle=float(raw.get("Vehicle_Damage", 0)),
               damage_resource=float(raw.get("Resource_Damage", 0)),
               damage_object=float(raw.get("Object_Damage", 0)),
               player_skull_multiplier=float(raw.get("Player_Skull_Multiplier", 0)),
               player_spine_multiplier=float(raw.get("Player_Spine_Multiplier", 0)),
               player_arm_multiplier=float(raw.get("Player_Arm_Multiplier", 0)),
               player_leg_multiplier=float(raw.get("Player_Leg_Multiplier", 0)),
               zombie_skull_multiplier=float(raw.get("Zombie_Skull_Multiplier", 0)),
               zombie_spine_multiplier=float(raw.get("Zombie_Spine_Multiplier", 0)),
               zombie_arm_multiplier=float(raw.get("Zombie_Arm_Multiplier", 0)),
               zombie_leg_multiplier=float(raw.get("Zombie_Leg_Multiplier", 0)),
               animal_skull_multiplier=float(raw.get("Animal_Skull_Multiplier", 0)),
               animal_spine_multiplier=float(raw.get("Animal_Spine_Multiplier", 0)),
               animal_leg_multiplier=float(raw.get("Animal_Leg_Multiplier", 0)),
               player_damage_bleeding=str(raw.get("Player_Damage_Bleeding", "")),
               player_damage_bones=str(raw.get("Player_Damage_Bones", "")),
               player_damage_food=float(raw.get("Player_Damage_Food", 0)),
               player_damage_water=float(raw.get("Player_Damage_Water", 0)),
               player_damage_virus=float(raw.get("Player_Damage_Virus", 0)),
               player_damage_hallucination=float(raw.get("Player_Damage_Hallucination", 0)),
               range=float(raw.get("Range", 0)),
               strength=float(raw.get("Strength", 0)),
               weak=float(raw.get("Weak", 0)),
               strong=float(raw.get("Strong", 0)),
               stamina=int(raw.get("Stamina", 0)),
               repair=bool(raw.get("Repair", False)),
               repeated=bool(raw.get("Repeated", False)),
               light=bool(raw.get("Light", False)),
               alert_radius=float(raw.get("Alert_Radius", 0)),
               durability=float(raw.get("Durability", 0)),
               wear=int(raw.get("Wear", 0)),
               invulnerable=bool(raw.get("Invulnerable", False)),
               stun_zombie_always=bool(raw.get("Stun_Zombie_Always", False)),
               stun_zombie_never=bool(raw.get("Stun_Zombie_Never", False)),
           )


   class ThrowableProperties(ItemProperties):
       """Properties for Type=Throwable items."""

       # Damage
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0

       # Multipliers (inherited from WeaponAsset)
       player_skull_multiplier: float = 0
       player_spine_multiplier: float = 0
       player_arm_multiplier: float = 0
       player_leg_multiplier: float = 0
       zombie_skull_multiplier: float = 0
       zombie_spine_multiplier: float = 0
       zombie_arm_multiplier: float = 0
       zombie_leg_multiplier: float = 0
       animal_skull_multiplier: float = 0
       animal_spine_multiplier: float = 0
       animal_leg_multiplier: float = 0

       # Throwable-specific
       explosive: bool = False
       flash: bool = False
       sticky: bool = False
       explode_on_impact: bool = False
       fuse_length: float = 0
       explosion_launch_speed: float = 0
       strong_throw_force: float = 1100.0
       weak_throw_force: float = 600.0
       boost_throw_force_multiplier: float = 1.4
       durability: float = 0
       wear: int = 0
       invulnerable: bool = False

       IGNORE: ClassVar[set[str]] = {
           "Explosion",  # Effect ID
           "Allow_Flesh_Fx",
           "Bypass_Allowed_To_Damage_Player",
           "BladeIDs", "BladeID",
       }
       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^BladeID_\d+"),
       ]

       @classmethod
       def from_raw(cls, raw: dict[str, Any]) -> ThrowableProperties:
           return cls(
               damage_player=float(raw.get("Player_Damage", 0)),
               damage_zombie=float(raw.get("Zombie_Damage", 0)),
               damage_animal=float(raw.get("Animal_Damage", 0)),
               damage_barricade=float(raw.get("Barricade_Damage", 0)),
               damage_structure=float(raw.get("Structure_Damage", 0)),
               damage_vehicle=float(raw.get("Vehicle_Damage", 0)),
               damage_resource=float(raw.get("Resource_Damage", 0)),
               damage_object=float(raw.get("Object_Damage", 0)),
               player_skull_multiplier=float(raw.get("Player_Skull_Multiplier", 0)),
               player_spine_multiplier=float(raw.get("Player_Spine_Multiplier", 0)),
               player_arm_multiplier=float(raw.get("Player_Arm_Multiplier", 0)),
               player_leg_multiplier=float(raw.get("Player_Leg_Multiplier", 0)),
               zombie_skull_multiplier=float(raw.get("Zombie_Skull_Multiplier", 0)),
               zombie_spine_multiplier=float(raw.get("Zombie_Spine_Multiplier", 0)),
               zombie_arm_multiplier=float(raw.get("Zombie_Arm_Multiplier", 0)),
               zombie_leg_multiplier=float(raw.get("Zombie_Leg_Multiplier", 0)),
               animal_skull_multiplier=float(raw.get("Animal_Skull_Multiplier", 0)),
               animal_spine_multiplier=float(raw.get("Animal_Spine_Multiplier", 0)),
               animal_leg_multiplier=float(raw.get("Animal_Leg_Multiplier", 0)),
               explosive=bool(raw.get("Explosive", False)),
               flash=bool(raw.get("Flash", False)),
               sticky=bool(raw.get("Sticky", False)),
               explode_on_impact=bool(raw.get("Explode_On_Impact", False)),
               fuse_length=float(raw.get("Fuse_Length", 0)),
               explosion_launch_speed=float(raw.get("Explosion_Launch_Speed", 0)),
               strong_throw_force=float(raw.get("Strong_Throw_Force", 1100.0)),
               weak_throw_force=float(raw.get("Weak_Throw_Force", 600.0)),
               boost_throw_force_multiplier=float(raw.get("Boost_Throw_Force_Multiplier", 1.4)),
               durability=float(raw.get("Durability", 0)),
               wear=int(raw.get("Wear", 0)),
               invulnerable=bool(raw.get("Invulnerable", False)),
           )
   ```

2. Register in `properties/__init__.py`:
   ```python
   from unturned_data.models.properties.weapons import (
       GunProperties, MeleeProperties, ThrowableProperties,
   )
   PROPERTIES_REGISTRY["Gun"] = GunProperties
   PROPERTIES_REGISTRY["Melee"] = MeleeProperties
   PROPERTIES_REGISTRY["Throwable"] = ThrowableProperties
   ```

3. Write tests using the `gun_maplestrike` and `melee_katana` fixtures:
   - `test_gun_properties_from_fixture` — loads Maplestrike, checks firerate=5, range=200, damage_player=40, etc.
   - `test_gun_properties_fire_modes` — safety, semi, auto flags
   - `test_gun_properties_hooks` — hook_sight, hook_barrel, etc.
   - `test_gun_properties_serializes_flat` — model_dump() produces flat dict
   - `test_melee_properties_from_fixture` — loads Katana, checks damage_player=50, range=2.25, strength=1.5
   - `test_throwable_properties_defaults` — empty raw produces correct defaults

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_weapons.py -v
```

### Commit message

```
feat: add Gun, Melee, and Throwable property models

Full field coverage for weapon types from ItemData.yml with
from_raw() extraction and per-type ignore lists.
```

---

## Task 7: Consumable properties (consumables.py)

**Goal:** Create `ConsumableProperties` shared by Food, Medical, and Water types.

### Files to create/modify

- **Create** `unturned_data/models/properties/consumables.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_consumables.py`

### Steps

1. Create `consumables.py`:
   ```python
   class ConsumableProperties(ItemProperties):
       """Properties shared by Food, Medical, Water types."""

       # Stat changes
       health: int = 0
       food: int = 0
       water: int = 0
       virus: int = 0
       disinfectant: int = 0
       energy: int = 0
       vision: int = 0
       oxygen: int = 0
       warmth: int = 0
       experience: int = 0

       # Damage (inherited from WeaponAsset)
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0
       range: float = 0
       durability: float = 0
       wear: int = 0
       invulnerable: bool = False

       # Modifiers
       bleeding: bool = False
       bleeding_modifier: str = ""     # None, Heal, Cut
       broken: bool = False
       bones_modifier: str = ""        # None, Heal, Break
       aid: bool = False
       should_delete_after_use: bool = True

       # Reward system
       item_reward_spawn_id: int = 0
       min_item_rewards: int = 0
       max_item_rewards: int = 0

       IGNORE: ClassVar[set[str]] = {
           "Explosion",
           "Allow_Flesh_Fx",
           "Bypass_Allowed_To_Damage_Player",
           "BladeIDs", "BladeID",
           # Multipliers inherited from weapon base
           "Player_Skull_Multiplier", "Player_Spine_Multiplier",
           "Player_Arm_Multiplier", "Player_Leg_Multiplier",
           "Zombie_Skull_Multiplier", "Zombie_Spine_Multiplier",
           "Zombie_Arm_Multiplier", "Zombie_Leg_Multiplier",
           "Animal_Skull_Multiplier", "Animal_Spine_Multiplier",
           "Animal_Leg_Multiplier",
           "Player_Damage_Bleeding", "Player_Damage_Bones",
           "Player_Damage_Food", "Player_Damage_Water",
           "Player_Damage_Virus", "Player_Damage_Hallucination",
           "Stun_Zombie_Always", "Stun_Zombie_Never",
       }
       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^Quest_Reward_\d+"),
           re.compile(r"^BladeID_\d+"),
       ]
   ```

2. Implement `from_raw()` extracting each field by its .dat key name.

3. Register: `Food`, `Medical`, `Water` all map to `ConsumableProperties`.

4. Write tests using `food_beans`, `medical_bandage`, `water_berries` fixtures.

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_consumables.py -v
```

### Commit message

```
feat: add ConsumableProperties for Food, Medical, Water types
```

---

## Task 8: Clothing properties (clothing.py)

**Goal:** Create `ClothingProperties`, `BagProperties`, `GearProperties` and subtypes for all 7 clothing types.

### Files to create/modify

- **Create** `unturned_data/models/properties/clothing.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_clothing.py`

### Steps

1. Create `clothing.py` with:

   ```python
   class ClothingProperties(ItemProperties):
       """Base clothing properties shared by all clothing types."""
       armor: float = 1.0
       armor_explosion: float = 0       # Defaults to armor value in game
       proof_water: bool = False
       proof_fire: bool = False
       proof_radiation: bool = False
       movement_speed_multiplier: float = 1.0
       visible_on_ragdoll: bool = True
       hair_visible: bool = True
       beard_visible: bool = True

       IGNORE: ClassVar[set[str]] = {
           "Mirror_Left_Handed_Model",
           "WearAudio",
           "Has_1P_Character_Mesh_Override",
           "Character_Mesh_3P_Override_LODs",
           "Has_Character_Material_Override",
           "Ignore_Hand",
       }

   class BagProperties(ClothingProperties):
       """Properties for Backpack, Pants, Shirt, Vest (have storage)."""
       width: int = 0
       height: int = 0

   class GearProperties(ClothingProperties):
       """Properties for Hat, Mask, Glasses (have gear-specific fields)."""
       hair: bool = False
       beard: bool = False
       hair_override: str = ""
       # Glasses/Mask-specific
       vision: str = ""                # NONE, MILITARY, CIVILIAN, HEADLAMP
       nightvision_color_r: int = 0
       nightvision_color_g: int = 0
       nightvision_color_b: int = 0
       nightvision_fog_intensity: float = 0
       blindfold: bool = False         # Glasses only
       earpiece: bool = False          # Mask only
   ```

2. Register types:
   - `Backpack`, `Pants`, `Shirt`, `Vest` -> `BagProperties`
   - `Hat`, `Mask`, `Glasses` -> `GearProperties`

3. Write tests using `backpack_alice` fixture.

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_clothing.py -v
```

### Commit message

```
feat: add ClothingProperties, BagProperties, GearProperties models
```

---

## Task 9: Attachment properties (attachments.py)

**Goal:** Create `CaliberProperties` base with `SightProperties`, `BarrelProperties`, `GripProperties`, `TacticalProperties`, `MagazineProperties`.

### Files to create/modify

- **Create** `unturned_data/models/properties/attachments.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_attachments.py`

### Steps

1. Create `attachments.py`:

   ```python
   class CaliberProperties(ItemProperties):
       """Base properties shared by all attachment types (inherits from ItemCaliberAsset)."""
       calibers: list[int] = []
       recoil_x: float = 1.0
       recoil_y: float = 1.0
       aiming_recoil_multiplier: float = 1.0
       spread: float = 1.0
       sway: float = 1.0
       shake: float = 1.0
       damage: float = 1.0
       firerate: int = 0
       ballistic_damage_multiplier: float = 0   # defaults to damage value
       paintable: bool = False
       bipod: bool = False

       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^Caliber_\d+$"),
       ]

   class SightProperties(CaliberProperties):
       vision: str = ""                # NONE, MILITARY, CIVILIAN
       zoom: float = 0
       holographic: bool = False
       nightvision_color_r: int = 0
       nightvision_color_g: int = 0
       nightvision_color_b: int = 0
       nightvision_fog_intensity: float = 0

   class BarrelProperties(CaliberProperties):
       braked: bool = False
       silenced: bool = False
       volume: float = 1.0
       durability: int = 0
       ballistic_drop: float = 1.0
       gunshot_rolloff_distance_multiplier: float = 0

   class GripProperties(CaliberProperties):
       pass  # No additional fields beyond CaliberProperties

   class TacticalProperties(CaliberProperties):
       laser: bool = False
       light: bool = False
       rangefinder: bool = False
       melee: bool = False
       spotlight_range: float = 64.0
       spotlight_angle: float = 90.0
       spotlight_intensity: float = 1.3
       spotlight_color_r: int = 245
       spotlight_color_g: int = 223
       spotlight_color_b: int = 147

   class MagazineProperties(CaliberProperties):
       amount: int = 0
       count_min: int = 0
       count_max: int = 0
       pellets: int = 0
       stuck: int = 0
       projectile_damage_multiplier: float = 1.0
       projectile_blast_radius_multiplier: float = 1.0
       projectile_launch_force_multiplier: float = 1.0
       range: float = 0
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0
       explosion_launch_speed: float = 0
       speed: float = 0
       explosive: bool = False
       delete_empty: bool = False
       should_fill_after_detach: bool = False

       IGNORE: ClassVar[set[str]] = {
           "Tracer", "Impact", "Explosion",   # Effect IDs
           "Spawn_Explosion_On_Dedicated_Server",
       }
   ```

2. Register: `Sight` -> `SightProperties`, `Barrel` -> `BarrelProperties`, `Grip` -> `GripProperties`, `Tactical` -> `TacticalProperties`, `Magazine` -> `MagazineProperties`.

3. Write tests with inline raw dicts (no fixtures needed for simple types).

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_attachments.py -v
```

### Commit message

```
feat: add attachment property models (Sight, Barrel, Grip, Tactical, Magazine)
```

---

## Task 10: Barricade properties (barricades.py)

**Goal:** Create `BarricadeProperties` base and subtypes for Storage, Farm, Generator, Trap, Beacon, Tank, Charge, Library, OilPump, Sentry.

### Files to create/modify

- **Create** `unturned_data/models/properties/barricades.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_barricades.py`

### Steps

1. Create `barricades.py`:

   ```python
   class BarricadeProperties(ItemProperties):
       """Base properties for all barricade types."""
       health: int = 0
       range: float = 0
       radius: float = 0
       offset: float = 0
       can_be_damaged: bool = True
       locked: bool = False
       vulnerable: bool = False
       bypass_claim: bool = False
       allow_placement_on_vehicle: bool = False
       unrepairable: bool = False
       proof_explosion: bool = False
       unpickupable: bool = False
       bypass_pickup_ownership: bool = False
       allow_placement_inside_clip_volumes: bool = False
       unsalvageable: bool = False
       salvage_duration_multiplier: float = 1.0
       unsaveable: bool = False
       allow_collision_while_animating: bool = False
       armor_tier: str = ""            # LOW, HIGH

       IGNORE: ClassVar[set[str]] = {
           "Explosion",                # Effect ID
           "Has_Clip_Prefab",
           "PlacementPreviewPrefab",
           "Eligible_For_Pooling",
           "Use_Water_Height_Transparent_Sort",
           "PlacementAudioClip",
           "Should_Close_When_Outside_Range",
           # Salvage/destroy recovery fields (tracked via blueprints)
           "Items_Recovered_On_Salvage", "SalvageItem",
           "Items_Dropped_On_Destroy", "Item_Dropped_On_Destroy",
       }

   class StorageProperties(BarricadeProperties):
       storage_x: int = 0
       storage_y: int = 0
       display: bool = False

   class SentryProperties(StorageProperties):
       mode: str = ""                  # NEUTRAL, FRIENDLY, HOSTILE
       requires_power: bool = False
       infinite_ammo: bool = False
       infinite_quality: bool = False
       detection_radius: float = 48.0
       target_loss_radius: float = 0

       IGNORE: ClassVar[set[str]] = {
           *StorageProperties.IGNORE,
           "Target_Acquired_Effect", "Target_Lost_Effect",
       }

   class FarmProperties(BarricadeProperties):
       growth: int = 0
       grow: int = 0
       allow_fertilizer: bool = True
       harvest_reward_experience: int = 1

       IGNORE: ClassVar[set[str]] = {
           *BarricadeProperties.IGNORE,
           "Grow_SpawnTable",
           "Ignore_Soil_Restrictions",
       }

   class GeneratorProperties(BarricadeProperties):
       capacity: int = 0
       wirerange: float = 0
       burn: float = 0

   class TrapProperties(BarricadeProperties):
       range2: float = 0
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0
       trap_setup_delay: float = 0.25
       trap_cooldown: float = 0
       explosion_launch_speed: float = 0
       broken: bool = False
       explosive: bool = False
       damage_tires: bool = False

       IGNORE: ClassVar[set[str]] = {
           *BarricadeProperties.IGNORE,
           "Explosion2",
       }

   class BeaconProperties(BarricadeProperties):
       wave: int = 0
       rewards: int = 0
       reward_id: int = 0
       enable_participant_scaling: bool = True

   class TankProperties(BarricadeProperties):
       source: str = ""                # NONE, WATER, FUEL
       resource: int = 0

   class ChargeProperties(BarricadeProperties):
       range2: float = 0
       damage_player: float = 0
       damage_zombie: float = 0
       damage_animal: float = 0
       damage_barricade: float = 0
       damage_structure: float = 0
       damage_vehicle: float = 0
       damage_resource: float = 0
       damage_object: float = 0
       explosion_launch_speed: float = 0

       IGNORE: ClassVar[set[str]] = {
           *BarricadeProperties.IGNORE,
           "Explosion2",
       }

   class LibraryProperties(BarricadeProperties):
       capacity: int = 0
       tax: int = 0

   class OilPumpProperties(BarricadeProperties):
       fuel_capacity: int = 0
   ```

2. Register: `Barricade` -> `BarricadeProperties`, `Storage` -> `StorageProperties`, `Sentry` -> `SentryProperties`, `Farm` -> `FarmProperties`, `Generator` -> `GeneratorProperties`, `Trap` -> `TrapProperties`, `Beacon` -> `BeaconProperties`, `Tank` -> `TankProperties`, `Charge` -> `ChargeProperties`, `Library` -> `LibraryProperties`, `Oil_Pump` -> `OilPumpProperties`.

3. Write tests using the `barricade_wire` fixture (which is a Trap type).

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_barricades.py -v
```

### Commit message

```
feat: add barricade property models (Storage, Farm, Generator, Trap, etc.)
```

---

## Task 11: Structure properties (structures.py)

**Goal:** Create `StructureProperties` with fields from ItemStructureAsset.

### Files to create/modify

- **Create** `unturned_data/models/properties/structures.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_structures.py`

### Steps

1. Create `structures.py`:

   ```python
   class StructureProperties(ItemProperties):
       """Properties for Type=Structure items."""
       construct: str = ""             # FLOOR, WALL, RAMPART, ROOF, PILLAR, POST, etc.
       health: int = 0
       range: float = 0
       can_be_damaged: bool = True
       requires_pillars: bool = True
       vulnerable: bool = False
       unrepairable: bool = False
       proof_explosion: bool = False
       unpickupable: bool = False
       unsalvageable: bool = False
       salvage_duration_multiplier: float = 1.0
       unsaveable: bool = False
       armor_tier: str = ""            # LOW, HIGH
       foliage_cut_radius: float = 6.0

       IGNORE: ClassVar[set[str]] = {
           "Has_Clip_Prefab",
           "Explosion",
           "Eligible_For_Pooling",
       }
   ```

2. Register: `Structure` -> `StructureProperties`.

3. Write tests using `structure_wall` fixture.

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_structures.py -v
```

### Commit message

```
feat: add StructureProperties model
```

---

## Task 12: Miscellaneous properties (misc.py)

**Goal:** Create property models for all remaining simple types: Cloud, Map, Key, Fisher, Fuel, Optic, Refill, Box, Tire, Detonator, Filter, Grower, Supply, Tool, ArrestStart, ArrestEnd, Compass, Vehicle_Repair_Tool.

### Files to create/modify

- **Create** `unturned_data/models/properties/misc.py`
- Update `unturned_data/models/properties/__init__.py`
- **Create** `unturned_data/tests/test_properties_misc.py`

### Steps

1. Create `misc.py`:

   ```python
   class CloudProperties(ItemProperties):
       """Parachute (Type=Cloud)."""
       gravity: float = 0

   class MapProperties(ItemProperties):
       """Mapping equipment (Type=Map)."""
       enables_compass: bool = False
       enables_chart: bool = False
       enables_map: bool = False

   class KeyProperties(ItemProperties):
       """Key (Type=Key)."""
       exchange_with_target_item: bool = False

   class FisherProperties(ItemProperties):
       """Fishing Pole (Type=Fisher)."""
       reward_id: int = 0

   class FuelProperties(ItemProperties):
       """Fuel Canister (Type=Fuel)."""
       fuel: int = 0

   class OpticProperties(ItemProperties):
       """Optic (Type=Optic)."""
       zoom: float = 0

   class RefillProperties(ItemProperties):
       """Refill canteen (Type=Refill)."""
       water: float = 0
       clean_health: float = 0
       salty_health: float = 0
       dirty_health: float = 0
       clean_food: float = 0
       salty_food: float = 0
       dirty_food: float = 0
       clean_water: float = 0
       salty_water: float = 0
       dirty_water: float = 0
       clean_virus: float = 0
       salty_virus: float = 0
       dirty_virus: float = 0
       clean_stamina: float = 0
       salty_stamina: float = 0
       dirty_stamina: float = 0
       clean_oxygen: float = 0
       salty_oxygen: float = 0
       dirty_oxygen: float = 0

   class BoxProperties(ItemProperties):
       """Unboxable container (Type=Box)."""
       generate: int = 0
       destroy: int = 0
       drops: int = 0
       item_origin: str = ""           # Unbox, Unwrap
       probability_model: str = ""     # Original, Equalized
       contains_bonus_items: bool = False

       IGNORE_PATTERNS: ClassVar[list[re.Pattern]] = [
           re.compile(r"^Drop_\d+$"),
       ]

   class TireProperties(ItemProperties):
       """Tire (Type=Tire)."""
       mode: str = ""                  # ADD, REMOVE

   class CompassProperties(ItemProperties):
       """Compass (Type=Compass)."""
       pass  # No additional fields

   # Types with no additional fields beyond base ItemAsset
   class DetonatorProperties(ItemProperties):
       pass

   class FilterProperties(ItemProperties):
       pass

   class GrowerProperties(ItemProperties):
       pass

   class SupplyProperties(ItemProperties):
       pass

   class ToolProperties(ItemProperties):
       pass

   class VehicleRepairToolProperties(ItemProperties):
       pass

   class ArrestStartProperties(ItemProperties):
       pass

   class ArrestEndProperties(ItemProperties):
       pass
   ```

2. Register all types in `PROPERTIES_REGISTRY`:
   ```python
   PROPERTIES_REGISTRY["Cloud"] = CloudProperties
   PROPERTIES_REGISTRY["Map"] = MapProperties
   PROPERTIES_REGISTRY["Key"] = KeyProperties
   PROPERTIES_REGISTRY["Fisher"] = FisherProperties
   PROPERTIES_REGISTRY["Fuel"] = FuelProperties
   PROPERTIES_REGISTRY["Optic"] = OpticProperties
   PROPERTIES_REGISTRY["Refill"] = RefillProperties
   PROPERTIES_REGISTRY["Box"] = BoxProperties
   PROPERTIES_REGISTRY["Tire"] = TireProperties
   PROPERTIES_REGISTRY["Compass"] = CompassProperties
   PROPERTIES_REGISTRY["Detonator"] = DetonatorProperties
   PROPERTIES_REGISTRY["Filter"] = FilterProperties
   PROPERTIES_REGISTRY["Grower"] = GrowerProperties
   PROPERTIES_REGISTRY["Supply"] = SupplyProperties
   PROPERTIES_REGISTRY["Tool"] = ToolProperties
   PROPERTIES_REGISTRY["Vehicle_Repair_Tool"] = VehicleRepairToolProperties
   PROPERTIES_REGISTRY["Arrest_Start"] = ArrestStartProperties
   PROPERTIES_REGISTRY["Arrest_End"] = ArrestEndProperties
   ```

3. Write tests: verify each class instantiates, from_raw works, empty types serialize to `{}`.

### Test command

```bash
python -m pytest unturned_data/tests/test_properties_misc.py -v
```

### Commit message

```
feat: add misc property models (Cloud, Map, Key, Fisher, Fuel, etc.)
```

---

## Task 13: Integrate properties into parse pipeline

**Goal:** Wire up the PROPERTIES_REGISTRY so that `parse_entry()` populates `entry.properties` from the appropriate Properties class. Remove the category subclass models (Gun, Clothing, etc.) and the old `parsed` computed field.

### Files to modify

- `unturned_data/categories/__init__.py`
- `unturned_data/categories/items.py` (remove or deprecate)
- `unturned_data/models/entry.py`
- `unturned_data/exporter.py`
- `unturned_data/tests/test_categories.py`
- `unturned_data/tests/test_models.py`

### Steps

1. Update `parse_entry()` in `categories/__init__.py`:
   - After creating the base `BundleEntry`, look up the type in `PROPERTIES_REGISTRY`
   - If found, call `PropertiesClass.from_raw(raw)` and set `entry.properties = props.model_dump(exclude_defaults=True)`
   - Keep using `GenericEntry` for unknown types, but now it just returns a base BundleEntry

2. Remove the `parsed` computed field from `BundleEntry` (it's replaced by `properties`).

3. Remove `DamageStats`, `ConsumableStats`, `StorageStats` from the export pipeline - their data is now captured in the flat properties dict.

4. Update `SCHEMA_C_FIELDS` in `exporter.py`:
   - Remove `"parsed"`
   - Ensure `"properties"` is present
   - Keep `"raw"` in the set (it's still a field, just excluded from export by default)

5. Keep the old category model files around but update `parse_entry()` to use `BundleEntry.from_raw()` directly instead of dispatching to subclass `from_raw()`. The category subclasses can be deprecated (deleted in a follow-up).

6. Update test files:
   - Tests that check `parsed` keys need to check `properties` keys instead
   - Tests that check `isinstance(entry, Gun)` can check `entry.type == "Gun"` and `entry.properties` contains gun fields
   - Update `TestTypeRegistry.test_all_expected_types_present` to check `PROPERTIES_REGISTRY`

7. Run the full test suite. Fix all failures caused by the structural change.

### Test command

```bash
python -m pytest unturned_data/tests/ -v
```

### Commit message

```
refactor: replace category subclass dispatch with properties registry

parse_entry() now produces BundleEntry with properties dict populated
from PROPERTIES_REGISTRY. Remove parsed computed field. Deprecate
per-type BundleEntry subclasses in favor of flat properties.
```

---

## Task 14: Update exporter — remove raw from default output, add CLI flags

**Goal:** Remove `raw` from default JSON export. Add `--include-raw`, `--strict`, `--show-ignored` CLI flags. Integrate the warning system.

### Files to modify

- `unturned_data/exporter.py`
- `unturned_data/cli.py`
- `unturned_data/tests/test_exporter.py`
- `unturned_data/tests/test_cli.py`

### Steps

1. Update `SCHEMA_C_FIELDS` to remove `"raw"`:
   ```python
   SCHEMA_C_FIELDS = {
       "guid", "type", "id", "name", "description",
       "rarity", "size_x", "size_y", "source_path",
       "useable", "slot", "can_use_underwater",
       "equipable_movement_speed_multiplier",
       "should_drop_on_death", "allow_manual_drop",
       "category", "english", "blueprints", "actions", "properties",
   }
   ```

2. Add `SCHEMA_C_FIELDS_WITH_RAW = SCHEMA_C_FIELDS | {"raw"}` for use with `--include-raw`.

3. Update `_serialize_entry()` to accept an optional `include_raw` parameter:
   ```python
   def _serialize_entry(entry: BundleEntry, include_raw: bool = False) -> dict[str, Any]:
       fields = SCHEMA_C_FIELDS_WITH_RAW if include_raw else SCHEMA_C_FIELDS
       return entry.model_dump(include=fields)
   ```

4. Thread `include_raw` through `_serialize_entries()` and `export_schema_c()`.

5. Add `FieldCoverageReport` integration to `export_schema_c()`:
   - After parsing all entries, run the report
   - Print warnings to stderr
   - If `--strict` and uncovered fields exist, `sys.exit(1)`

6. Add CLI flags to `cli.py`:
   ```python
   parser.add_argument("--include-raw", action="store_true",
       help="Include raw .dat dict in JSON output")
   parser.add_argument("--strict", action="store_true",
       help="Exit with error if uncovered .dat fields found")
   parser.add_argument("--show-ignored", action="store_true",
       help="Print intentionally-ignored fields")
   ```

7. Wire up the new flags in `main()`.

8. Update existing tests:
   - `test_exporter.py`: verify `raw` is NOT in default output
   - `test_exporter.py`: verify `raw` IS present with `include_raw=True`
   - `test_cli.py`: verify new flags are accepted

### Test command

```bash
python -m pytest unturned_data/tests/test_exporter.py unturned_data/tests/test_cli.py -v
```

### Commit message

```
feat: remove raw from default export, add --include-raw/--strict/--show-ignored

Raw dict is no longer included in JSON output by default.
Warning system reports uncovered .dat fields to stderr.
--strict makes uncovered fields fatal.
```

---

## Task 15: Remove deprecated category subclasses

**Goal:** Clean up the old per-type BundleEntry subclasses now that properties handles everything.

### Files to modify

- `unturned_data/categories/items.py` — gut the file, keep only for backward compat or delete entirely
- `unturned_data/categories/__init__.py` — simplify imports
- `unturned_data/models/entry.py` — remove `DamageStats`, `ConsumableStats`, `StorageStats` (move to a `_deprecated.py` if anything still imports them)
- Update any remaining test imports

### Steps

1. Remove `Gun`, `MeleeWeapon`, `Consumeable`, `Clothing`, `Throwable`, `BarricadeItem`, `StructureItem`, `Magazine`, `Attachment` classes from `categories/items.py`.

2. Simplify `categories/__init__.py` to only use `BundleEntry.from_raw()` + properties dispatch.

3. Remove `DamageStats`, `ConsumableStats`, `StorageStats` from `models/entry.py` (they're replaced by flat properties fields).

4. Keep `format_blueprint_ingredients` and `format_blueprint_workstations` in `models/blueprint.py` (still used by markdown formatter).

5. Update markdown formatter to work with the new properties dict instead of the old typed models.

6. Run full test suite. Delete or update any tests that reference removed classes.

### Test command

```bash
python -m pytest unturned_data/tests/ -v
```

### Commit message

```
refactor: remove deprecated category subclass models

Delete Gun, MeleeWeapon, Consumeable, Clothing, etc. subclasses.
All type-specific data is now in the flat properties dict.
Remove DamageStats, ConsumableStats, StorageStats.
```

---

## Task 16: Integration test — full re-export and validation

**Goal:** Run the full export pipeline against real game data, verify output structure, run the warning system, and fix any issues.

### Files to modify

- `unturned_data/tests/test_integration.py`
- Potentially any properties files (to fix uncovered fields found during real export)

### Steps

1. Add an integration test that runs `export_schema_c()` against the real server data (if available on the test machine) or a small representative fixture set.

2. Write a validation test that checks exported entries:
   ```python
   def test_exported_entry_has_properties():
       """Every entry in entries.json should have a properties dict."""
       # Load exported JSON
       for entry in entries:
           assert "properties" in entry
           assert isinstance(entry["properties"], dict)
           assert "raw" not in entry  # raw excluded by default

   def test_exported_entry_has_actions():
       """Every entry should have an actions list."""
       for entry in entries:
           assert "actions" in entry
           assert isinstance(entry["actions"], list)

   def test_no_parsed_field():
       """The old 'parsed' field should not appear."""
       for entry in entries:
           assert "parsed" not in entry
   ```

3. Run the export with `--strict` to find any uncovered fields. Add them to the appropriate ignore lists or property models.

4. Run the export with `--show-ignored` and review the output. Ensure nothing important is being ignored.

5. Verify the JSON output matches the expected shape from the design doc.

### Test command

```bash
# Integration test
python -m pytest unturned_data/tests/test_integration.py -v

# Full export with warnings
cd /home/guy/code/git/github.com/shitchell/unturned-data
python -m unturned_data.cli /home/guy/unturned-server -f json -o /tmp/test_export 2>&1 | head -50
```

### Commit message

```
test: add integration tests for complete export pipeline

Validate exported JSON structure, properties presence, actions list,
and absence of raw/parsed fields.
```

---

## Task 17: Re-export data

**Goal:** Run the final export against the real server data and commit the updated output.

### Steps

1. Run the full export:
   ```bash
   cd /home/guy/code/git/github.com/shitchell/unturned-data
   python -m unturned_data.cli /home/guy/unturned-server \
       -f json \
       -o /home/guy/code/git/github.com/shitchell/stuff/html/unturned/data
   ```

2. Review the output — spot check a few entries to verify properties are populated correctly.

3. Check for warnings on stderr. If any, fix the relevant properties models and re-export.

4. Commit the updated data files to the `stuff` repo.

### Test command

```bash
# Verify the export succeeded
ls -la /home/guy/code/git/github.com/shitchell/stuff/html/unturned/data/
python -c "
import json
entries = json.load(open('/home/guy/code/git/github.com/shitchell/stuff/html/unturned/data/base/entries.json'))
guns = [e for e in entries if e['type'] == 'Gun']
print(f'Total entries: {len(entries)}')
print(f'Guns: {len(guns)}')
if guns:
    g = guns[0]
    print(f'Sample gun: {g[\"name\"]}')
    print(f'  properties: {list(g.get(\"properties\", {}).keys())[:10]}...')
    print(f'  has raw: {\"raw\" in g}')
    print(f'  has actions: {\"actions\" in g}')
"
```

### Commit message (in stuff repo)

```
data: re-export unturned data with complete typed properties
```

### Commit message (in unturned-data repo)

```
feat: complete export with typed properties for all 61 item types

Adds comprehensive Pydantic models for all item types, enriched
blueprints with conditions/rewards, Action parser, and warning
system. Raw dict removed from default export.
```

---

## Summary

| Task | Description | New files | Estimated complexity |
|------|-------------|-----------|---------------------|
| 1 | Restructure models/ package | 3 | Low |
| 2 | Enrich Blueprint model | 1 fixture + tests | Medium |
| 3 | Add Action model | 2 new + 1 fixture | Medium |
| 4 | Common ItemAsset fields on BundleEntry | 0 | Low |
| 5 | Properties infrastructure + warnings | 4 new | Medium |
| 6 | Weapon properties | 1 new + tests | High (largest model) |
| 7 | Consumable properties | 1 new + tests | Low |
| 8 | Clothing properties | 1 new + tests | Medium |
| 9 | Attachment properties | 1 new + tests | Medium |
| 10 | Barricade properties | 1 new + tests | Medium |
| 11 | Structure properties | 1 new + tests | Low |
| 12 | Misc properties | 1 new + tests | Low |
| 13 | Integrate properties into pipeline | 0 (modify existing) | High |
| 14 | Update exporter + CLI flags | 0 (modify existing) | Medium |
| 15 | Remove deprecated subclasses | 0 (modify existing) | Medium |
| 16 | Integration test + validation | 1 new | Medium |
| 17 | Re-export data | 0 | Low |

**Total: 17 tasks.** Tasks 1-5 are foundational. Tasks 6-12 add per-type models (can be parallelized). Tasks 13-15 integrate and clean up. Tasks 16-17 validate and ship.
