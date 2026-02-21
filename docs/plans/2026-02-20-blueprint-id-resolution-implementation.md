# Blueprint ID Resolution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix blueprint numeric ID resolution so the crafting graph displays correct recipes, especially for map-specific items like Snowberry Jam Sandwich.

**Architecture:** Post-processing pass in the Python exporter converts numeric IDs to GUIDs in blueprint inputs/outputs. The `by_id` section of `guid_index.json` becomes namespace+source grouped. JS cleanup removes the dead numeric ID resolution path and updates `by_id` accessors.

**Tech Stack:** Python 3.10+ / Pydantic 2.0+ (exporter), vanilla JS (frontend)

**Design doc:** `docs/plans/2026-02-20-blueprint-id-resolution-design.md`

---

### Task 1: Update GuidIndex schema for namespace+source grouped `by_id`

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/schema.py:97-103`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_schema.py`

**Step 1: Write the failing test**

In `test_schema.py`, add:

```python
class TestGuidIndexByIdFormat:
    def test_by_id_namespace_source_grouped(self):
        """by_id should nest namespace -> source -> guid."""
        gi = GuidIndex(
            total_entries=1,
            generated_at="2026-01-01",
            entries={},
            by_id={
                "36033": {
                    "items": {"base": "27b44ccf4da14c2987a4b5903557ad78"},
                    "spawns": {"base": "def456"},
                }
            },
        )
        assert gi.by_id["36033"]["items"]["base"] == "27b44ccf4da14c2987a4b5903557ad78"
        assert gi.by_id["36033"]["spawns"]["base"] == "def456"

    def test_by_id_empty(self):
        gi = GuidIndex(total_entries=0, generated_at="", entries={}, by_id={})
        assert gi.by_id == {}
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_schema.py::TestGuidIndexByIdFormat -v`

Expected: FAIL — Pydantic validation error because `by_id` is typed as `dict[str, str]` but we're passing nested dicts.

**Step 3: Write minimal implementation**

In `schema.py`, change line 103:

```python
# Old:
by_id: dict[str, str] = {}

# New:
by_id: dict[str, dict[str, dict[str, str]]] = {}
```

Type is `{numeric_id: {namespace: {source: guid}}}`.

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_schema.py::TestGuidIndexByIdFormat -v`

Expected: PASS

**Step 5: Fix any broken existing tests**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

Any tests that construct `GuidIndex` with the old `by_id` format will need updating to the new nested format. Fix them.

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/schema.py unturned_data/tests/test_schema.py
git commit -m "feat: update GuidIndex by_id to namespace+source grouped format"
```

---

### Task 2: Update `_build_guid_index` to produce namespace+source grouped `by_id`

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py:247-305`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Context:** The `_build_guid_index` function currently builds `by_id` as a flat `{id_str: guid}` dict with last-write-wins. It needs to:
1. Determine namespace from `entry.source_path` (first path component: `Items/` -> `items`, `Vehicles/` -> `vehicles`, etc.)
2. Determine source from the `file_path` parameter (e.g., `"base/entries.json"` -> `"base"`, `"maps/a6_polaris/entries.json"` -> `"a6_polaris"`)
3. Build nested `{id_str: {namespace: {source: guid}}}` with no collisions

**Step 1: Write the failing test**

In `test_exporter.py`, add:

```python
class TestBuildGuidIndexByIdFormat:
    def test_by_id_namespace_source_grouped(self):
        """by_id should group by namespace and source."""
        from unturned_data.exporter import _build_guid_index
        from unturned_data.models import BundleEntry

        entries = [
            BundleEntry(guid="aaa", type="Gun", id=100, name="Eaglefire",
                        source_path="Items/Guns/Eaglefire"),
            BundleEntry(guid="bbb", type="Spawn", id=100, name="Spawn 100",
                        source_path="Spawns/Spawn_100"),
            BundleEntry(guid="ccc", type="Vehicle", id=100, name="Tank",
                        source_path="Vehicles/Tank"),
        ]
        gi = _build_guid_index(entries, [], {}, "2026-01-01")

        assert gi.by_id["100"]["items"]["base"] == "aaa"
        assert gi.by_id["100"]["spawns"]["base"] == "bbb"
        assert gi.by_id["100"]["vehicles"]["base"] == "ccc"

    def test_by_id_map_source(self):
        """Map entries should use map safe name as source."""
        from unturned_data.exporter import _build_guid_index
        from unturned_data.models import BundleEntry

        base = [BundleEntry(guid="aaa", type="Gun", id=100, name="Eaglefire",
                            source_path="Items/Guns/Eaglefire")]
        map_entries = [BundleEntry(guid="bbb", type="Food", id=100,
                                   name="Bread", source_path="Items/Edible/Bread")]
        gi = _build_guid_index(base, [], {"a6_polaris": (map_entries, [])}, "2026-01-01")

        assert gi.by_id["100"]["items"]["base"] == "aaa"
        assert gi.by_id["100"]["items"]["a6_polaris"] == "bbb"

    def test_by_id_skips_id_zero(self):
        """ID 0 is a cosmetics dumping ground and should be excluded from by_id."""
        from unturned_data.exporter import _build_guid_index
        from unturned_data.models import BundleEntry

        entries = [BundleEntry(guid="aaa", type="Hat", id=0, name="Cool Hat",
                               source_path="Items/Hats/Cool_Hat")]
        gi = _build_guid_index(entries, [], {}, "2026-01-01")
        assert "0" not in gi.by_id
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestBuildGuidIndexByIdFormat -v`

Expected: FAIL

**Step 3: Write implementation**

Add a namespace-detection helper and update `_build_guid_index` in `exporter.py`:

```python
# Namespace mapping: top-level source directory -> namespace key
_SOURCE_DIR_TO_NAMESPACE: dict[str, str] = {
    "Items": "items",
    "Vehicles": "vehicles",
    "Objects": "objects",
    "Spawns": "spawns",
    "Animals": "animals",
    "Effects": "effects",
    "Trees": "resources",
    "Skins": "skins",
    "Mythics": "mythics",
    "NPCs": "npcs",
}


def _get_namespace(source_path: str) -> str:
    """Derive the asset namespace from source_path's top-level directory."""
    top_dir = source_path.split("/")[0] if source_path else ""
    return _SOURCE_DIR_TO_NAMESPACE.get(top_dir, top_dir.lower())
```

Update `_build_guid_index`:
- Change `by_id: dict[str, str] = {}` to `by_id: dict[str, dict[str, dict[str, str]]] = {}`
- Change the `_index_bundle_entries` inner function to accept a `source_label` parameter (e.g., `"base"` or a map safe name)
- Replace `by_id[str(entry.id)] = entry.guid` with:
  ```python
  if entry.id:
      id_str = str(entry.id)
      ns = _get_namespace(entry.source_path)
      if id_str not in by_id:
          by_id[id_str] = {}
      if ns not in by_id[id_str]:
          by_id[id_str][ns] = {}
      by_id[id_str][ns][source_label] = entry.guid
  ```
- Skip ID 0 entries
- Pass `"base"` when indexing base entries, map safe name when indexing map entries

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestBuildGuidIndexByIdFormat -v`

Expected: PASS

**Step 5: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

Fix any tests broken by the signature change.

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/exporter.py unturned_data/tests/test_exporter.py
git commit -m "feat: build namespace+source grouped by_id in guid index"
```

---

### Task 3: Add synthetic GUID generation for GUID-less entries

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Step 1: Write the failing test**

```python
class TestSyntheticGuids:
    def test_generates_synthetic_for_guidless_entry(self):
        from unturned_data.exporter import _ensure_guids
        from unturned_data.models import BundleEntry

        entries = [BundleEntry(guid="", type="Gun", id=42, name="No GUID Gun",
                               source_path="Items/Guns/NoGuid")]
        _ensure_guids(entries, "base")
        assert entries[0].guid.startswith("00000")
        assert len(entries[0].guid) == 32

    def test_synthetic_guid_is_deterministic(self):
        from unturned_data.exporter import _ensure_guids
        from unturned_data.models import BundleEntry

        e1 = [BundleEntry(guid="", type="Gun", id=42, name="X",
                          source_path="Items/Guns/X")]
        e2 = [BundleEntry(guid="", type="Gun", id=42, name="X",
                          source_path="Items/Guns/X")]
        _ensure_guids(e1, "base")
        _ensure_guids(e2, "base")
        assert e1[0].guid == e2[0].guid

    def test_does_not_overwrite_existing_guid(self):
        from unturned_data.exporter import _ensure_guids
        from unturned_data.models import BundleEntry

        entries = [BundleEntry(guid="realguid123", type="Gun", id=42,
                               name="Has GUID", source_path="Items/Guns/X")]
        _ensure_guids(entries, "base")
        assert entries[0].guid == "realguid123"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestSyntheticGuids -v`

Expected: FAIL — `_ensure_guids` not defined

**Step 3: Write implementation**

Add to `exporter.py`:

```python
import hashlib

def _ensure_guids(entries: list[BundleEntry], source: str) -> None:
    """Assign deterministic synthetic GUIDs to entries that lack one.

    Synthetic GUIDs start with '00000' to distinguish them from real GUIDs.
    """
    for entry in entries:
        if not entry.guid:
            hash_input = f"{source}:{entry.type}:{entry.id}"
            digest = hashlib.sha256(hash_input.encode()).hexdigest()
            entry.guid = "00000" + digest[:27]
```

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestSyntheticGuids -v`

Expected: PASS

**Step 5: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/exporter.py unturned_data/tests/test_exporter.py
git commit -m "feat: add synthetic GUID generation for GUID-less entries"
```

---

### Task 4: Add blueprint ID-to-GUID resolution post-processing

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Context:** This is the core fix. After all entries are parsed and GUIDs ensured, walk all blueprints and resolve numeric IDs to GUIDs.

**Step 1: Write the failing tests**

```python
class TestResolveBlueprintIds:
    def test_resolves_numeric_id_to_guid(self):
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        bread = BundleEntry(guid="bread-guid", type="Food", id=36033,
                            name="Bread", source_path="Items/Edible/Bread")
        sandwich = BundleEntry(
            guid="sandwich-guid", type="Food", id=36079,
            name="Sandwich", source_path="Items/Edible/Sandwich",
            blueprints=[Blueprint(name="Craft", inputs=["36033"], outputs=["this"])],
        )
        _resolve_blueprint_ids([bread, sandwich], "base")
        assert sandwich.blueprints[0].inputs == ["bread-guid"]
        assert sandwich.blueprints[0].outputs == ["this"]

    def test_resolves_numeric_id_with_quantity(self):
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        berry = BundleEntry(guid="berry-guid", type="Water", id=36022,
                            name="Berry", source_path="Items/Edible/Berry")
        sandwich = BundleEntry(
            guid="sandwich-guid", type="Food", id=36079,
            name="Sandwich", source_path="Items/Edible/Sandwich",
            blueprints=[Blueprint(name="Craft", inputs=["36022 x 5"],
                                  outputs=["this"])],
        )
        _resolve_blueprint_ids([berry, sandwich], "base")
        assert sandwich.blueprints[0].inputs == ["berry-guid x 5"]

    def test_leaves_guid_unchanged(self):
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        entry = BundleEntry(
            guid="aaa", type="Gun", id=1, name="X",
            source_path="Items/Guns/X",
            blueprints=[Blueprint(name="Craft",
                                  inputs=["abcdef1234567890abcdef1234567890"],
                                  outputs=["this"])],
        )
        _resolve_blueprint_ids([entry], "base")
        assert entry.blueprints[0].inputs == ["abcdef1234567890abcdef1234567890"]

    def test_leaves_this_unchanged(self):
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        entry = BundleEntry(
            guid="aaa", type="Gun", id=1, name="X",
            source_path="Items/Guns/X",
            blueprints=[Blueprint(name="Craft", inputs=["100"],
                                  outputs=["this"])],
        )
        item = BundleEntry(guid="bbb", type="Melee", id=100, name="Y",
                           source_path="Items/Melee/Y")
        _resolve_blueprint_ids([entry, item], "base")
        assert entry.blueprints[0].outputs == ["this"]

    def test_prefers_items_namespace(self):
        """When a numeric ID collides across namespaces, items should win."""
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        item = BundleEntry(guid="item-guid", type="Food", id=100,
                           name="Food Item", source_path="Items/Edible/Food")
        spawn = BundleEntry(guid="spawn-guid", type="Spawn", id=100,
                            name="Spawn 100", source_path="Spawns/Spawn_100")
        recipe = BundleEntry(
            guid="recipe-guid", type="Food", id=200,
            name="Recipe", source_path="Items/Edible/Recipe",
            blueprints=[Blueprint(name="Craft", inputs=["100"],
                                  outputs=["this"])],
        )
        _resolve_blueprint_ids([item, spawn, recipe], "base")
        assert recipe.blueprints[0].inputs == ["item-guid"]

    def test_warns_on_unresolvable_id(self, caplog):
        """Unresolvable IDs should log a warning and stay as-is."""
        import logging
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        entry = BundleEntry(
            guid="aaa", type="Gun", id=1, name="X",
            source_path="Items/Guns/X",
            blueprints=[Blueprint(name="Craft", inputs=["99999"],
                                  outputs=["this"])],
        )
        with caplog.at_level(logging.WARNING):
            _resolve_blueprint_ids([entry], "base")
        assert entry.blueprints[0].inputs == ["99999"]
        assert "99999" in caplog.text

    def test_resolves_tool_dict_input(self):
        """Tool inputs are dicts with ID key — should also be resolved."""
        from unturned_data.exporter import _resolve_blueprint_ids
        from unturned_data.models import Blueprint, BundleEntry

        tool = BundleEntry(guid="tool-guid", type="Melee", id=76,
                           name="Saw", source_path="Items/Melee/Saw")
        entry = BundleEntry(
            guid="aaa", type="Structure", id=1, name="X",
            source_path="Items/Structures/X",
            blueprints=[Blueprint(name="Craft",
                                  inputs=[{"ID": "76", "Amount": 1,
                                           "Delete": False}],
                                  outputs=["this"])],
        )
        _resolve_blueprint_ids([tool, entry], "base")
        assert entry.blueprints[0].inputs[0]["ID"] == "tool-guid"
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestResolveBlueprintIds -v`

Expected: FAIL — `_resolve_blueprint_ids` not defined

**Step 3: Write implementation**

Add to `exporter.py`:

```python
import logging
import re as _re

logger = logging.getLogger(__name__)

_GUID_RE = re.compile(r"^[0-9a-f]{32}$")


def _resolve_blueprint_ids(
    entries: list[BundleEntry],
    source: str,
    extra_entries: list[BundleEntry] | None = None,
) -> None:
    """Resolve numeric IDs in blueprint inputs/outputs to GUIDs.

    Builds an item-only ID->GUID map from all provided entries, then walks
    every blueprint reference and replaces numeric IDs with GUIDs.

    Resolution priority:
    1. Same namespace (items) + same source
    2. Same namespace (items) + any source
    3. Any namespace + same source (with warning)
    4. Any namespace + any source (with warning)

    Args:
        entries: The entries to process (blueprints will be mutated in-place).
        source: Source label for these entries (e.g., "base" or map safe name).
        extra_entries: Additional entries for cross-source resolution (e.g.,
            base entries when resolving a map's blueprints).
    """
    # Build lookup: {numeric_id: {namespace: {source_label: guid}}}
    id_map: dict[int, dict[str, dict[str, str]]] = {}

    def _index(entry_list: list[BundleEntry], src: str) -> None:
        for e in entry_list:
            if not e.id or e.id == 0 or not e.guid:
                continue
            ns = _get_namespace(e.source_path)
            if e.id not in id_map:
                id_map[e.id] = {}
            if ns not in id_map[e.id]:
                id_map[e.id][ns] = {}
            id_map[e.id][ns][src] = e.guid

    _index(entries, source)
    if extra_entries:
        for e in extra_entries:
            _index([e], "base")

    def _resolve_id(numeric_id: int, entry_name: str, bp_name: str) -> str | None:
        """Resolve a numeric ID to a GUID using priority chain."""
        ns_map = id_map.get(numeric_id)
        if not ns_map:
            return None

        # Priority 1: items namespace, same source
        if "items" in ns_map and source in ns_map["items"]:
            return ns_map["items"][source]
        # Priority 2: items namespace, any source
        if "items" in ns_map:
            return next(iter(ns_map["items"].values()))
        # Priority 3: any namespace, same source (warn)
        for ns, sources in ns_map.items():
            if source in sources:
                logger.warning(
                    "Blueprint ref %d in %s/%s resolved to non-item "
                    "namespace '%s'", numeric_id, entry_name, bp_name, ns)
                return sources[source]
        # Priority 4: any namespace, any source (warn)
        for ns, sources in ns_map.items():
            guid = next(iter(sources.values()))
            logger.warning(
                "Blueprint ref %d in %s/%s resolved to non-item "
                "namespace '%s' (cross-source)", numeric_id, entry_name,
                bp_name, ns)
            return guid
        return None

    def _resolve_ref(ref: Any, entry_name: str, bp_name: str) -> Any:
        """Resolve a single blueprint input/output reference."""
        if isinstance(ref, dict):
            # Tool dict: {"ID": "76", "Amount": 1, "Delete": False}
            ref_id = ref.get("ID", "")
            if isinstance(ref_id, str) and ref_id.isdigit():
                guid = _resolve_id(int(ref_id), entry_name, bp_name)
                if guid:
                    ref = dict(ref)  # copy to avoid mutating shared dicts
                    ref["ID"] = guid
            return ref

        if not isinstance(ref, str):
            return ref
        if ref == "this":
            return ref

        # Parse "ID" or "ID x N"
        parts = ref.split(" x ")
        id_str = parts[0].strip()

        # Already a GUID?
        if _GUID_RE.match(id_str):
            return ref

        # Numeric ID?
        if id_str.isdigit():
            guid = _resolve_id(int(id_str), entry_name, bp_name)
            if guid:
                if len(parts) > 1:
                    return f"{guid} x {parts[1].strip()}"
                return guid
            else:
                logger.warning(
                    "Unresolvable blueprint ref ID %s in %s/%s",
                    id_str, entry_name, bp_name)
        return ref

    # Walk all entries and resolve
    for entry in entries:
        for bp in entry.blueprints:
            bp.inputs = [_resolve_ref(r, entry.name, bp.name) for r in bp.inputs]
            bp.outputs = [_resolve_ref(r, entry.name, bp.name) for r in bp.outputs]
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestResolveBlueprintIds -v`

Expected: PASS

**Step 5: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/exporter.py unturned_data/tests/test_exporter.py
git commit -m "feat: add blueprint ID-to-GUID resolution post-processing"
```

---

### Task 5: Wire resolution into `export_schema_c` pipeline

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py:308-402`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Context:** Call `_ensure_guids` and `_resolve_blueprint_ids` in the main export pipeline, after parsing and before serialization.

**Step 1: Write the failing test**

```python
class TestExportPipelineResolution:
    def test_exported_blueprints_contain_guids(self, tmp_path):
        """End-to-end: exported JSON should have GUIDs in blueprints, not numeric IDs."""
        import json
        from unturned_data.exporter import export_schema_c

        # Create a minimal fixture with two items and a legacy blueprint
        items_dir = tmp_path / "bundles" / "Items" / "Edible"

        bread_dir = items_dir / "Bread"
        bread_dir.mkdir(parents=True)
        (bread_dir / "Bread.dat").write_text(
            "GUID 27b44ccf4da14c2987a4b5903557ad78\nType Food\nID 36033\n")
        (bread_dir / "English.dat").write_text("Name Bread\n")

        sandwich_dir = items_dir / "Sandwich"
        sandwich_dir.mkdir(parents=True)
        (sandwich_dir / "Sandwich.dat").write_text(
            "GUID 1fc347d9086f43c18c20fecdd9c02b39\nType Food\nID 36079\n"
            "Blueprints 1\nBlueprint_0_Type Supply\n"
            "Blueprint_0_Supply_0_ID 36033\nBlueprint_0_Supply_0_Amount 1\n")
        (sandwich_dir / "English.dat").write_text("Name Sandwich\n")

        out = tmp_path / "output"
        export_schema_c(tmp_path / "bundles", [], out)

        entries = json.loads((out / "base" / "entries.json").read_text())
        sandwich = next(e for e in entries if e["name"] == "Sandwich")
        assert sandwich["blueprints"][0]["inputs"] == [
            "27b44ccf4da14c2987a4b5903557ad78"
        ]
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestExportPipelineResolution -v`

Expected: FAIL — blueprints still contain `"36033"` instead of the GUID

**Step 3: Write implementation**

In `export_schema_c()`, add the resolution calls after parsing and before serialization. The key changes:

```python
def export_schema_c(...):
    ...
    # --- Base entries ---
    base_entries = _parse_entries(base_bundles)
    _ensure_guids(base_entries, "base")
    _resolve_blueprint_ids(base_entries, "base")
    base_serialized = _serialize_entries(base_entries)
    ...

    for map_dir in map_dirs:
        ...
        map_entries: list[BundleEntry] = []
        if map_bundles.is_dir():
            map_entries = _parse_entries(map_bundles)
            safe = _safe_name(map_dir.name)
            _ensure_guids(map_entries, safe)
            _resolve_blueprint_ids(map_entries, safe, extra_entries=base_entries)
        ...
```

Note: map entries pass `extra_entries=base_entries` so cross-source references (e.g., A6 Polaris items referencing base game Metal Scrap) resolve correctly.

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestExportPipelineResolution -v`

Expected: PASS

**Step 5: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/exporter.py unturned_data/tests/test_exporter.py
git commit -m "feat: wire blueprint resolution into export pipeline"
```

---

### Task 6: Re-export data and verify Snowberry Jam Sandwich

**Files:**
- Data output: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/`
- Source: `/home/guy/unturned-server/` (on localAI, or local copy)

**Step 1: Run the exporter**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
python -m unturned_data /home/guy/unturned-server \
    -o /home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/
```

**Step 2: Verify the Snowberry Jam Sandwich**

```bash
python3 -c "
import json
with open('/home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/maps/a6_polaris/entries.json') as f:
    entries = json.load(f)
for e in entries:
    if 'snowberry jam' in e.get('name','').lower():
        print(f'Name: {e[\"name\"]}')
        for bp in e.get('blueprints', []):
            print(f'  Inputs: {bp[\"inputs\"]}')
            print(f'  Outputs: {bp[\"outputs\"]}')
"
```

Expected: Inputs should contain GUIDs (32-char hex strings), not numeric IDs like `"36033"`.

**Step 3: Verify `by_id` format**

```bash
python3 -c "
import json
with open('/home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/guid_index.json') as f:
    gi = json.load(f)
sample = gi['by_id'].get('36033', {})
print(json.dumps(sample, indent=2))
"
```

Expected: Nested `{namespace: {source: guid}}` format.

**Step 4: Commit re-exported data**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/data/
git commit -m "data: re-export with resolved blueprint GUIDs and grouped by_id"
```

---

### Task 7: JS cleanup — update `parseBlueprintRef` and `resolveId`

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js:87-98` (resolveId)
- Modify: `/home/guy/code/git/github.com/shitchell/stuff/site/unturned/js/common.js:889-920` (parseBlueprintRef)

**Step 1: Update `resolveId`**

In `common.js`, change `resolveId` to support the new namespace+source format:

```js
async resolveId(numericId, namespace = 'items', source = null) {
    const gi = await this.getGuidIndex();
    const nsMap = gi.by_id[String(numericId)]?.[namespace];
    if (!nsMap) return null;
    const guid = source ? (nsMap[source] || Object.values(nsMap)[0])
                        : Object.values(nsMap)[0];
    if (!guid) return null;
    return gi.entries[guid] || null;
},
```

**Step 2: Update `parseBlueprintRef`**

In `common.js`, replace the numeric ID resolution in `parseBlueprintRef` with a warning:

```js
function parseBlueprintRef(ref, ownerGuid, guidIndex) {
  if (typeof ref === 'string') {
    if (ref === 'this' || ref.startsWith('this ')) {
      const qty = ref.includes(' x ') ? parseInt(ref.split(' x ')[1]) : 1;
      return { guid: ownerGuid, quantity: qty, isTool: false };
    }
    const parts = ref.split(' x ');
    let guid = parts[0];
    const qty = parts.length > 1 ? parseInt(parts[1]) : 1;
    // Numeric IDs should have been resolved by the exporter.
    // If we see one here, warn — it means the exporter missed it.
    if (/^\d+$/.test(guid)) {
      console.warn(`[CRAFTING] Unresolved numeric ID in blueprint ref: ${guid}`);
      const resolved = guidIndex.by_id[guid]?.items;
      if (resolved) {
        guid = Object.values(resolved)[0];
      } else {
        return null;
      }
    }
    return { guid, quantity: qty, isTool: false };
  }
  if (typeof ref === 'object' && ref.ID) {
    let guid = ref.ID;
    if (guid === 'this') guid = ownerGuid;
    else if (/^\d+$/.test(guid)) {
      console.warn(`[CRAFTING] Unresolved numeric ID in tool ref: ${guid}`);
      const resolved = guidIndex.by_id[guid]?.items;
      if (resolved) {
        guid = Object.values(resolved)[0];
      } else {
        return null;
      }
    }
    const isTool = ref.Delete === false;
    return { guid, quantity: ref.Amount || 1, isTool };
  }
  return null;
}
```

Note: We keep a lightweight fallback (with warning) rather than just returning null, so the page degrades gracefully if the exporter misses something.

**Step 3: Verify no other `by_id` usage is broken**

Check all `by_id` references in the JS codebase. The `resolveId` function is the main accessor; `parseBlueprintRef` accesses it directly. Both are now updated.

**Step 4: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
git add site/unturned/js/common.js
git commit -m "fix: update JS to use namespace+source grouped by_id format"
```

---

### Task 8: End-to-end verification

**Step 1: Serve the site locally**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff/site
python3 -m http.server 8080
```

**Step 2: Test the crafting page**

Open `http://localhost:8080/unturned/crafting/` in a browser.

Verify:
- [ ] Search for "Snowberry Jam Sandwich" — it should appear as a node
- [ ] Switch to Diagram mode and click it — should show correct recipe tree (Bread + Crushed Snowberry)
- [ ] Enable A6 Polaris map filter — recipes should still work
- [ ] Check browser console for any `[CRAFTING] Unresolved numeric ID` warnings (should be zero)
- [ ] Check that other recipes still work (base game items like Wooden Plate, Metal Rifle, etc.)

**Step 3: Test the catalog page**

Open `http://localhost:8080/unturned/catalog/` in a browser.

Verify:
- [ ] Items still display correctly
- [ ] Map filtering still works
- [ ] No console errors

**Step 4: Run playwright tests if available**

```bash
cd /home/guy/code/git/github.com/shitchell/stuff
npx playwright test tests/catalog-custom-tables.spec.mjs
```

**Step 5: Final commit if any fixes were needed**

---

## Execution Notes

- Tasks 1-5 are in the `unturned-data` repo at `/home/guy/code/git/github.com/shitchell/unturned-data/`
- Tasks 6-8 are in the `stuff` repo at `/home/guy/code/git/github.com/shitchell/stuff/`
- Task 6 bridges both repos (re-export from unturned-data into stuff)
- The exporter may need to be run from a machine with access to the Unturned server files (localAI or a local copy)
