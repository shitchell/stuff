# Coding Standards & Principles

## Architecture Principles

### DRY -- No Duplicated Logic Across Scenes

Shared behavior lives in `site/3d/lib/`. Each scene provides only:
- A focus point coordinate (for AutoCamera targeting)
- Scene-specific settings (registered with SettingsPanel)
- Scene-specific modules (geometry, simulation logic)

All camera management, UI chrome, settings persistence, and utility functions are centralized in the shared library. If two scenes need the same behavior, it belongs in `lib/`.

### Library Structure

```
site/3d/lib/
  core/
    scene.js        -- SceneManager: renderer, camera, animation loop, resize
    camera.js       -- Camera factory functions
    auto-camera.js  -- AutoCamera: idle camera modes (orbit, drift, follow)
  ui/
    chrome.js       -- ChromeController: show/hide UI on inactivity, fullscreen
    settings.js     -- SettingsPanel: lil-gui wrapper with localStorage persistence
  utils/
    color.js        -- Color palettes, HSL conversion, gradient ramps
    math.js         -- lerp, clamp, map, randomRange
    noise.js        -- Noise functions
    shader.js       -- Shader loading utilities
```

### ES Modules with Import Maps

The site uses native ES modules with import maps. No build step for the site itself -- Node is only used for dev tooling (diagrams, validation, tests).

Each scene's `index.html` declares an import map for vendored dependencies:

```html
<script type="importmap">
{
    "imports": {
        "three": "../../vendor/three.module.js",
        "three/addons/": "../../vendor/three-addons/",
        "lil-gui": "../../vendor/lil-gui.esm.js"
    }
}
</script>
```

### Vendored Dependencies

All runtime dependencies (Three.js, lil-gui) are vendored in `site/3d/vendor/`. No CDN imports, no npm at runtime. This ensures the site works offline and is not affected by upstream breakage.

Node dependencies (`devDependencies` in `package.json`) are used only for:
- Playwright (testing)
- acorn / acorn-walk (diagram generation from AST)
- mermaid-cli (SVG rendering)
- pngjs (pixel analysis in tests)

## Code Style

### ES Modules with Named Exports

All library modules use named exports:

```javascript
export class SceneManager { ... }
export function lerp(a, b, t) { ... }
export function colorRamp(t, pal) { ... }
```

### Classes for Stateful Components

Use classes when the component manages internal state across its lifetime:

- `SceneManager` -- owns renderer, camera, animation loop
- `SettingsPanel` -- owns lil-gui instance, localStorage bindings, change listeners
- `ChromeController` -- owns visibility state, inactivity timer, event listeners
- `AutoCamera` -- owns transition state, movement parameters, active/inactive mode

### Factory Functions for Stateless Creation

Use plain functions when creating objects without ongoing state management:

- `createPerspectiveCamera(fov, near, far)` -- returns a configured camera
- `hslToHex(h, s, l)` -- pure conversion
- `colorRamp(t, palette)` -- pure sampling

### Private Fields with `#` Prefix

Use JavaScript private fields (`#field`) for internal state. The diagram generator skips `#`-prefixed members when building class diagrams, keeping the public API visible and the internals hidden:

```javascript
export class AutoCamera {
    /** @type {boolean} */ active = false;     // public -- part of the API

    #camera;                                    // private -- internal state
    #controls;
    #transitioning = false;
    #transitionProgress = 0;
}
```

### JSDoc Type Annotations

Use JSDoc on public APIs. Type annotations serve as documentation and enable IDE autocompletion without requiring TypeScript:

```javascript
/**
 * @param {string} sceneId - Used as localStorage namespace
 * @param {Object} [options]
 * @param {string} [options.title='Settings']
 */
constructor(sceneId, options = {}) { ... }

/** @param {number} dt - seconds */
update(dt) { ... }
```

Use `@typedef` for option objects that appear in multiple places:

```javascript
/**
 * @typedef {Object} SceneOptions
 * @property {'perspective'|'orthographic'} [cameraType='perspective']
 * @property {number} [fov=75]
 * @property {boolean} [antialias=true]
 */
```

### Deterministic Output for Generated Files

All generated files (Mermaid diagrams, graph data JSON) must produce deterministic output. Sort alphabetically: subgraphs, class members, edges, module keys. This ensures that `git diff` only shows meaningful changes, not reordering noise.

## Scene Anatomy

Every scene follows the same structure:

```
site/3d/scenes/{scene-name}/
  index.html       -- Import map + canvas element
  main.js          -- Entry point: wires SceneManager, SettingsPanel, ChromeController, AutoCamera
  {modules}.js     -- Scene-specific logic (geometry, simulation, etc.)
```

### index.html

Minimal HTML: declares the import map for vendored dependencies, includes the shared CSS, and provides a `<canvas id="canvas">`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scene Name</title>
    <link rel="stylesheet" href="../../css/scene.css">
    <script type="importmap">{ "imports": { ... } }</script>
</head>
<body>
    <canvas class="scene-canvas" id="canvas"></canvas>
    <script type="module" src="./main.js"></script>
</body>
</html>
```

### main.js

Every `main.js` wires together the same four shared components:

1. **SceneManager** -- create renderer, camera, scene, controls
2. **SettingsPanel** -- register scene-specific settings, load from localStorage
3. **ChromeController** -- hide UI on inactivity, trigger autocamera
4. **AutoCamera** -- set target function, wire to settings, start idle timer

```javascript
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, { background: 0x0a0a1a });

const settings = new SettingsPanel('scene-id', { title: 'Scene Name' });
settings.addSlider('speed', 'Speed', 1, 100, 1, 30);
// ... more settings ...

const autoCamera = new AutoCamera(mgr.camera, mgr.controls);
autoCamera.setTarget(() => ({ position: focusPoint }));

const chrome = new ChromeController([settings.domElement], {
    onActive: () => resetAutoCamTimer(),
});

mgr.start((dt) => {
    // scene-specific update logic
    autoCamera.update(dt);
});
```

### Settings Persistence

Settings are persisted via `SettingsPanel` + `localStorage`, namespaced by scene ID. The key format is `scenes:{sceneId}:{settingKey}`:

```
scenes:line-walker:speed
scenes:line-walker:autoCamEnabled
scenes:fractal-dreamscape:autoCamTimeout
```

Values are JSON-serialized. The `SettingsPanel` handles load-on-init and save-on-change automatically.

## Dev Tooling

### Diagram Generation

Architecture diagrams are generated from AST analysis using acorn:

- **Tool:** `tools/generate-diagrams.mjs`
- **Run:** `npm run diagrams`
- **Output:** `site/3d/diagrams/` (`.mmd` files, `.svg` renderings, `graph-data.json`)
- **Deterministic:** Output is sorted alphabetically -- same source always produces same diagrams

The generator parses all `.js` files under `site/3d/lib/` and `site/3d/scenes/`, extracts imports, classes, methods, properties, and exports, then produces:
- `module-dependencies.mmd` -- Mermaid graph showing which modules import which
- `class-hierarchy.mmd` -- Mermaid class diagram with public API surface
- `graph-data.json` -- Machine-readable graph for the architecture validator

### Architecture Validation

The pre-commit hook ensures diagrams stay in sync with code:

- **Tool:** `tools/validate-architecture.mjs`
- **Run:** `npm run validate` (or automatically via pre-commit hook)
- **Behavior:**
  1. Regenerates diagrams from current source
  2. Compares against committed versions
  3. If diagrams changed: reports what changed, checks if `ARCHITECTURE.md` is staged
  4. Blocks commit if `ARCHITECTURE.md` is not staged alongside diagram changes

### Pre-Commit Hook

Located at `.githooks/pre-commit`. Enable it with:

```bash
git config core.hooksPath .githooks
```

The hook triggers when `.js` files under `site/3d/` are staged. It runs the architecture validator and auto-stages updated `.mmd` and `graph-data.json` files.

To bypass (use sparingly):

```bash
git commit --no-verify
```

### npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run diagrams` | `node tools/generate-diagrams.mjs` | Regenerate all diagrams |
| `npm run validate` | `node tools/validate-architecture.mjs` | Check diagrams are current |
| `npm run update-docs` | `npm run diagrams && echo ...` | Regenerate + reminder to update ARCHITECTURE.md |
| `npm run serve` | `npx serve docs` | Serve the site locally |

## Diagrams & Documentation

### Architecture Diagrams

Generated diagrams live in `site/3d/diagrams/`:

| File | Format | Content |
|------|--------|---------|
| `module-dependencies.mmd` | Mermaid | Module import graph (which files import which) |
| `module-dependencies.svg` | SVG | Rendered version |
| `class-hierarchy.mmd` | Mermaid | Class diagram with public methods and properties |
| `class-hierarchy.svg` | SVG | Rendered version |
| `graph-data.json` | JSON | Machine-readable graph data for the validator |

### ARCHITECTURE.md

`site/3d/ARCHITECTURE.md` embeds the Mermaid diagrams and provides prose describing the module structure. It must be updated whenever diagrams change (enforced by the pre-commit hook).

**Workflow for code changes that affect architecture:**

1. Make your code changes
2. Run `npm run diagrams` to regenerate
3. Review the diff in the `.mmd` files
4. Update `site/3d/ARCHITECTURE.md` prose to reflect the changes
5. Stage both: `git add site/3d/ARCHITECTURE.md site/3d/diagrams/`
6. Commit

### Plans

Design and implementation plans live in `site/plans/`. These are historical records of decisions and rationale.

## Debugging

### Prefixed Diagnostic Logs

All diagnostic output uses `console.debug` (not `console.log`) with a component prefix:

```javascript
console.debug('[autocam] activating, mode=drift');
console.debug('[line-walker] buffer full, resetting');
console.debug('[fractal] shader compilation complete');
```

The prefix format is `[component-name]` and must match the component's identity. This enables filtering in browser DevTools and in test log capture (see the testing guide).

### Evidence-Based Debugging

- **No conclusions without log evidence.** If you think the autocamera is causing a blackout, show the `[autocam]` logs that prove it.
- **Observations are facts.** "Brightness dropped to 0 at t=7.2s" is an observation.
- **Hypotheses are inferences.** "The camera transition blanks the framebuffer" is a hypothesis. Label it as such and gather more evidence before acting on it.
- **Separate observations from hypotheses** in bug reports, commit messages, and test output.
