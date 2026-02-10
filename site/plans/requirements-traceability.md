# Requirements Traceability Report

**Date:** 2026-02-10
**Conversation:** Planning session for 3D Interactive Scenes
**Design Doc:** `site/plans/2026-02-10-3d-scenes-design.md`
**Implementation Plan:** `site/plans/2026-02-10-3d-scenes-implementation.md`

---

## Summary Statistics

| Category | Count |
|----------|-------|
| USER-REQ (explicit user requirements) | 11 |
| USER-CONFIRMED (Claude proposals approved by user) | 12 |
| CLAUDE-SPEC (uncontradicted Claude specifications) | 25+ |
| **Total tracked requirements** | **48+** |

---

## Contradictions Found

### CRITICAL CONTRADICTIONS: NONE

No design/plan specifications were found that contradict any user requirement. All amendments made during the plan review phase corrected internal inconsistencies (between the design doc and the implementation plan), not contradictions with user requirements.

---

## Amendments Made During Review

The following issues were identified during the plan review phase and corrected in both the design doc and implementation plan:

| # | Issue | Resolution | User Involvement |
|---|-------|-----------|-----------------|
| 1 | Line thickness setting listed but WebGL does not support linewidth on THREE.Line | Removed from settings, documented as Known Limitation, Line2 deferred to future | User did not object |
| 2 | Line Walker color modes mapped to palette names instead of design doc's three modes | Fixed to: Rainbow Gradient, Single Color, Random Per Segment | User asked "any idea why that happened?" -- Claude acknowledged it as an oversight |
| 3 | Lorenz preset/slider interaction unspecified | Specified: selecting preset updates sliders; manual slider change does not update dropdown | User explicitly required: "the sliders should always show the current values, so selecting 'chaotic' or any preset would update the sliders" |
| 4 | Wireframe Flythrough camera described as using createFlyCamera AND as automatic forward movement (contradictory) | Clarified: does NOT use OrbitControls or createFlyCamera, pure automatic forward movement | User did not object |
| 5 | AutoCamera target returned just Vector3, follow mode hardcoded z-offset | Expanded to return { position, direction? }, follow mode uses direction vector | User explicitly requested flexible target interface |
| 6 | Reaction-Diffusion simulation.js underspecified | Added ping-pong setup code, seed function, UV mapping notes | User said Claude should err on side of caution |
| 7 | ChromeController F key intercepted during text input | Added activeElement check | Identified by Claude during review |
| 8 | lil-gui imported via relative path (fragile) | Added to import map, settings.js uses bare specifier | Identified by Claude during review |

---

## Unaddressed Requirements

All previously identified gaps have been resolved:

| Requirement | Source | Resolution |
|-------------|--------|------------|
| Pause/restart for Line Walker | Design doc lists "Pause/restart" as setting | FIXED: Added `paused` toggle to settings + `if (settings.get('paused')) return` in update loop |
| Pause for Lorenz | Same pattern | FIXED: Added `paused` toggle + guard in update loop |
| Trail length for Lorenz | Design doc lists "Trail length" as setting | FIXED: Added `trailLength` slider + `setDrawRange` trimming (same pattern as line-walker) |
| Sky color / horizon glow for Wireframe Flythrough | Design doc lists as setting | FIXED: Added horizon glow plane spec (gradient plane at fog boundary) + `horizonGlowColor` setting |
| Settings greying out when auto-camera disabled | Claude design shows disabled controls | FIXED: Added `SettingsPanel.controller(key)` method + `updateAutoCamUI()` function using lil-gui `.enable()/.disable()` |

No remaining gaps.

---

## Untraceable Implementation Details

Implementation specifications that cannot be directly mapped to a user requirement or user-confirmed design. These are CLAUDE-SPEC items that fill in necessary technical details:

| Detail | Location | Assessment |
|--------|----------|------------|
| Three.js version r0.182.0 | Implementation plan header | Reasonable choice (latest at time of planning). User approved vendored Three.js concept. |
| lil-gui version 0.21.0 | Implementation plan header | Reasonable choice. User approved lil-gui concept. |
| SceneManager `orbitDamping` option | Task 2 code | Technical detail, not user-facing. No concern. |
| Walker `maxPoints = 50000` default | Task 6 code | Reasonable default. Not discussed with user. |
| Lorenz `simDt = 0.005` fixed timestep | Task 7 code | Technical necessity for numerical stability. Not user-facing. |
| Lorenz trail offset `0.001 * index` | Task 7 code | Technical detail for sensitivity demonstration. |
| Lorenz `TRAIL_COLORS` array | Task 7 code | Aesthetic choice. Five fixed colors for multi-trail mode. |
| AutoCamera `transitionDuration = 2` seconds | Task 12 code | Reasonable default. User said "smoothly" -- 2 seconds is smooth. |
| AutoCamera `orbitRadius = 30` | Task 12 code | Reasonable default for the scene scales. |
| AutoCamera `driftSpeed = 0.3`, drift timer 3-7s | Task 12 code | Technical detail for drift mode behavior. |
| Smoothstep function for transitions | Task 12 code | Standard interpolation technique. Good choice for smooth transitions. |
| Reaction-Diffusion `Da = 1.0, Db = 0.5` | Task 11 shader | Standard Gray-Scott diffusion rates from literature. |
| Reaction-Diffusion preset F/k values | Task 11 | Standard values from Gray-Scott parameter space literature. |
| CSS specifics (colors, font sizes, z-index) | Task 1 CSS | Reasonable choices matching existing site theme. |
| package.json `name: "stuff-shitchell"` | Task 1 | Reasonable naming convention. |
| `site/3d/scenes/_test/` temporary test page | Tasks 2-4 | Development aid, removed in Task 15. |
| `serve` npm script | Task 1 | Development convenience. |

All untraceable items are reasonable technical defaults or implementation details that do not conflict with any stated requirement.

---

## Overall Alignment Assessment

**GOOD ALIGNMENT.** The design doc and implementation plan are well-aligned with the user's requirements after the amendment phase. The planning conversation shows a thorough back-and-forth where:

1. The user stated high-level goals (3D pages, shared library, configurable, immersive, diagrams)
2. Claude proposed specific designs
3. The user confirmed or refined each proposal
4. Claude identified issues during self-review and corrected them
5. The user provided additional guidance on the corrections

**Key strengths:**
- User requirements are all addressed in the design doc and implementation plan
- Amendments are documented in the design doc with rationale
- The implementation plan provides complete code for shared library modules (the most critical components)
- Scene-specific code is detailed enough for implementation

**Key risks:**
- Dev tooling (Tasks 14-15) is intentionally underspecified -- the user deprioritized it
- Wireframe flythrough terrain.js and objects.js lack complete code (API specified but implementation left to agent)
- The import map depth assumption is fragile but acceptable for the planned directory structure
- The Lorenz and Line Walker scenes are missing pause and trail-length features listed in the design doc (minor gaps)

**Recommendation:** Proceed with implementation. The foundation (Tasks 1-5) and first two scenes (Tasks 6-7) have the most complete specifications and should be built first to validate the architecture. Tasks 8-11 build on established patterns. Tasks 12-13 (AutoCamera) should be done after all scenes work. Tasks 14-15 (dev tooling) can be done last per user preference.

---

## Planning Files Created

| File | Covers |
|------|--------|
| `shared-components.planning.md` | SceneManager, camera factories, SettingsPanel, ChromeController, CSS, utilities |
| `line-walker.planning.md` | Line Walker scene |
| `lorenz.planning.md` | Lorenz Attractor scene |
| `wireframe-flythrough.planning.md` | Wireframe Flythrough scene |
| `reaction-diffusion.planning.md` | Reaction-Diffusion on Sphere scene |
| `auto-camera.planning.md` | AutoCamera module and per-scene integration |
| `dev-tooling.planning.md` | Diagram generation, validation, commit hook, ARCHITECTURE.md |
| `requirements-traceability.md` | This file -- summary report |
