# 3D Interactive Scenes — Design Document

**Date:** 2026-02-10
**Status:** Approved (amended 2026-02-10 — see Amendments section at bottom)

## Goal

Add four interactive 3D pages to stuff.shitchell.com that serve as visual effects / screensavers. Built on a shared, modular ES module library with configurable settings, localStorage persistence, and auto-hide UI. Deterministic diagram generation and commit hook enforcement keep the architecture documented.

## Pages

### 1. Line Walker

A single line grows through 3D space one segment at a time. Each step picks a random direction (biased slightly forward to avoid backtracking). Color shifts along the hue spectrum as it grows. OrbitControls to fly around.

**Settings:**
- Speed (segments per second)
- Step length
- Direction bias (how "straight" vs "drunk" the walk is)
- Line thickness
- Color mode (rainbow gradient, single color, random per segment)
- Trail length (infinite or fade after N segments)
- Pause/restart

**Implementation:** `THREE.BufferGeometry` with a growing position array. Each frame, compute next point, append to geometry, update draw range. Uses `lib/utils/color.js` for the hue ramp.

### 2. Lorenz Attractor

The classic Lorenz system — three coupled differential equations that produce a butterfly-shaped trajectory. A trail traces the path, colored by velocity. OrbitControls to orbit the butterfly.

**Settings:**
- Sigma, Rho, Beta (with presets: "classic", "chaotic", "periodic")
- Integration speed (time step)
- Trail length
- Line thickness
- Color mode (velocity, time, fixed)
- Number of simultaneous trails (1-5, slightly different initial conditions)

**Implementation:** Euler or RK4 integration each frame. Growing `BufferGeometry` pattern (shared with line-walker). Multiple trails = multiple geometries with slightly offset starting positions.

### 3. Wireframe Flythrough

Camera flies forward over procedurally generated terrain. Ground is a wireframe mesh colored in neon gradients. Objects (trees, pyramids, columns) appear as wireframe shapes. Synthwave/cyberpunk aesthetic.

**Settings:**
- Fly speed
- Terrain roughness (noise frequency/amplitude)
- Wireframe color (neon green, pink, cyan, custom)
- Object density (trees/shapes per chunk)
- Fog distance
- Camera height
- Sky color / horizon glow

**Implementation:** Chunked terrain — a ring buffer of terrain strips ahead of the camera. Each strip is a `PlaneGeometry` with vertex heights from simplex3D noise. Old chunks behind the camera are recycled to the front with new noise values. Uses `createFlyCamera` for forward movement.

### 4. Reaction-Diffusion on Sphere

Gray-Scott reaction-diffusion model running as a fragment shader on a sphere's surface. Organic, coral-like patterns emerge and evolve continuously. Sphere slowly rotates. OrbitControls to inspect.

**Settings:**
- Feed rate (F) and Kill rate (k) — with named presets ("coral", "mitosis", "maze", "spots", "waves")
- Simulation speed
- Color palette (organic, thermal, monochrome)
- Sphere rotation speed
- Resolution (texture size — performance vs detail tradeoff)
- Reset / seed pattern (center dot, random noise, ring)

**Implementation:** Two render targets (ping-pong) with a Gray-Scott fragment shader. Each frame, the shader reads from one texture and writes the next simulation step to the other. The sphere's material samples the current texture. GLSL stored as separate `.frag`/`.vert` files.

## Architecture

### Module System

Pure ES modules with `<script type="module">`. No build step. Three.js and lil-gui vendored locally. Served as static files on GitHub Pages.

### Directory Structure

```
docs/
├── index.html
├── css/
│   └── scene.css
├── vendor/
│   ├── three.module.js
│   ├── three-addons/
│   │   └── OrbitControls.js
│   └── lil-gui.esm.js
├── lib/
│   ├── core/
│   │   ├── scene.js            # SceneManager
│   │   ├── camera.js           # Camera factory functions
│   │   └── auto-camera.js      # AutoCamera (screensaver mode)
│   ├── ui/
│   │   ├── settings.js         # SettingsPanel (wraps lil-gui + localStorage)
│   │   └── chrome.js           # ChromeController (auto-hide, fullscreen)
│   └── utils/
│       ├── math.js             # lerp, clamp, map, randomRange
│       ├── color.js            # hslToHex, colorRamp, palette
│       ├── noise.js            # simplex2D, simplex3D
│       └── shader.js           # loadShader, createShaderMaterial
├── scenes/
│   ├── line-walker/
│   │   ├── index.html
│   │   ├── main.js
│   │   └── walker.js
│   ├── lorenz/
│   │   ├── index.html
│   │   ├── main.js
│   │   └── attractor.js
│   ├── wireframe-flythrough/
│   │   ├── index.html
│   │   ├── main.js
│   │   ├── terrain.js
│   │   └── objects.js
│   └── reaction-diffusion/
│       ├── index.html
│       ├── main.js
│       ├── simulation.js
│       ├── reaction-diffusion.frag
│       └── reaction-diffusion.vert
├── diagrams/
│   ├── module-dependencies.mmd
│   └── class-hierarchy.mmd
├── ARCHITECTURE.md
├── cube-perception.html
└── tanakh-vs-ot.html

tools/
├── generate-diagrams.mjs
└── validate-architecture.mjs

package.json
.githooks/
└── pre-commit
```

### Shared Library API

#### `SceneManager` (`lib/core/scene.js`)

```
SceneManager
├── constructor(canvas, options)    # camera type, background, antialias
├── scene: THREE.Scene
├── camera: THREE.Camera
├── renderer: THREE.WebGLRenderer
├── controls: OrbitControls|null
├── running: boolean
├── start(updateFn)                 # kicks off rAF loop, calls updateFn(dt, elapsed)
├── stop()                          # pauses the loop
├── resize()                        # handles window resize
└── dispose()                       # tears down everything
```

#### Camera factories (`lib/core/camera.js`)

```
createPerspectiveCamera(fov, near, far) → THREE.PerspectiveCamera
createOrthographicCamera(frustumSize)   → THREE.OrthographicCamera
createFlyCamera(speed, canvas)          → { camera, update(dt) }
```

#### `AutoCamera` (`lib/core/auto-camera.js`)

Screensaver-style automatic camera movement after inactivity.

```
AutoCamera
├── constructor(camera, controls, options)
├── setTarget(targetFn)       # function returning Vector3 to focus on
├── setMode(mode)             # 'orbit' | 'drift' | 'follow'
├── activate()                # smooth transition into auto-movement
├── deactivate()              # smooth handoff back to user controls
└── update(dt)                # called each frame
```

**Settings (per scene):**
- Auto-camera enabled (bool, default: true)
- Inactivity seconds (int, 5-120, default: 30)
- Auto-camera mode (orbit | drift | follow)

Modes:
- `orbit` — circles target at fixed radius, varying elevation (lorenz, reaction-diffusion)
- `drift` — lazy random walk around target (line-walker)
- `follow` — tracks target from behind/above (wireframe flythrough)

#### `SettingsPanel` (`lib/ui/settings.js`)

Wraps lil-gui with localStorage persistence.

```
SettingsPanel
├── constructor(sceneId, containerEl)
├── addSlider(key, label, min, max, step, default)   → this
├── addColor(key, label, default)                     → this
├── addToggle(key, label, default)                    → this
├── addDropdown(key, label, options, default)          → this
├── addButton(label, callback)                        → this
├── addSeparator()                                    → this
├── get(key)                                          → value
├── onChange(key, callback)                            → void
├── load()                                            → void  (from localStorage)
├── save()                                            → void  (to localStorage)
└── reset()                                           → void  (back to defaults)
```

localStorage keys are namespaced by sceneId: `scenes:{sceneId}:{key}`.

#### `ChromeController` (`lib/ui/chrome.js`)

Auto-hide all UI elements after inactivity.

```
ChromeController
├── constructor(elements, options)    # elements: HTMLElement[], timeout: 3000
├── show()
├── hide()
├── resetTimer()
└── destroy()
```

Listens for mousemove, keydown, touchstart. After timeout ms of inactivity, fades all elements via CSS opacity transition. `F` key and double-click trigger `document.requestFullscreen()`.

#### Utils

| Module | Exports |
|--------|---------|
| `math.js` | `lerp(a, b, t)`, `clamp(v, min, max)`, `map(v, inMin, inMax, outMin, outMax)`, `randomRange(min, max)` |
| `color.js` | `hslToHex(h, s, l)`, `colorRamp(t, palette)`, `palette(name)` |
| `noise.js` | `simplex2D(x, y)`, `simplex3D(x, y, z)` |
| `shader.js` | `loadShader(url)`, `createShaderMaterial(vert, frag, uniforms)` |

### UX Behavior

1. **Page load:** Settings panel visible in top-right corner. Small gear icon if panel is collapsed.
2. **After 3s of inactivity:** All UI fades out (panel, gear icon — everything).
3. **Any mouse/keyboard/touch:** UI fades back in immediately.
4. **After 30s of inactivity (configurable):** AutoCamera takes over with smooth transition.
5. **Any input during auto-camera:** Smooth handoff back to user controls. UI fades in.
6. **Double-click or F key:** Toggle browser fullscreen API.

### CSS (`css/scene.css`)

Shared styles:
- Full-viewport canvas (100vw x 100vh, no scroll)
- Dark theme matching existing site (#1a1a2e background)
- lil-gui overrides to match site's dark theme + gold accents
- Fade transition classes (`.chrome-visible`, `.chrome-hidden`)
- Gear icon positioning

## Dev Tooling

### Diagram Generation (`tools/generate-diagrams.mjs`)

Uses acorn to parse all `.js` files under `lib/` and `scenes/`. Extracts:
- Import/export edges → module dependency graph
- Class declarations, method signatures, extends → class hierarchy
- Exported functions and constants → export map

Outputs deterministic Mermaid `.mmd` files to `docs/3d/diagrams/`.

### Architecture Validation (`tools/validate-architecture.mjs`)

1. Runs `generate-diagrams.mjs` to produce current `.mmd` files
2. Diffs against committed versions
3. If diff exists:
   - Reports changed classes/modules
   - Walks graph to show connected nodes ("you changed X, it's used by Y and Z")
   - Checks for dead ends (exported but never imported) and orphans (imported but nonexistent)
   - If `ARCHITECTURE.md` is staged in the commit → pass
   - If `ARCHITECTURE.md` is NOT staged → block commit with message

### Pre-commit Hook (`.githooks/pre-commit`)

```
git commit
  ├── generate-diagrams.mjs → produce .mmd files
  ├── validate-architecture.mjs
  │   ├── no diff → pass
  │   └── diff found
  │       ├── ARCHITECTURE.md staged → pass (auto-stage .mmd files)
  │       └── ARCHITECTURE.md NOT staged → block
  └── done
```

### npm scripts

```json
{
  "scripts": {
    "diagrams": "node tools/generate-diagrams.mjs",
    "validate": "node tools/validate-architecture.mjs",
    "update-docs": "npm run diagrams && echo 'Now update ARCHITECTURE.md prose'"
  }
}
```

## Implementation Order

### Phase 1: Foundation
1. Vendor Three.js and lil-gui
2. `lib/core/scene.js` — SceneManager
3. `lib/core/camera.js` — camera factories
4. `lib/ui/chrome.js` — ChromeController
5. `lib/ui/settings.js` — SettingsPanel
6. `css/scene.css` — shared styles
7. Validate with a minimal test scene

### Phase 2: Scenes (can be parallelized)
8. `lib/utils/math.js` and `lib/utils/color.js`
9. Line Walker (simplest, validates the full stack)
10. Lorenz Attractor (similar pattern to line walker)
11. `lib/utils/noise.js`
12. Wireframe Flythrough
13. `lib/utils/shader.js`
14. Reaction-Diffusion on Sphere

### Phase 3: Auto-Camera
15. `lib/core/auto-camera.js`
16. Integrate into all four scenes

### Phase 4: Dev Tooling
17. `tools/generate-diagrams.mjs`
18. `tools/validate-architecture.mjs`
19. `.githooks/pre-commit`
20. `docs/3d/ARCHITECTURE.md`
21. Update `docs/index.html` with links to all scenes

---

## Amendments (2026-02-10)

Corrections made during implementation plan review:

1. **Line thickness removed from settings.** WebGL does not support `linewidth` on `THREE.Line` — it is always 1px. Variable width requires `Line2` addon (5 extra vendor files + different geometry format). Deferred to future enhancement.

2. **Line Walker color modes corrected.** Design said "rainbow gradient, single color, random per segment." Implementation plan initially mapped these to palette names (rainbow, neon, fire, etc.) — wrong. Fixed to three distinct modes: Rainbow Gradient (hue cycles as line grows), Single Color (user picks one color via color picker), Random Per Segment (each segment gets a random hue).

3. **Lorenz preset/slider interaction specified.** Selecting a preset updates the sigma/rho/beta sliders to show preset values. Manually adjusting a slider works independently. Changing trail count destroys and rebuilds all trail geometries.

4. **Wireframe Flythrough camera clarified.** Does NOT use OrbitControls or `createFlyCamera`. Camera moves forward automatically along -Z each frame. No user steering. Pure screensaver mode.

5. **AutoCamera target interface expanded.** `setTarget(fn)` now expects `fn` to return `{ position: Vector3, direction?: Vector3 }` instead of just `Vector3`. The `direction` field is used by `follow` mode to position the camera behind the target. If omitted, follow mode falls back to orbit behavior.

6. **Reaction-Diffusion simulation.js detailed.** Added complete ping-pong render target setup, seed function implementation, and sphere UV mapping notes.

7. **ChromeController F-key fix.** Added check for `document.activeElement` tag to avoid intercepting F key when user is typing in lil-gui input fields.

8. **lil-gui added to import map.** All scene HTML pages include `"lil-gui": "../../vendor/lil-gui.esm.js"` in their import map. settings.js imports via `import GUI from 'lil-gui'` (bare specifier) instead of relative path.
