# Lorenz Attractor -- Planning Context

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> 3. i would have them locked together. the sliders should always show the current values, so selecting "chaotic" or any preset would update the sliders.
-- Source: user, responding to Claude's review identifying the preset/slider interaction as underspecified

### User-Confirmed Designs

Lorenz attractor selected from brainstorm:

> **3. Lorenz Attractor / Strange Attractors**
> - Plot the Lorenz butterfly (or Rossler, Aizawa, etc.) as a growing trail
> - OrbitControls to rotate. Color by velocity or time.
> - ~120 lines. Mathematically beautiful, very little code.
-- Source: Claude brainstorm, confirmed implicitly by user proceeding with it in the four-scene plan

Detailed scene design confirmed:

> **Concept:** The classic Lorenz system -- three coupled differential equations that produce a butterfly-shaped trajectory. A trail traces the path, colored by velocity. OrbitControls to orbit the butterfly.
>
> **Configurable settings:**
> - Sigma, Rho, Beta (the three Lorenz parameters -- with presets for "classic", "chaotic", "periodic")
> - Integration speed (time step)
> - Trail length
> - Line thickness
> - Color mode (velocity, time, fixed)
> - Number of simultaneous trails (1-5, slightly different initial conditions -> shows sensitivity to initial conditions)
>
> **Implementation:** Euler or RK4 integration each frame. Same growing `BufferGeometry` pattern as line-walker (shared approach). Multiple trails = multiple geometries with slightly offset starting positions.
-- Source: Claude scene design, confirmed by user with "yeah!" (same confirmation as all four scenes)

### Claude Specifications (Uncontradicted)

Amendment regarding preset/slider interaction:

> **Lorenz preset/slider interaction specified.** Selecting a preset updates the sigma/rho/beta sliders to show preset values. Manually adjusting a slider works independently. Changing trail count destroys and rebuilds all trail geometries.
-- Source: Claude, design doc amendment #3 (after user's explicit requirement about locked sliders)

Preset values from implementation plan:

> const PRESETS = {
>     classic:  { sigma: 10,  rho: 28,    beta: 8 / 3 },
>     chaotic:  { sigma: 10,  rho: 99.96, beta: 8 / 3 },
>     periodic: { sigma: 10,  rho: 13.96, beta: 8 / 3 },
> };
-- Source: Claude, Task 7 of implementation plan

Key behaviors from implementation plan:

> - Selecting a preset (e.g., "chaotic") immediately updates the sigma/rho/beta sliders to show the preset values.
> - Manually tweaking a slider (e.g., setting rho to 30) still works -- the preset dropdown just continues showing the last-selected preset name. The simulation uses the slider values directly.
> - Changing trail count destroys all existing trails and creates new ones (clean rebuild, no stale geometry).
> - The integration timestep is fixed at 0.005 (stable for all presets). The "speed" setting controls how many steps run per frame, not the timestep itself.
-- Source: Claude, Task 7 "Key behaviors" section

RK4 integration specification:

> Uses RK4 integration for the Lorenz system. Supports multiple trails with slightly offset initial conditions.
-- Source: Claude, Task 7 Step 1

Multi-trail initial conditions:

> Each trail offset by 0.001 * index in x, for sensitivity demo
-- Source: Claude, code comment in Task 7

Color modes:

> Color modes:
> - **velocity** -- color by magnitude of derivative (fast = hot, slow = cool)
> - **time** -- hue shifts over time (rainbow ramp on t)
> - **fixed** -- single color per trail (use palette stops)
-- Source: Claude, Task 7 of original implementation plan

Line thickness amendment (same as line-walker):

> **Line thickness removed from settings.** WebGL does not support `linewidth` on `THREE.Line` -- it is always 1px.
-- Source: Claude, design doc amendment #1

## Alignment with Design Doc

The design doc (Section "Pages > 2. Lorenz Attractor", lines 27-39) describes:
- Classic Lorenz system with butterfly-shaped trajectory
- Trail traces path, colored by velocity
- OrbitControls
- Settings: Sigma/Rho/Beta with presets, Integration speed, Trail length, Line thickness (AMENDED: removed), Color mode (velocity/time/fixed), Number of simultaneous trails (1-5)
- Implementation via Euler or RK4 integration, growing BufferGeometry, multiple trails with offset starting positions

The design doc was amended to add preset/slider interaction details and remove line thickness.

## Alignment with Implementation Plan

Task 7 covers the Lorenz scene with three files:
- `site/3d/scenes/lorenz/attractor.js` -- complete LorenzTrail class with RK4 integration (~90 lines)
- `site/3d/scenes/lorenz/main.js` -- complete scene code with preset handling, multi-trail management, all three color modes (~130 lines, added during amendment)
- `site/3d/scenes/lorenz/index.html` -- HTML shell

The implementation plan includes complete code for the attractor class with RK4 integration, the preset-to-slider locking mechanism, trail rebuild on count change, and all three color modes with actual computation logic (velocity magnitude mapping, time-based hue cycling, fixed per-trail colors).

## Gaps or Concerns

1. **Trail length setting** -- The design doc lists "Trail length" as a setting, but the implementation plan code does not include a trail length slider or trimming logic. The line-walker has this (`trailLength` slider with `setDrawRange`), but the Lorenz scene omits it. This is a minor gap -- the same pattern could be applied.

2. **Preset dropdown does not show "custom"** -- When a user manually adjusts sigma/rho/beta, the preset dropdown continues showing the last-selected preset name. This could be confusing. The user's requirement was "the sliders should always show the current values, so selecting 'chaotic' or any preset would update the sliders" -- this requirement is satisfied. The reverse direction (slider change -> preset label) was not discussed. The current behavior (no update to dropdown label) is acceptable per the amendment.

3. **No pause/restart in settings** -- Similar to line-walker gap. Reset button exists but no pause toggle.

## Implementation Guidance

- LorenzTrail class owns its own BufferGeometry, positions array, and colors array. Pre-allocated for maxPoints.
- RK4 integration with fixed timestep (0.005). The `speed` slider controls steps-per-frame, not timestep.
- Presets are a simple object map. When preset dropdown changes, set `settings.values.sigma/rho/beta` directly and call `settings.gui.controllersRecursive().forEach(c => c.updateDisplay())` to refresh the GUI display.
- Trail count changes must fully destroy old geometries (dispose + remove from scene) and create new ones.
- Camera starts at `(0, 0, 80)` looking at `(0, 0, 25)` to center the butterfly.
- Each trail gets a fixed color from `TRAIL_COLORS` array for the "fixed" color mode.
- Auto-camera target: `() => ({ position: new THREE.Vector3(0, 0, 25) })` with default mode `orbit`.
