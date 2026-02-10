# Supervisor Handoff — 3D Interactive Scenes

**Date:** 2026-02-10
**Status:** Round 3 in progress (5 agents running)

## What This Project Is

Building 4 interactive 3D screensaver pages for stuff.shitchell.com with a shared ES module library. Full design at `docs/plans/2026-02-10-3d-scenes-design.md`, implementation plan at `docs/plans/2026-02-10-3d-scenes-implementation.md`.

## Your Role

You are a **supervisor only**. You do NOT write code. You launch Task subagents, review their output, and manage the task list. The user explicitly requested this pattern.

## Current State

### Completed Tasks
- **Task 1:** Project setup (vendor files, CSS, package.json, directories) ✅
- **Task 2:** SceneManager + camera factories (`docs/3d/lib/core/scene.js`, `camera.js`, test page) ✅
- **Task 3:** SettingsPanel (`docs/3d/lib/ui/settings.js`) ✅
- **Task 4:** ChromeController (`docs/3d/lib/ui/chrome.js`) ✅
- **Task 5:** Math + Color utilities (`docs/3d/lib/utils/math.js`, `color.js`) ✅
- **Task 6:** Line Walker scene (`docs/3d/scenes/line-walker/`) ✅
- **Task 8:** Simplex Noise (`docs/3d/lib/utils/noise.js`) ✅
- **Task 10:** Shader utility (`docs/3d/lib/utils/shader.js`) ✅

### Currently Running (Round 3 — launched in parallel)
- **Task 7:** Lorenz Attractor scene (agent a85cf24)
- **Task 9:** Wireframe Flythrough scene (agent ac1329a)
- **Task 11:** Reaction-Diffusion scene (agent a8cba36)
- **Task 12:** AutoCamera (agent a2f8137)

### Not Yet Started
- **Task 13:** Integrate AutoCamera into all 4 scenes (blocked by 6,7,9,11,12)
- **Task 14:** Dev tooling — diagrams, validation, commit hook (blocked by 13, lower priority)
- **Task 15:** ARCHITECTURE.md + index page update (blocked by 14)

### Task Dependencies (use TaskList / TaskGet to see current state)
Track via the built-in task system (IDs #1-#15). Dependencies are already set up with blockedBy relationships.

## How to Prompt Subagents

### Pattern used for all tasks:

```
You are implementing Task N of a 3D interactive scenes project.

## Project root: `/home/guy/code/git/github.com/shitchell/stuff`

## What to do

Read the implementation plan at `docs/plans/2026-02-10-3d-scenes-implementation.md` — specifically **Task N**. Also read `docs/plans/<component>.planning.md` for requirements context.

[Specific file list to create]

KEY DETAILS:
[Call out the non-obvious requirements, gotchas, and amendments]

## Important
- Do NOT commit. Just create files.
- Follow the plan code EXACTLY.
```

### Key things to emphasize in prompts:
1. **Import map** — every HTML page needs `"three"`, `"three/addons/"`, AND `"lil-gui"` in the import map
2. **No commits** — agents create files only; you can batch-commit after review
3. **Planning docs** — point agents to the relevant `*.planning.md` file for verbatim user requirements
4. **Amendments** — the implementation plan was amended after initial writing. Key fixes: color modes, preset/slider locking, camera behavior, AutoCamera target interface, F-key fix, pause toggles, trail length, horizon glow, settings greying out. These are all in the plan now but worth calling out explicitly.

## When Round 3 Agents Complete

1. **Check each agent's output** — read the completion summary
2. **Mark tasks completed** via `TaskUpdate`
3. **Quick-verify key files exist** — `ls` the scene directories
4. **Launch Task 13** (AutoCamera integration) — this modifies all 4 scene main.js files

### Task 13 Prompt Template:

```
You are implementing Task 13 of a 3D interactive scenes project.

Project root: `/home/guy/code/git/github.com/shitchell/stuff`

Read the implementation plan at `docs/plans/2026-02-10-3d-scenes-implementation.md` — specifically Task 13.
Also read `docs/plans/auto-camera.planning.md`.

You must MODIFY (not create) these 4 existing files:
- docs/3d/scenes/line-walker/main.js
- docs/3d/scenes/lorenz/main.js
- docs/3d/scenes/wireframe-flythrough/main.js
- docs/3d/scenes/reaction-diffusion/main.js

For each, add:
1. Import AutoCamera from '../../lib/core/auto-camera.js'
2. Three auto-camera settings (toggle, slider, dropdown)
3. AutoCamera instance with scene-specific target function (see table in plan)
4. updateAutoCamUI() function for greying out dependent settings
5. Timer wiring with ChromeController's onActive callback
6. autoCamera.update(dt) in the render loop

Scene-specific targets (return { position, direction? }):
- line-walker: drift mode, () => ({ position: walker.tip })
- lorenz: orbit mode, () => ({ position: new THREE.Vector3(0, 0, 25) })
- wireframe-flythrough: follow mode, () => ({ position: mgr.camera.position.clone(), direction: new THREE.Vector3(0, 0, -1) })
- reaction-diffusion: orbit mode, () => ({ position: new THREE.Vector3(0, 0, 0) })

IMPORTANT: Read each main.js FIRST to understand the existing code, then add the auto-camera code. Do not overwrite existing functionality.
```

## After Task 13

- **Task 14** (dev tooling) — user said this is lower priority. The plan is intentionally less detailed. Prompt the agent with the plan + `dev-tooling.planning.md`.
- **Task 15** (ARCHITECTURE.md + index) — straightforward. Update `docs/index.html` to add scene links. Write `docs/3d/ARCHITECTURE.md`. Remove `docs/3d/scenes/_test/`.

## After All Tasks

- Do a comprehensive review: `ls -R docs/3d/scenes/ docs/3d/lib/`
- Consider a batch commit of everything
- The user may want to serve and test: `npx serve docs`
- No git push unless user asks

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/plans/2026-02-10-3d-scenes-design.md` | Approved design (with amendments section) |
| `docs/plans/2026-02-10-3d-scenes-implementation.md` | Full implementation plan with code |
| `docs/plans/requirements-traceability.md` | All requirements mapped to plan |
| `docs/plans/*.planning.md` | Per-component requirements with verbatim user quotes |
| `docs/plans/SUPERVISOR.md` | This file |

## User Preferences

- User goes by "guy"
- Does not want the supervisor writing code — only launching agents and reviewing
- Values thorough planning and documentation
- Cares deeply about alignment between requirements and implementation
- Explicit about wanting DRY, modular, parameterized code
- Prefers honest assessment of gaps over optimistic handwaving
