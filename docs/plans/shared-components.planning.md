# Shared Components -- Planning Context

Covers: SceneManager, camera factories, SettingsPanel, ChromeController, CSS (`scene.css`), utilities (math, color, noise, shader), and the overall module/architecture approach.

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> awesome! what i'd love is for these to go into a directory with a shared js/css library so that certain components can be re-used :) very dry, very paramaterized, very type-y, very modular.
-- Source: user, second message in conversation

> i'd love if these were all configurable with a menu and localStorage to store settings.
-- Source: user, second message in conversation

> all pages should support an immersive fullscreen view where there is nothing -- not even a menu icon -- covering the visual aspect
-- Source: user, clarifying UX requirements

> menu/settings discovery should be obvious and intuitive (where "intuitive" seems to just generally mean "follow common pre-existing patterns that people are already familiar with")
-- Source: user, clarifying UX requirements

> solutions i can think of off the top of my head that would meet this: (1) an explicit full-screen button or (2) a menu icon that toggles a menu and then, after some period of inactivity, fades away... then on mouse/keyboard activity fades back in
-- Source: user, suggesting UX patterns (both offered as options; the auto-hide approach was selected via the next question)

> for whatever it's worth: these are intended to run on a static github pages setup. is that doable with es modules without issue?
-- Source: user, clarifying deployment constraint

### User-Confirmed Designs

> These pages will need a module system for shared code. What's your preference for how to handle that?
Claude proposed: "ES modules only (Recommended) -- Native browser ES modules via `<script type="module">`. No bundler, no build step. Works on any static server. Use import maps for Three.js."
-- Source: Claude question, confirmed by user selecting "ES modules only (Recommended)"

> For the immersive mode UX, which pattern do you prefer?
Claude proposed: "Auto-hide everything (Recommended) -- Settings panel + a small gear icon visible initially. After 3 seconds of inactivity, everything fades out (CSS opacity transition). Any mouse movement, keypress, or touch brings it all back immediately. Double-click or F key triggers browser fullscreen API for true full-viewport mode."
-- Source: Claude question, confirmed by user selecting "Auto-hide everything (Recommended)"

> The commit hook + dependency-cruiser + acorn means we need npm/node as a dev dependency (not for the site itself, just for the tooling). The site stays pure static ES modules with zero build step. Node is only used for: generating diagrams, running the commit hook, and linting. Cool?
-- Source: Claude question, confirmed by user selecting "Yes, node for dev tooling is fine"

Architecture overview confirmed:

> docs/
> ├── lib/                    # Shared ES module library
> │   ├── core/               # Scene, renderer, camera, animation loop
> │   ├── ui/                 # Settings panel, auto-hide chrome, fullscreen
> │   └── utils/              # Math helpers, noise, color, localStorage
> ├── scenes/                 # Individual pages (one HTML + one JS each)
> │   ├── line-walker/
> │   ├── lorenz/
> │   ├── wireframe-flythrough/
> │   └── reaction-diffusion/
> ├── css/                    # Shared styles (dark theme, settings panel)
> │   └── scene.css
> ├── vendor/                 # Pinned third-party (three.js module, lil-gui)
> │   ├── three.module.js
> │   └── lil-gui.esm.js
> └── tools/                  # Dev-only (NOT served, or gitignored)
>     ├── generate-diagrams.mjs
>     └── validate-architecture.mjs
-- Source: Claude design, confirmed by user with "looks good to me :D :D"

Shared library module design confirmed:

> SceneManager... constructor(canvas, options = {})... start(updateFn)... stop()... resize()... dispose()
> Camera factories: createPerspectiveCamera, createOrthographicCamera, createFlyCamera
> SettingsPanel... addSlider, addColor, addToggle, addDropdown, addButton, addSeparator, get(key), onChange(key, callback), load(), save(), reset()
> ChromeController... show(), hide(), resetTimer(), destroy()
> Utils: math.js (lerp, clamp, map, randomRange), color.js (hslToHex, colorRamp, palette), noise.js (simplex2D, simplex3D), shader.js (loadShader, createShaderMaterial)
-- Source: Claude design, confirmed by user with "looks good to me :)"

### Claude Specifications (Uncontradicted)

> **Three.js is vendored** rather than CDN-loaded -- pinned version, no external dependency at runtime, works offline.
-- Source: Claude, architecture overview section

> Under the hood this wraps **lil-gui** but adds localStorage keyed by `sceneId`, so each page's settings are independent. The panel itself is a lil-gui instance styled to match the site's dark theme.
-- Source: Claude, SettingsPanel design

> Listens for `mousemove`, `keydown`, `touchstart`. After `options.timeout` ms (default 3000) of inactivity, fades everything out via CSS opacity transition. Any input fades it back. Registers `F` key and double-click for `document.fullscreenAPI`.
-- Source: Claude, ChromeController design

> **dat.GUI** (and its modern successor **lil-gui**) is that floating panel you see on basically every creative coding demo -- top-right corner, dark translucent background, with sliders, color pickers, checkboxes, and dropdowns. If you've ever browsed three.js examples, shadertoy, or CodePen 3D demos, you've seen it hundreds of times.
-- Source: Claude, explaining lil-gui to user (user was unfamiliar but accepted it)

> localStorage keys are namespaced by sceneId: `scenes:{sceneId}:{key}`.
-- Source: Claude, design doc (SettingsPanel section)

> Tech Stack: Three.js r0.182.0, lil-gui 0.21.0, ES modules (no build step), acorn (dev tooling only)
-- Source: Claude, implementation plan header (after vendor version check)

Amendment regarding ChromeController F-key fix:

> Added check for `document.activeElement` tag to avoid intercepting F key when user is typing in lil-gui input fields.
-- Source: Claude, identified during review; added to Amendments section of design doc

Amendment regarding lil-gui import map:

> lil-gui added to import map. All scene HTML pages include `"lil-gui": "../../vendor/lil-gui.esm.js"` in their import map. settings.js imports via `import GUI from 'lil-gui'` (bare specifier) instead of relative path.
-- Source: Claude, amendment #8 in design doc

## Alignment with Design Doc

The design doc covers all shared components in the "Architecture" and "Shared Library API" sections (lines 70-231 in the design doc). It specifies:

- Directory structure matching user requirement for shared library
- SceneManager API with constructor options, scene/camera/renderer/controls properties, start/stop/resize/dispose methods
- Camera factories: createPerspectiveCamera, createOrthographicCamera, createFlyCamera
- SettingsPanel API: constructor with sceneId, builder-pattern methods, get/onChange/load/save/reset
- ChromeController: constructor with elements and options (timeout), show/hide/resetTimer/destroy, mousemove/keydown/touchstart listeners
- Utils: math.js, color.js, noise.js, shader.js with exact exports listed
- UX behavior (6-step flow: page load -> 3s idle -> fade out -> activity -> fade in -> 30s idle -> auto-camera)
- CSS: full-viewport canvas, dark theme, lil-gui overrides, fade transition classes

## Alignment with Implementation Plan

The implementation plan covers shared components in Tasks 1-5:

- **Task 1**: Project setup, vendor files (Three.js r0.182.0, lil-gui 0.21.0), CSS, package.json, directory structure
- **Task 2**: SceneManager + camera factories with complete code (~130 lines each)
- **Task 3**: SettingsPanel with complete code (~170 lines)
- **Task 4**: ChromeController with complete code (~100 lines), including the F-key fix
- **Task 5**: Math + color utilities with complete code

Known Limitations section documents the WebGL linewidth issue.

## Gaps or Concerns

1. **noise.js implementation is deferred to Task 8** -- the implementation plan (Task 8) says to "use Gustavson's approach" but does not provide complete code. The agent will need to find/write a clean simplex noise implementation. This is reasonable given it is a well-known public-domain algorithm.

2. **shader.js is minimal** (Task 10) -- only two functions (loadShader, createShaderMaterial). Complete code is provided. No concerns.

3. **CSS theme colors** -- The design doc says dark theme matching existing site (#1a1a2e background, #ffd700 gold accents). Implementation plan CSS (Task 1) matches. No gap.

4. **Import map depth assumption** -- All scene pages must be at `docs/scenes/<name>/index.html` (two levels deep from docs/) for the import map relative paths to work. This is not explicitly stated as a constraint but is implicit in the import map pattern. If a scene is added at a different depth, imports will break. This is a fragile assumption that should be documented.

## Implementation Guidance

- Vendor files are downloaded from unpkg.com at pinned versions (Three.js 0.182.0, lil-gui 0.21.0).
- All HTML scene pages must include the same import map block with mappings for `three`, `three/addons/`, and `lil-gui`.
- SceneManager owns the render loop and resize handling. Scenes provide an `updateFn(dt, elapsed)` callback.
- SettingsPanel wraps lil-gui; all methods return `this` for chaining. localStorage auto-saves on every change.
- ChromeController listens to mousemove/keydown/touchstart. F key and double-click toggle fullscreen. F key is suppressed when focus is on INPUT/TEXTAREA/SELECT elements.
- CSS uses `.chrome`, `.chrome-visible`, `.chrome-hidden` classes for fade transitions.
- The `createFlyCamera` factory exists in camera.js but is NOT used by the wireframe flythrough scene (see wireframe-flythrough.planning.md for details).
