# Exporter Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix blueprint output parsing, blueprint type classification, tag asset indexing, add `kind` field to guid index entries, and extract legacy blueprint skill/build fields.

**Architecture:** Five focused fixes in the `unturned-data` exporter: (1) fix the `Output_` vs `Product_` key mismatch in legacy blueprint parsing, (2) reclassify `Type Tool` blueprints as Salvage, (3) add a `kind` field to `GuidIndexEntry` to distinguish items/assets/tags, (4) index tag assets into guid_index.json with `kind: "tag"`, (5) extract `Skill` and `Build` fields from legacy blueprints.

**Tech Stack:** Python 3.10+ / Pydantic 2.0+ (exporter)

**Design doc:** `docs/plans/2026-02-20-crafting-map-filter-fix-design.md` (related)

---

### Task 1: Fix legacy blueprint output key (`Product_` → `Output_`)

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/models.py:236-248`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_models.py`

**Step 1: Write the failing test**

In `test_models.py`, add:

```python
class TestBlueprintLegacyOutputParsing:
    def test_parses_output_key(self):
        """Legacy blueprints use Output_N_ID, not Product_N_ID."""
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Tool",
            "Blueprint_0_Outputs": "1",
            "Blueprint_0_Output_0_ID": "36011",
            "Blueprint_0_Output_0_Amount": "3",
        }
        bps = Blueprint.list_from_raw(raw)
        assert len(bps) == 1
        assert bps[0].outputs == ["36011 x 3"]

    def test_parses_single_output(self):
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Supply",
            "Blueprint_0_Output_0_ID": "100",
            "Blueprint_0_Output_0_Amount": "1",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].outputs == ["100"]

    def test_no_outputs_craft_defaults_to_this(self):
        """Craft blueprints with no outputs should still default to 'this'."""
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Supply",
            "Blueprint_0_Supply_0_ID": "50",
            "Blueprint_0_Supply_0_Amount": "2",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].outputs == ["this"]
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintLegacyOutputParsing -v`

Expected: FAIL — `test_parses_output_key` fails because outputs are empty (parsed as "Craft" with default "this" fallback, or empty for Tool type).

**Step 3: Write implementation**

In `models.py`, change lines 240 and 243:

```python
            # Parse products (outputs)
            outputs: list[Any] = []
            j = 0
            while True:
                product_id = raw.get(f"{prefix}Output_{j}_ID")
                if product_id is None:
                    break
                amount = int(raw.get(f"{prefix}Output_{j}_Amount", 1))
                if amount > 1:
                    outputs.append(f"{product_id} x {amount}")
                else:
                    outputs.append(str(product_id))
                j += 1
```

This changes `Product_{j}_ID` → `Output_{j}_ID` and `Product_{j}_Amount` → `Output_{j}_Amount`.

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintLegacyOutputParsing -v`

Expected: PASS

**Step 5: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/models.py unturned_data/tests/test_models.py
git commit -m "fix: use Output_ key for legacy blueprint output parsing"
```

---

### Task 2: Reclassify `Type Tool` blueprints as Salvage

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/models.py:201-208`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_models.py`

**Step 1: Write the failing test**

```python
class TestBlueprintToolType:
    def test_tool_type_is_salvage(self):
        """Type Tool blueprints should be classified as Salvage."""
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Tool",
            "Blueprint_0_Output_0_ID": "36011",
            "Blueprint_0_Output_0_Amount": "3",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].name == "Salvage"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintToolType -v`

Expected: FAIL — `bps[0].name` is "Craft" not "Salvage"

**Step 3: Write implementation**

In `models.py`, line 205, change:

```python
        _TYPE_TO_NAME: dict[str, str] = {
            "Supply": "Craft",
            "Repair": "Repair",
            "Ammo": "Craft",
            "Tool": "Salvage",
            "Apparel": "Craft",
            "Refill": "Craft",
        }
```

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintToolType -v`

Expected: PASS

**Step 5: Run full test suite and fix any broken tests**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

Any tests that assert `name == "Craft"` for Tool-type blueprints will need updating.

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/models.py unturned_data/tests/test_models.py
git commit -m "fix: classify Type Tool blueprints as Salvage"
```

---

### Task 3: Add `kind` field to GuidIndexEntry

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/schema.py:87-94`
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py` (`_build_guid_index`)
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_schema.py`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Context:** Currently `GuidIndexEntry` has `file`, `index`, `id`, `type`, `name`. Adding a `kind` field (e.g., `"item"`, `"asset"`, `"tag"`) lets the JS distinguish what a GUID represents — useful for display (e.g., wrench icon for workstation tags) and prevents confusion between items and tags that happen to share similar names.

**Step 1: Write the failing test**

In `test_schema.py`, add:

```python
class TestGuidIndexEntryKind:
    def test_kind_defaults_to_empty(self):
        entry = GuidIndexEntry(file="base/entries.json", index=0)
        assert entry.kind == ""

    def test_kind_set_to_item(self):
        entry = GuidIndexEntry(file="base/entries.json", index=0, kind="item")
        assert entry.kind == "item"

    def test_kind_set_to_tag(self):
        entry = GuidIndexEntry(file="base/assets.json", index=0, kind="tag")
        assert entry.kind == "tag"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_schema.py::TestGuidIndexEntryKind -v`

Expected: FAIL — `kind` field doesn't exist on `GuidIndexEntry`

**Step 3: Write implementation**

In `schema.py`, add `kind` to `GuidIndexEntry`:

```python
class GuidIndexEntry(BaseModel):
    """Entry in guid_index.json."""

    file: str
    index: int
    id: int = 0
    type: str = ""
    name: str = ""
    kind: str = ""
```

Then in `exporter.py`, update `_build_guid_index` to set `kind` when creating entries:

In `_index_bundle_entries`, set `kind="item"`:
```python
                entries_index[entry.guid] = GuidIndexEntry(
                    file=file_path,
                    index=idx,
                    id=entry.id,
                    type=entry.type,
                    name=entry.name,
                    kind="item",
                )
```

In `_index_assets`, set `kind="asset"`:
```python
                entries_index[asset.guid] = GuidIndexEntry(
                    file=file_path,
                    index=idx,
                    id=0,
                    type=asset.csharp_type,
                    name=asset.name,
                    kind="asset",
                )
```

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_schema.py::TestGuidIndexEntryKind -v`

Expected: PASS

**Step 5: Write an exporter test to verify kind is set**

In `test_exporter.py`, add:

```python
class TestGuidIndexEntryKinds:
    def test_bundle_entries_have_kind_item(self):
        from unturned_data.exporter import _build_guid_index
        from unturned_data.models import BundleEntry

        entries = [BundleEntry(guid="aaa", type="Gun", id=1, name="X",
                               source_path="Items/Guns/X")]
        gi = _build_guid_index(entries, [], {}, "2026-01-01")
        assert gi.entries["aaa"].kind == "item"

    def test_assets_have_kind_asset(self):
        from unturned_data.exporter import _build_guid_index
        from unturned_data.schema import AssetEntry

        assets = [AssetEntry(guid="bbb", name="Test Asset",
                             csharp_type="CraftingBlacklistAsset",
                             source_path="Assets/Test.asset")]
        gi = _build_guid_index([], assets, {}, "2026-01-01")
        assert gi.entries["bbb"].kind == "asset"
```

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestGuidIndexEntryKinds -v`

**Step 6: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

**Step 7: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/schema.py unturned_data/exporter.py unturned_data/tests/test_schema.py unturned_data/tests/test_exporter.py
git commit -m "feat: add kind field to GuidIndexEntry (item/asset/tag)"
```

---

### Task 4: Index tag assets into guid_index

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/exporter.py:265-291`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_exporter.py`

**Context:** Tag `.asset` files (CraftingTag, BlueprintCategoryTag) have `GUID` and `Type` at the top level, not nested under a `Metadata` key. The current `_collect_assets` function only looks for `parsed.get("Metadata", {}).get("GUID")`, so tags are silently skipped. Additionally, `_index_assets` in `_build_guid_index` should set `kind="tag"` for tag assets (those with `csharp_type` of `"Tag"`) to distinguish them from regular assets (which get `kind="asset"` from Task 3).

**Step 1: Write the failing test**

```python
class TestCollectAssetsTagFormat:
    def test_collects_top_level_guid_assets(self, tmp_path):
        """Assets with GUID at top level (tag format) should be collected."""
        from unturned_data.exporter import _collect_assets

        tag_dir = tmp_path / "Assets" / "Tags" / "Crafting" / "Sewing"
        tag_dir.mkdir(parents=True)
        (tag_dir / "CraftingTag_Sewing.asset").write_text(
            "\ufeffGUID 2ac5ddc545a848008c0308d21f5d2e6b\nType Tag\n"
        )

        assets = _collect_assets(tmp_path)
        assert len(assets) == 1
        assert assets[0].guid == "2ac5ddc545a848008c0308d21f5d2e6b"

    def test_collects_metadata_guid_assets(self, tmp_path):
        """Assets with GUID under Metadata (standard format) should still work."""
        from unturned_data.exporter import _collect_assets

        asset_dir = tmp_path / "Assets" / "Blacklists"
        asset_dir.mkdir(parents=True)
        (asset_dir / "Test.asset").write_text(
            "Metadata\n{\n\tGUID abc123def456abc123def456abc123de\n\tType SDG.Test, Assembly\n}\n"
        )

        assets = _collect_assets(tmp_path)
        assert len(assets) == 1
        assert assets[0].guid == "abc123def456abc123def456abc123de"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestCollectAssetsTagFormat -v`

Expected: FAIL — first test returns 0 assets

**Step 3: Write implementation**

In `_collect_assets` in `exporter.py`, update the GUID/type extraction to check both locations:

```python
def _collect_assets(bundles_path: Path) -> list[AssetEntry]:
    """Collect .asset file entries from a bundles directory."""
    assets: list[AssetEntry] = []
    for asset_file in sorted(bundles_path.rglob("*.asset")):
        try:
            parsed = parse_asset_file(asset_file)
        except Exception:
            continue

        # Try Metadata-nested format first (standard .asset files),
        # then top-level format (tag .asset files)
        meta = parsed.get("Metadata", {})
        if not isinstance(meta, dict):
            meta = {}
        guid = str(meta.get("GUID", "") or parsed.get("GUID", "")).lower()
        if not guid:
            continue
        csharp_type = str(meta.get("Type", "") or parsed.get("Type", ""))
        type_short = csharp_type.split(",")[0].rsplit(".", 1)[-1] if csharp_type else ""

        # For tag assets, read the friendly name from English.dat if available
        name = asset_file.stem.replace("_", " ")
        english_dat = asset_file.parent / "English.dat"
        if english_dat.exists():
            try:
                eng_text = english_dat.read_text(encoding="utf-8-sig")
                for line in eng_text.splitlines():
                    if line.startswith("Name "):
                        name = line[5:].strip()
                        break
            except Exception:
                pass

        rel_path = str(asset_file.relative_to(bundles_path))
        assets.append(
            AssetEntry(
                guid=guid,
                name=name,
                csharp_type=type_short,
                source_path=rel_path,
                raw=parsed,
            )
        )
    return assets
```

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestCollectAssetsTagFormat -v`

Expected: PASS

**Step 5: Update `_index_assets` to set `kind="tag"` for tags**

In `_build_guid_index`'s `_index_assets` inner function, update the `kind` assignment to check the asset's `csharp_type`:

```python
    def _index_assets(
        items: list[AssetEntry],
        file_path: str,
    ) -> None:
        for idx, asset in enumerate(items):
            if asset.guid and asset.guid not in entries_index:
                kind = "tag" if asset.csharp_type == "Tag" else "asset"
                entries_index[asset.guid] = GuidIndexEntry(
                    file=file_path,
                    index=idx,
                    id=0,
                    type=asset.csharp_type,
                    name=asset.name,
                    kind=kind,
                )
```

**Step 6: Add a test for tag kind**

```python
class TestGuidIndexTagKind:
    def test_tag_assets_have_kind_tag(self):
        from unturned_data.exporter import _build_guid_index
        from unturned_data.schema import AssetEntry

        assets = [AssetEntry(guid="aaa", name="Sewing Capabilities",
                             csharp_type="Tag",
                             source_path="Assets/Tags/Crafting/Sewing/CraftingTag_Sewing.asset")]
        gi = _build_guid_index([], assets, {}, "2026-01-01")
        assert gi.entries["aaa"].kind == "tag"

    def test_non_tag_assets_have_kind_asset(self):
        from unturned_data.exporter import _build_guid_index
        from unturned_data.schema import AssetEntry

        assets = [AssetEntry(guid="bbb", name="Test Blacklist",
                             csharp_type="CraftingBlacklistAsset",
                             source_path="Assets/Blacklists/Test.asset")]
        gi = _build_guid_index([], assets, {}, "2026-01-01")
        assert gi.entries["bbb"].kind == "asset"
```

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_exporter.py::TestGuidIndexTagKind -v`

**Step 7: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

**Step 8: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/exporter.py unturned_data/tests/test_exporter.py
git commit -m "fix: index tag assets with top-level GUID and kind=tag"
```

---

### Task 5: Extract `Skill` and `Build` from legacy blueprints

**Files:**
- Modify: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/models.py:210-261`
- Test: `/home/guy/code/git/github.com/shitchell/unturned-data/unturned_data/tests/test_models.py`

**Step 1: Write the failing test**

```python
class TestBlueprintLegacySkillBuild:
    def test_extracts_skill(self):
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Supply",
            "Blueprint_0_Skill": "Cook",
            "Blueprint_0_Level": "2",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].skill == "Cook"
        assert bps[0].skill_level == 2

    def test_extracts_build(self):
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Supply",
            "Blueprint_0_Build": "Torch",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].build == "Torch"

    def test_defaults_when_missing(self):
        from unturned_data.models import Blueprint

        raw = {
            "Blueprints": "1",
            "Blueprint_0_Type": "Supply",
        }
        bps = Blueprint.list_from_raw(raw)
        assert bps[0].skill == ""
        assert bps[0].skill_level == 0
        assert bps[0].build == ""
```

**Step 2: Run test to verify it fails**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintLegacySkillBuild -v`

Expected: FAIL — `bps[0].build` doesn't exist (no `build` field on Blueprint) or skill/skill_level are empty

**Step 3: Write implementation**

First, add the `build` field to the `Blueprint` model if it doesn't already exist:

```python
class Blueprint(BaseModel):
    """A single crafting blueprint."""

    name: str = ""
    category_tag: str = ""
    operation: str = ""
    inputs: list[Any] = []
    outputs: list[Any] = []
    skill: str = ""
    skill_level: int = 0
    build: str = ""
    workstation_tags: list[str] = []
```

Then in `list_from_raw`, after parsing outputs (around line 253), add:

```python
            # Parse skill and build
            skill = str(raw.get(f"{prefix}Skill", ""))
            skill_level = int(raw.get(f"{prefix}Level", 0))
            build = str(raw.get(f"{prefix}Build", ""))

            results.append(Blueprint(
                name=name,
                inputs=inputs,
                outputs=outputs,
                skill=skill,
                skill_level=skill_level,
                build=build,
            ))
```

**Step 4: Run test to verify it passes**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/test_models.py::TestBlueprintLegacySkillBuild -v`

Expected: PASS

**Step 5: Run full test suite**

Run: `cd /home/guy/code/git/github.com/shitchell/unturned-data && python -m pytest unturned_data/tests/ -v`

**Step 6: Commit**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
git add unturned_data/models.py unturned_data/tests/test_models.py
git commit -m "feat: extract Skill, Level, and Build from legacy blueprints"
```

---

### Task 6: Re-export and verify fixes

**Step 1: Run the exporter**

```bash
cd /home/guy/code/git/github.com/shitchell/unturned-data
python -m unturned_data /home/guy/unturned-server \
    -o /home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/
```

**Step 2: Verify tag assets are now indexed**

```bash
python3 -c "
import json
with open('/home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/guid_index.json') as f:
    gi = json.load(f)
# Check the 7 known workstation tag GUIDs
tags = ['8e86b740dafc46f7bf98c5040c9b223e', '2ac5ddc545a848008c0308d21f5d2e6b',
        '7b82c125a5a54984b8bb26576b59e977', '20f30322bbcc4b01a4f116d22b24c21a',
        '68816064e2ce44839c3f35da55033cba', 'd2cc65b749e5477f95103601df89cdbc',
        '99896da563a748148460c67b9962874f']
for guid in tags:
    entry = gi['entries'].get(guid)
    print(f'{guid}: {entry[\"name\"] if entry else \"MISSING\"}')"
```

Expected: All 7 tags should resolve to friendly names (e.g., "Sewing Capabilities").

**Step 3: Verify Jackhammer blueprints are fixed**

```bash
python3 -c "
import json
with open('/home/guy/code/git/github.com/shitchell/stuff/site/unturned/data/maps/a6_polaris/entries.json') as f:
    entries = json.load(f)
for e in entries:
    if 'jackhammer' in e.get('name','').lower():
        print(f'{e[\"name\"]}:')
        for bp in e.get('blueprints', []):
            print(f'  {bp[\"name\"]}: inputs={bp[\"inputs\"]} outputs={bp[\"outputs\"]}')"
```

Expected: Jackhammer blueprints should show `name: "Salvage"` with actual output items, not `name: "Craft"` with `outputs: ["this"]`.

**Step 4: Do NOT commit** — report back with results.

---

## Execution Notes

- All tasks are in the `unturned-data` repo at `/home/guy/code/git/github.com/shitchell/unturned-data/`
- Task 5 bridges to `stuff` repo for re-export verification
- Work on branch `feat/blueprint-id-resolution` or a new branch as appropriate
- Tasks 1 and 2 both modify `models.py` but different sections — run sequentially
- Task 3 modifies `schema.py` and `exporter.py` — independent of Tasks 1-2
- Task 4 modifies `exporter.py` — depends on Task 3 (uses `kind` field)
- Task 5 modifies `models.py` — independent of Tasks 3-4
