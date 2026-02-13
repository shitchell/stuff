# Raymarched Fractal Flythrough Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a raymarched fractal flythrough scene with configurable fractal types, visual styles, quality presets, and a cockpit-style camera.

**Architecture:** Fullscreen quad with a single GLSL fragment shader containing all fractal distance estimators, selected via uniform. Camera computed in JS, passed as uniforms. Follows the existing scene anatomy (SceneManager + SettingsPanel + ChromeController + AutoCamera pattern).

**Tech Stack:** Three.js r182 (vendored), GLSL ES 1.0, simplex noise from `lib/utils/noise.js`, lil-gui via `lib/ui/settings.js`.

**Testing note:** This is a GPU shader scene -- no unit tests apply. Each task ends with visual verification in the browser via `npm run serve` at `http://localhost:3000/3d/scenes/raymarched-fractal/`. The existing project uses Playwright e2e tests only for specific regression bugs, not for new scene development.

**Design doc:** `docs/plans/2026-02-13-raymarched-fractal-design.md`

---

### Task 1: Scaffold + Mandelbulb raymarching

Get a static Mandelbulb rendering on screen with a fixed camera. This validates the raymarching pipeline end-to-end.

**Files:**
- Create: `site/3d/scenes/raymarched-fractal/index.html`
- Create: `site/3d/scenes/raymarched-fractal/fractal.vert`
- Create: `site/3d/scenes/raymarched-fractal/fractal.frag`
- Create: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Create `index.html`**

Standard import map + canvas, identical to other scenes except the title:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raymarched Fractal</title>
    <link rel="stylesheet" href="../../css/scene.css">
    <script type="importmap">
    {
        "imports": {
            "three": "../../vendor/three.module.js",
            "three/addons/": "../../vendor/three-addons/",
            "lil-gui": "../../vendor/lil-gui.esm.js"
        }
    }
    </script>
</head>
<body>
    <canvas class="scene-canvas" id="canvas"></canvas>
    <script type="module" src="./main.js"></script>
</body>
</html>
```

**Step 2: Create `fractal.vert`**

Passthrough vertex shader (identical to `scenes/fractal-dreamscape/fractal.vert`):

```glsl
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
```

**Step 3: Create `fractal.frag`**

The raymarching shader with the Mandelbulb DE, basic lighting, and a fixed camera. Other DEs are added in Task 3. Include all the section separators from the design. For this first task, the DE router just calls Mandelbulb, and lighting is basic (AO + single palette).

```glsl
precision highp float;

varying vec2 vUv;

// ============================================================
// Section: Uniforms & Constants
// ============================================================

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uCameraPos;
uniform vec3  uCameraDir;
uniform vec3  uCameraUp;

// Fractal params
uniform int   uFractalType;  // 0=mandelbulb, 1=mandelbox, 2=menger, 3=hybrid
uniform float uPower;        // Mandelbulb power (default 8.0)
uniform float uFoldLimit;    // Mandelbox fold limit (default 1.0)
uniform float uBoxScale;     // Mandelbox scale (default 2.0)
uniform float uMorphProgress;// Hybrid morph 0..1

// Visual params
uniform int   uVisualStyle;  // 0=dark, 1=psychedelic, 2=geometric, 3=ambient
uniform float uAOStrength;
uniform float uFogDensity;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform vec3  uAccentColor;

// Quality
uniform int   uMaxIterations;

#define PI  3.14159265359
#define TAU 6.28318530718
#define MAX_STEPS 200
#define MIN_DIST 0.0005
#define MAX_DIST 50.0

// ============================================================
// Section: Utility Functions
// ============================================================

mat3 rotateY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0, s, 0, 1, 0, -s, 0, c);
}

mat3 rotateX(float a) {
    float s = sin(a), c = cos(a);
    return mat3(1, 0, 0, 0, c, -s, 0, s, c);
}

// IQ cosine palette: a + b * cos(TAU * (c*t + d))
vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// ============================================================
// DE: Mandelbulb
// Self-contained. Depends only on: uPower uniform
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

float DE_mandelbulb(vec3 p) {
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    float power = uPower;

    for (int i = 0; i < 15; i++) {
        r = length(z);
        if (r > 2.0) break;

        // Convert to polar
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;

        // Scale and rotate
        float zr = pow(r, power);
        theta *= power;
        phi *= power;

        // Back to cartesian
        z = zr * vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
        );
        z += p;
    }
    return 0.5 * log(r) * r / dr;
}

// ============================================================
// DE: Mandelbox
// Self-contained. Depends only on: uFoldLimit, uBoxScale uniforms
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

void boxFold(inout vec3 z, float limit) {
    z = clamp(z, -limit, limit) * 2.0 - z;
}

void sphereFold(inout vec3 z, inout float dz) {
    float r2 = dot(z, z);
    float minR2 = 0.25;
    float fixedR2 = 1.0;
    if (r2 < minR2) {
        float temp = fixedR2 / minR2;
        z *= temp;
        dz *= temp;
    } else if (r2 < fixedR2) {
        float temp = fixedR2 / r2;
        z *= temp;
        dz *= temp;
    }
}

float DE_mandelbox(vec3 p) {
    vec3 z = p;
    float dz = 1.0;
    float scale = uBoxScale;

    for (int i = 0; i < 15; i++) {
        boxFold(z, uFoldLimit);
        sphereFold(z, dz);
        z = scale * z + p;
        dz = dz * abs(scale) + 1.0;
    }
    return length(z) / abs(dz);
}

// ============================================================
// DE: Menger Sponge
// Self-contained. No special uniforms needed.
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

float DE_menger(vec3 p) {
    vec3 z = abs(p);
    float scale = 3.0;
    float d = max(z.x, max(z.y, z.z)) - 1.0; // start with unit cube

    for (int i = 0; i < 8; i++) {
        // Fold into first octant
        z = abs(z);

        // Sort so z.x >= z.y >= z.z
        if (z.x < z.y) z.xy = z.yx;
        if (z.x < z.z) z.xz = z.zx;
        if (z.y < z.z) z.yz = z.zy;

        z = z * scale - (scale - 1.0);
        if (z.z < -0.5 * (scale - 1.0)) {
            z.z += scale - 1.0;
        }

        d = min(d, max(max(abs(z.x), abs(z.y)), abs(z.z)) * pow(scale, -float(i + 1)));
    }
    return d;
}

// ============================================================
// DE: Hybrid (Mandelbulb + Mandelbox morph)
// Depends on: DE_mandelbulb, DE_mandelbox, uMorphProgress
// To extract: copy this section + both source DE sections
// ============================================================

float DE_hybrid(vec3 p) {
    float d1 = DE_mandelbulb(p);
    float d2 = DE_mandelbox(p);
    return mix(d1, d2, uMorphProgress);
}

// ============================================================
// Section: DE Router
// ============================================================

float DE(vec3 p) {
    if (uFractalType == 0) return DE_mandelbulb(p);
    if (uFractalType == 1) return DE_mandelbox(p);
    if (uFractalType == 2) return DE_menger(p);
    return DE_hybrid(p);
}

// ============================================================
// Section: Raymarcher
// Returns vec2(distance, steps/MAX_STEPS) for AO calculation
// ============================================================

vec2 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    float minDist = MAX_DIST;

    for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= uMaxIterations) break;
        vec3 p = ro + rd * t;
        float d = DE(p);
        minDist = min(minDist, d);
        if (d < MIN_DIST) {
            return vec2(t, float(i) / float(uMaxIterations));
        }
        t += d;
        if (t > MAX_DIST) break;
    }
    return vec2(-1.0, minDist); // miss: distance=-1, second component=closest approach
}

// ============================================================
// Section: Lighting & Coloring
// ============================================================

vec3 estimateNormal(vec3 p) {
    vec2 e = vec2(MIN_DIST * 2.0, 0.0);
    return normalize(vec3(
        DE(p + e.xyy) - DE(p - e.xyy),
        DE(p + e.yxy) - DE(p - e.yxy),
        DE(p + e.yyx) - DE(p - e.yyx)
    ));
}

// Cheap AO from step count -- more steps = deeper in crevice = darker
float calcAO(vec3 p, vec3 n) {
    float ao = 0.0;
    float scale = 1.0;
    for (int i = 1; i <= 5; i++) {
        float dist = 0.02 * float(i);
        float d = DE(p + n * dist);
        ao += (dist - d) * scale;
        scale *= 0.5;
    }
    return clamp(1.0 - ao * uAOStrength, 0.0, 1.0);
}

// Style-based color palette
vec3 getColor(float t, vec3 n, float ao) {
    vec3 color;

    if (uVisualStyle == 0) {
        // Dark & Atmospheric -- cool tones, edge-lit
        color = iqPalette(t,
            vec3(0.2, 0.2, 0.3),
            vec3(0.5, 0.4, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.00, 0.10, 0.20)
        );
    } else if (uVisualStyle == 1) {
        // Psychedelic -- vivid rainbow cycling
        color = iqPalette(t + uTime * 0.05,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.00, 0.33, 0.67)
        );
    } else if (uVisualStyle == 2) {
        // Geometric -- monochrome + accent
        float v = 0.5 + 0.5 * cos(TAU * t);
        color = mix(vec3(v), uAccentColor, 0.2 + 0.3 * (1.0 - ao));
    } else {
        // Ambient -- soft pastels
        color = iqPalette(t,
            vec3(0.6, 0.6, 0.65),
            vec3(0.3, 0.3, 0.3),
            vec3(1.0, 1.0, 0.5),
            vec3(0.10, 0.20, 0.30)
        );
    }

    return color;
}

vec3 shade(vec3 ro, vec3 rd, float dist, float stepRatio) {
    vec3 p = ro + rd * dist;
    vec3 n = estimateNormal(p);
    float ao = calcAO(p, n);

    // Simple directional light
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(n, lightDir), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Color based on position + normal for variation
    float colorIndex = dot(p, vec3(0.3, 0.5, 0.7)) * 0.5 + stepRatio;
    vec3 color = getColor(colorIndex, n, ao);

    // Combine lighting
    vec3 lit = color * (0.15 + 0.7 * diff * ao + 0.15 * rim);

    // Fog
    float fogAmount;
    if (uVisualStyle == 0) {
        // Dark: heavy fog to black
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.5);
        lit = mix(lit, vec3(0.0), fogAmount);
    } else if (uVisualStyle == 1) {
        // Psychedelic: light fog, preserve color
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.2);
        lit = mix(lit, vec3(0.02), fogAmount);
    } else if (uVisualStyle == 2) {
        // Geometric: fog to dark grey
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.4);
        lit = mix(lit, vec3(0.05), fogAmount);
    } else {
        // Ambient: gentle fog to warm dark
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.3);
        lit = mix(lit, vec3(0.03, 0.02, 0.04), fogAmount);
    }

    return lit;
}

// ============================================================
// Section: Main
// ============================================================

void main() {
    // Aspect-corrected UV
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

    // Build camera ray
    vec3 forward = normalize(uCameraDir);
    vec3 right = normalize(cross(forward, uCameraUp));
    vec3 up = cross(right, forward);

    float fov = 1.5; // ~73 degrees
    vec3 rd = normalize(uv.x * right + uv.y * up + fov * forward);
    vec3 ro = uCameraPos;

    // March
    vec2 result = march(ro, rd);
    float dist = result.x;
    float stepRatio = result.y;

    vec3 color;

    if (dist > 0.0) {
        // Hit -- shade the surface
        color = shade(ro, rd, dist, stepRatio);
    } else {
        // Miss -- background + glow from near-misses
        float closestApproach = result.y;

        // Background color per style
        if (uVisualStyle == 0) {
            color = vec3(0.0); // black
        } else if (uVisualStyle == 1) {
            color = vec3(0.02, 0.01, 0.03); // near-black purple
        } else if (uVisualStyle == 2) {
            color = vec3(0.03); // dark grey
        } else {
            color = vec3(0.02, 0.015, 0.025); // warm dark
        }

        // Edge glow -- rays that passed close to surface
        float glow = exp(-closestApproach * 50.0) * uGlowIntensity;
        vec3 glowColor;
        if (uVisualStyle == 0) {
            glowColor = vec3(0.3, 0.4, 0.8); // blue glow
        } else if (uVisualStyle == 1) {
            glowColor = iqPalette(uTime * 0.03,
                vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
        } else if (uVisualStyle == 2) {
            glowColor = uAccentColor;
        } else {
            glowColor = vec3(0.5, 0.4, 0.6);
        }
        color += glowColor * glow;
    }

    // Apply brightness
    color *= uBrightness;
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
```

**Step 4: Create minimal `main.js`**

Minimal scene: loads shaders, creates fullscreen quad, fixed camera pointing at the Mandelbulb. No settings panel, no autopilot, no input -- just validates the shader renders correctly.

```javascript
import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';

// --- Load shaders ---
const [vertSrc, fragSrc] = await Promise.all([
    loadShader('./fractal.vert'),
    loadShader('./fractal.frag'),
]);

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, {
    background: 0x000000,
    orbitControls: false,
});

// Replace camera with ortho for fullscreen quad
mgr.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// --- Uniforms ---
const uniforms = {
    uTime:          { value: 0.0 },
    uResolution:    { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uCameraPos:     { value: new THREE.Vector3(0.0, 0.0, 2.5) },
    uCameraDir:     { value: new THREE.Vector3(0.0, 0.0, -1.0) },
    uCameraUp:      { value: new THREE.Vector3(0.0, 1.0, 0.0) },
    // Fractal
    uFractalType:   { value: 0 },
    uPower:         { value: 8.0 },
    uFoldLimit:     { value: 1.0 },
    uBoxScale:      { value: 2.0 },
    uMorphProgress: { value: 0.0 },
    // Visual
    uVisualStyle:   { value: 0 },
    uAOStrength:    { value: 5.0 },
    uFogDensity:    { value: 1.0 },
    uGlowIntensity:{ value: 0.5 },
    uBrightness:    { value: 1.0 },
    uAccentColor:   { value: new THREE.Vector3(0.2, 0.6, 1.0) },
    // Quality
    uMaxIterations: { value: 80 },
};

const material = createShaderMaterial(vertSrc, fragSrc, uniforms);

// --- Fullscreen quad ---
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
mgr.scene.add(quad);

// --- Resolution tracking ---
function updateResolution() {
    const dpr = window.devicePixelRatio;
    uniforms.uResolution.value.set(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
    );
}
const origResize = mgr.resize.bind(mgr);
mgr.resize = () => { origResize(); updateResolution(); };
updateResolution();

// --- Animation loop ---
mgr.start((dt) => {
    uniforms.uTime.value += dt;
});
```

**Step 5: Verify in browser**

Run: `npm run serve`
Open: `http://localhost:3000/3d/scenes/raymarched-fractal/`
Expected: A static Mandelbulb fractal visible on screen, dark background, basic lighting. Camera is fixed at (0, 0, 2.5) looking at origin.

**Step 6: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/
git commit -m "feat(raymarched-fractal): scaffold scene with Mandelbulb raymarching"
```

---

### Task 2: Autopilot camera

Add the noise-driven autopilot path so the camera slowly flies through/around the fractal.

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Add noise import and autopilot state**

Add to imports at top of `main.js`:

```javascript
import { simplex3D } from '../../lib/utils/noise.js';
```

Add after the uniforms block, before the animation loop:

```javascript
// --- Autopilot ---
// Noise-based path that wanders through the fractal's bounding volume.
// Three noise channels at different offsets produce an organic 3D path.

const AUTOPILOT_SCALE = 0.015;  // How fast the path evolves
const AUTOPILOT_RADIUS = 1.8;   // How far from origin the path wanders

function getAutopilotPos(t) {
    const s = t * AUTOPILOT_SCALE;
    return new THREE.Vector3(
        simplex3D(s, 0.0, 0.0) * AUTOPILOT_RADIUS,
        simplex3D(0.0, s, 100.0) * AUTOPILOT_RADIUS * 0.6,
        simplex3D(0.0, 100.0, s) * AUTOPILOT_RADIUS,
    );
}

function getAutopilotDir(t) {
    const dt = 0.5;
    const p0 = getAutopilotPos(t);
    const p1 = getAutopilotPos(t + dt);
    return p1.sub(p0).normalize();
}

let autopilotTime = 0;
const speed = 0.8; // units/sec -- slow and contemplative
```

**Step 2: Update animation loop to use autopilot**

Replace the animation loop with:

```javascript
// --- Animation loop ---
mgr.start((dt) => {
    const clampedDt = Math.min(dt, 0.1);
    uniforms.uTime.value += clampedDt;

    // Advance autopilot
    autopilotTime += speed * clampedDt;

    // Set camera from autopilot path
    const pos = getAutopilotPos(autopilotTime);
    const dir = getAutopilotDir(autopilotTime);
    const up = new THREE.Vector3(0, 1, 0);

    // Gentle roll oscillation for cinematic feel
    const rollAngle = Math.sin(autopilotTime * 0.1) * 0.15;
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    up.applyAxisAngle(dir, rollAngle);

    uniforms.uCameraPos.value.copy(pos);
    uniforms.uCameraDir.value.copy(dir);
    uniforms.uCameraUp.value.copy(up);
});
```

**Step 3: Verify in browser**

Run: `npm run serve`
Expected: Camera slowly drifts through the Mandelbulb on a smooth, organic path. The view gently rolls side to side.

**Step 4: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): add noise-driven autopilot camera"
```

---

### Task 3: Settings panel + fractal type switching

Wire up the full settings panel and make fractal type switching work.

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Add settings and chrome imports**

Add to imports:

```javascript
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
```

**Step 2: Add the full settings panel**

Add after the `mgr` creation, before the uniforms block. The settings panel provides all the configurable parameters. The uniforms block should then read initial values from `settings.get(key)` instead of hardcoded defaults.

```javascript
// --- Fractal type mapping ---
const FRACTAL_MAP = {
    'Mandelbulb': 0,
    'Mandelbox': 1,
    'Menger Sponge': 2,
    'Hybrid': 3,
};

const STYLE_MAP = {
    'Dark & Atmospheric': 0,
    'Psychedelic': 1,
    'Geometric': 2,
    'Ambient': 3,
};

const QUALITY_PRESETS = {
    'Low':    { iterations: 40,  resolution: 0.25 },
    'Medium': { iterations: 80,  resolution: 0.5  },
    'High':   { iterations: 120, resolution: 0.75 },
    'Ultra':  { iterations: 200, resolution: 1.0  },
};

// --- Settings ---
const settings = new SettingsPanel('raymarched-fractal', { title: 'Raymarched Fractal' });
settings
    // Fractal
    .addDropdown('fractalType', 'Fractal Type', Object.keys(FRACTAL_MAP), 'Mandelbulb')
    .addSlider('power', 'Power', 2, 20, 0.5, 8)
    .addSlider('foldLimit', 'Fold Limit', 0.5, 2.0, 0.05, 1.0)
    .addSlider('boxScale', 'Box Scale', -3.0, 3.0, 0.1, 2.0)
    .addSlider('morphSpeed', 'Morph Speed', 0.05, 2.0, 0.05, 0.3)
    // Visual
    .addDropdown('visualStyle', 'Visual Style', Object.keys(STYLE_MAP), 'Dark & Atmospheric')
    .addSlider('aoStrength', 'AO Strength', 0, 15, 0.5, 5)
    .addSlider('fogDensity', 'Fog Density', 0, 5, 0.1, 1.0)
    .addSlider('glowIntensity', 'Glow Intensity', 0, 2, 0.05, 0.5)
    .addSlider('brightness', 'Brightness', 0.2, 3.0, 0.1, 1.0)
    .addColor('accentColor', 'Accent Color', '#3399ff')
    // Quality
    .addDropdown('quality', 'Quality', Object.keys(QUALITY_PRESETS), 'Medium')
    .addSlider('maxIterations', 'Max Iterations', 20, 300, 10, 80)
    .addSlider('resolutionScale', 'Resolution Scale', 0.25, 1.0, 0.05, 0.5)
    // Flight
    .addSlider('speed', 'Speed', 0.1, 5.0, 0.1, 0.8)
    .addSlider('yawSensitivity', 'Yaw/Roll Sensitivity', 0.1, 3.0, 0.1, 1.0)
    .addSlider('pitchSensitivity', 'Pitch Sensitivity', 0.1, 3.0, 0.1, 1.0)
    // Auto-camera
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30);
```

**Step 3: Wire fractal-specific setting visibility**

After the settings panel, add logic to enable/disable fractal-specific sliders based on the selected type:

```javascript
// --- Fractal-specific setting visibility ---
function updateFractalUI(type) {
    const isMandelbulb = type === 'Mandelbulb';
    const isMandelbox = type === 'Mandelbox';
    const isHybrid = type === 'Hybrid';

    const powerCtrl = settings.controller('power');
    const foldCtrl = settings.controller('foldLimit');
    const scaleCtrl = settings.controller('boxScale');
    const morphCtrl = settings.controller('morphSpeed');

    isMandelbulb || isHybrid ? powerCtrl.enable() : powerCtrl.disable();
    isMandelbox || isHybrid ? foldCtrl.enable() : foldCtrl.disable();
    isMandelbox || isHybrid ? scaleCtrl.enable() : scaleCtrl.disable();
    isHybrid ? morphCtrl.enable() : morphCtrl.disable();
}
updateFractalUI(settings.get('fractalType'));
settings.onChange('fractalType', updateFractalUI);
```

**Step 4: Wire quality presets**

```javascript
// --- Quality preset ---
settings.onChange('quality', (preset) => {
    const p = QUALITY_PRESETS[preset];
    if (p) {
        settings.values.maxIterations = p.iterations;
        settings.controller('maxIterations').updateDisplay();
        settings.values.resolutionScale = p.resolution;
        settings.controller('resolutionScale').updateDisplay();
    }
});
```

Note: `updateDisplay()` is a lil-gui method that refreshes the controller's visual to match the current value without firing onChange.

**Step 5: Update uniforms to read from settings**

Replace the hardcoded uniform values with settings reads:

```javascript
const uniforms = {
    uTime:          { value: 0.0 },
    uResolution:    { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uCameraPos:     { value: new THREE.Vector3(0.0, 0.0, 2.5) },
    uCameraDir:     { value: new THREE.Vector3(0.0, 0.0, -1.0) },
    uCameraUp:      { value: new THREE.Vector3(0.0, 1.0, 0.0) },
    uFractalType:   { value: FRACTAL_MAP[settings.get('fractalType')] },
    uPower:         { value: settings.get('power') },
    uFoldLimit:     { value: settings.get('foldLimit') },
    uBoxScale:      { value: settings.get('boxScale') },
    uMorphProgress: { value: 0.0 },
    uVisualStyle:   { value: STYLE_MAP[settings.get('visualStyle')] },
    uAOStrength:    { value: settings.get('aoStrength') },
    uFogDensity:    { value: settings.get('fogDensity') },
    uGlowIntensity:{ value: settings.get('glowIntensity') },
    uBrightness:    { value: settings.get('brightness') },
    uAccentColor:   { value: new THREE.Vector3(0.2, 0.6, 1.0) },
    uMaxIterations: { value: settings.get('maxIterations') },
};
```

**Step 6: Add settings change handlers + accent color parsing**

```javascript
// --- Settings reactivity ---
settings.onChange('fractalType', (v) => { uniforms.uFractalType.value = FRACTAL_MAP[v]; });
settings.onChange('power', (v) => { uniforms.uPower.value = v; });
settings.onChange('foldLimit', (v) => { uniforms.uFoldLimit.value = v; });
settings.onChange('boxScale', (v) => { uniforms.uBoxScale.value = v; });
settings.onChange('visualStyle', (v) => { uniforms.uVisualStyle.value = STYLE_MAP[v]; });
settings.onChange('aoStrength', (v) => { uniforms.uAOStrength.value = v; });
settings.onChange('fogDensity', (v) => { uniforms.uFogDensity.value = v; });
settings.onChange('glowIntensity', (v) => { uniforms.uGlowIntensity.value = v; });
settings.onChange('brightness', (v) => { uniforms.uBrightness.value = v; });
settings.onChange('maxIterations', (v) => { uniforms.uMaxIterations.value = v; });

// Accent color: hex string -> vec3
function setAccentColor(hex) {
    const c = new THREE.Color(hex);
    uniforms.uAccentColor.value.set(c.r, c.g, c.b);
}
setAccentColor(settings.get('accentColor'));
settings.onChange('accentColor', setAccentColor);
```

**Step 7: Add resolution scaling**

After the `updateResolution` function, add resolution scale support:

```javascript
// --- Resolution scaling ---
function applyResolutionScale() {
    const scale = settings.get('resolutionScale');
    const dpr = window.devicePixelRatio * scale;
    mgr.renderer.setPixelRatio(dpr);
    mgr.renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
    );
}
applyResolutionScale();
settings.onChange('resolutionScale', applyResolutionScale);

// Update the resize handler to respect scale
mgr.resize = () => {
    origResize();
    applyResolutionScale();
};
```

**Step 8: Add AutoCamera + ChromeController (pattern consistency)**

```javascript
// --- AutoCamera (pattern consistency) ---
const autoCamera = new AutoCamera(mgr.camera, null);
autoCamera.setTarget(() => ({ position: new THREE.Vector3(0, 0, 0) }));

function updateAutoCamUI(enabled) {
    const ctrl = settings.controller('autoCamTimeout');
    enabled ? ctrl.enable() : ctrl.disable();
}
updateAutoCamUI(settings.get('autoCamEnabled'));
settings.onChange('autoCamEnabled', updateAutoCamUI);

// --- Auto-Camera Timer ---
let autoCamTimer = null;
function resetAutoCamTimer() {
    if (autoCamTimer) clearTimeout(autoCamTimer);
    if (settings.get('autoCamEnabled')) {
        autoCamTimer = setTimeout(
            () => { /* autopilot return handled in Task 7 */ },
            settings.get('autoCamTimeout') * 1000,
        );
    }
}

// --- Chrome ---
const chrome = new ChromeController([settings.domElement], {
    onActive: () => resetAutoCamTimer(),
});
resetAutoCamTimer();
settings.onChange('autoCamEnabled', () => resetAutoCamTimer());
settings.onChange('autoCamTimeout', () => resetAutoCamTimer());
```

**Step 9: Update animation loop**

Add morph progress animation and read speed from settings:

```javascript
// --- Animation loop ---
let morphPhase = 0;

mgr.start((dt) => {
    const clampedDt = Math.min(dt, 0.1);
    uniforms.uTime.value += clampedDt;

    // Morph progress (hybrid mode)
    morphPhase += clampedDt * settings.get('morphSpeed');
    uniforms.uMorphProgress.value = 0.5 + 0.5 * Math.sin(morphPhase);

    // Autopilot
    const currentSpeed = settings.get('speed');
    autopilotTime += currentSpeed * clampedDt;

    const pos = getAutopilotPos(autopilotTime);
    const dir = getAutopilotDir(autopilotTime);
    const up = new THREE.Vector3(0, 1, 0);

    const rollAngle = Math.sin(autopilotTime * 0.1) * 0.15;
    up.applyAxisAngle(dir, rollAngle);

    uniforms.uCameraPos.value.copy(pos);
    uniforms.uCameraDir.value.copy(dir);
    uniforms.uCameraUp.value.copy(up);

    // Sync all per-frame uniforms from settings
    uniforms.uPower.value = settings.get('power');
    uniforms.uFoldLimit.value = settings.get('foldLimit');
    uniforms.uBoxScale.value = settings.get('boxScale');
});
```

**Step 10: Verify in browser**

Expected: Settings panel visible in top-right corner. Changing "Fractal Type" dropdown switches between Mandelbulb, Mandelbox, Menger Sponge, and Hybrid. Visual Style dropdown changes lighting/coloring. Quality dropdown adjusts iteration/resolution sliders. Irrelevant sliders are greyed out per fractal type.

**Step 11: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): add settings panel with fractal/style/quality presets"
```

---

### Task 4: Keyboard steering

Add WASD/arrow key controls for plane heading (yaw+roll, pitch).

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Add keyboard state tracking**

Add after the settings change handlers, before the autopilot section:

```javascript
// --- Keyboard input ---
// Tracks which keys are currently held down for continuous steering.
const keys = {};
document.addEventListener('keydown', (e) => {
    // Don't capture when typing in settings panel
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keys[e.code] = true;
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
```

**Step 2: Add plane orientation state**

Add with the autopilot state variables:

```javascript
// --- Plane state ---
// The plane's orientation is stored as a quaternion.
// Keyboard input applies yaw/pitch/roll rotations to it.
// In autopilot, this quaternion is driven by the noise path.
const planeQuat = new THREE.Quaternion();
const planePos = new THREE.Vector3();
let manualControl = false; // true when user is actively steering
```

**Step 3: Add steering logic to animation loop**

In the animation loop, add keyboard handling between the time update and the camera uniform writes. The plane always moves forward along its heading. Keyboard rotates the heading.

```javascript
    // --- Keyboard steering ---
    const yawRate = settings.get('yawSensitivity') * clampedDt;
    const pitchRate = settings.get('pitchSensitivity') * clampedDt;
    let steering = false;

    if (keys['ArrowLeft'] || keys['KeyA']) {
        // Yaw left + roll left
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), yawRate));
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), yawRate * 0.3));
        steering = true;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
        // Yaw right + roll right
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), -yawRate));
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), -yawRate * 0.3));
        steering = true;
    }
    if (keys['ArrowUp'] || keys['KeyW']) {
        // Pitch up
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), pitchRate));
        steering = true;
    }
    if (keys['ArrowDown'] || keys['KeyS']) {
        // Pitch down
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), -pitchRate));
        steering = true;
    }

    if (steering && !manualControl) {
        manualControl = true;
    }
```

**Step 4: Update camera logic for manual vs autopilot**

Replace the current autopilot camera section in the animation loop with a branching approach:

```javascript
    // --- Camera ---
    const currentSpeed = settings.get('speed');
    autopilotTime += currentSpeed * clampedDt;

    if (!manualControl) {
        // Autopilot: position and direction from noise
        const pos = getAutopilotPos(autopilotTime);
        const dir = getAutopilotDir(autopilotTime);

        planePos.copy(pos);

        // Set quaternion from direction
        const lookMat = new THREE.Matrix4().lookAt(
            new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
        planeQuat.setFromRotationMatrix(lookMat);

        // Gentle roll
        const rollAngle = Math.sin(autopilotTime * 0.1) * 0.15;
        planeQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), rollAngle));
    } else {
        // Manual: move forward along plane's heading
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
        planePos.addScaledVector(forward, currentSpeed * clampedDt);
    }

    // Extract camera vectors from quaternion
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuat);

    uniforms.uCameraPos.value.copy(planePos);
    uniforms.uCameraDir.value.copy(camDir);
    uniforms.uCameraUp.value.copy(camUp);
```

**Step 5: Verify in browser**

Expected: Scene starts in autopilot mode (same as before). Pressing arrow keys or WASD steers the plane. Left/Right yaws + rolls, Up/Down pitches. Camera always moves forward. Releasing keys does NOT return to autopilot yet (that's Task 6).

**Step 6: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): add keyboard steering (yaw/roll/pitch)"
```

---

### Task 5: Mouse freelook

Add mouse drag to rotate the view independently of the flight path.

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Add mouse state tracking**

Add after the keyboard state section:

```javascript
// --- Mouse freelook ---
// Freelook rotates the VIEW without affecting the plane's heading or path.
// Stored as yaw/pitch offsets from the plane's forward direction.
let freelookYaw = 0;
let freelookPitch = 0;
let mouseDown = false;
const MOUSE_SENSITIVITY = 0.003;

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
});
document.addEventListener('mouseup', () => {
    mouseDown = false;
});
document.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    freelookYaw -= e.movementX * MOUSE_SENSITIVITY;
    freelookPitch -= e.movementY * MOUSE_SENSITIVITY;
    // Clamp pitch to avoid flipping
    freelookPitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, freelookPitch));
});
```

**Step 2: Apply freelook offset to camera direction**

In the animation loop, after computing `camDir` and `camUp` from the plane quaternion, apply the freelook offset:

```javascript
    // Apply freelook offset (view only, not flight path)
    if (freelookYaw !== 0 || freelookPitch !== 0) {
        const freelookQuat = new THREE.Quaternion();
        // Yaw around the plane's up axis
        freelookQuat.multiply(new THREE.Quaternion().setFromAxisAngle(camUp.clone(), freelookYaw));
        // Pitch around the plane's right axis
        const camRight = new THREE.Vector3().crossVectors(camDir, camUp).normalize();
        freelookQuat.multiply(new THREE.Quaternion().setFromAxisAngle(camRight, freelookPitch));

        camDir.applyQuaternion(freelookQuat);
        camUp.applyQuaternion(freelookQuat);
    }

    uniforms.uCameraPos.value.copy(planePos);
    uniforms.uCameraDir.value.copy(camDir);
    uniforms.uCameraUp.value.copy(camUp);
```

**Step 3: Verify in browser**

Expected: Click and drag on the canvas to look around. The flight path continues unchanged. Release mouse -- the view stays where you looked. Keyboard steering still works independently.

**Step 4: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): add mouse freelook"
```

---

### Task 6: Idle reset + autopilot handoff

Wire the ChromeController's idle/active callbacks to smoothly return to autopilot.

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Add transition state**

Add with the plane state variables:

```javascript
// --- Autopilot transition ---
let returningToAutopilot = false;
let transitionProgress = 0;
const TRANSITION_DURATION = 2.0; // seconds
let transitionStartPos = new THREE.Vector3();
let transitionStartQuat = new THREE.Quaternion();
```

**Step 2: Wire idle callback to trigger return**

Update the `resetAutoCamTimer` function:

```javascript
function resetAutoCamTimer() {
    if (autoCamTimer) clearTimeout(autoCamTimer);
    // If user is active, cancel any return transition and re-enable manual
    if (returningToAutopilot) {
        returningToAutopilot = false;
    }
    if (settings.get('autoCamEnabled')) {
        autoCamTimer = setTimeout(() => {
            beginReturnToAutopilot();
        }, settings.get('autoCamTimeout') * 1000);
    }
}

function beginReturnToAutopilot() {
    if (!manualControl && freelookYaw === 0 && freelookPitch === 0) return;
    returningToAutopilot = true;
    transitionProgress = 0;
    transitionStartPos.copy(planePos);
    transitionStartQuat.copy(planeQuat);
}
```

**Step 3: Add transition logic to animation loop**

Replace the camera section with the full autopilot/manual/transition logic:

```javascript
    // --- Camera ---
    const currentSpeed = settings.get('speed');
    autopilotTime += currentSpeed * clampedDt;

    // Autopilot target (always computed so we have a return target)
    const autopilotPos = getAutopilotPos(autopilotTime);
    const autopilotDir = getAutopilotDir(autopilotTime);
    const autopilotQuat = new THREE.Quaternion();
    const lookMat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(), autopilotDir, new THREE.Vector3(0, 1, 0));
    autopilotQuat.setFromRotationMatrix(lookMat);
    const rollAngle = Math.sin(autopilotTime * 0.1) * 0.15;
    autopilotQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), rollAngle));

    if (returningToAutopilot) {
        // Smooth transition back to autopilot
        transitionProgress += clampedDt / TRANSITION_DURATION;
        const t = smoothstep(Math.min(transitionProgress, 1.0));

        planePos.lerpVectors(transitionStartPos, autopilotPos, t);
        planeQuat.slerpQuaternions(transitionStartQuat, autopilotQuat, t);

        // Lerp freelook back to zero
        freelookYaw *= (1.0 - t);
        freelookPitch *= (1.0 - t);

        if (transitionProgress >= 1.0) {
            returningToAutopilot = false;
            manualControl = false;
            freelookYaw = 0;
            freelookPitch = 0;
        }
    } else if (!manualControl) {
        // Pure autopilot
        planePos.copy(autopilotPos);
        planeQuat.copy(autopilotQuat);
    } else {
        // Manual: move forward along plane's heading
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
        planePos.addScaledVector(forward, currentSpeed * clampedDt);
    }

    // Extract camera vectors
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuat);

    // Apply freelook
    if (freelookYaw !== 0 || freelookPitch !== 0) {
        const freelookQuat = new THREE.Quaternion();
        freelookQuat.multiply(new THREE.Quaternion().setFromAxisAngle(camUp.clone(), freelookYaw));
        const camRight = new THREE.Vector3().crossVectors(camDir, camUp).normalize();
        freelookQuat.multiply(new THREE.Quaternion().setFromAxisAngle(camRight, freelookPitch));
        camDir.applyQuaternion(freelookQuat);
        camUp.applyQuaternion(freelookQuat);
    }

    uniforms.uCameraPos.value.copy(planePos);
    uniforms.uCameraDir.value.copy(camDir);
    uniforms.uCameraUp.value.copy(camUp);
```

**Step 4: Add smoothstep helper**

Add near the top of the file (after imports):

```javascript
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}
```

**Step 5: Verify in browser**

Expected:
1. Scene starts in autopilot (camera wanders).
2. Press arrow keys to steer -- camera switches to manual.
3. Stop pressing keys and wait for the inactivity timeout (default 30s).
4. Camera smoothly glides back to the autopilot path over ~2 seconds.
5. Mouse freelook also resets to center during the transition.

**Step 6: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): add idle reset + autopilot return transition"
```

---

### Task 7: Polish and tuning

Tune the autopilot path per fractal type, clean up the code, and handle edge cases.

**Files:**
- Modify: `site/3d/scenes/raymarched-fractal/main.js`

**Step 1: Adjust autopilot radius per fractal type**

Different fractals have different bounding volumes. Adjust the noise path scale:

```javascript
function getAutopilotRadius() {
    const type = settings.get('fractalType');
    switch (type) {
        case 'Mandelbulb':    return 1.8;
        case 'Mandelbox':     return 4.0;
        case 'Menger Sponge': return 1.2;
        case 'Hybrid':        return 2.5;
        default:              return 2.0;
    }
}
```

Update `getAutopilotPos` to use `getAutopilotRadius()` instead of the constant.

**Step 2: Prevent camera from being inside the fractal surface**

When the camera ends up inside geometry, the raymarcher produces visual garbage. Add a safety check: if DE(cameraPos) is very small (camera is inside the surface), push the camera outward along its direction.

This is best done by sampling the DE from JavaScript. However, since DE is in the shader, we can't call it from JS. Instead, use a simpler heuristic: if the screen is mostly black for many frames (all rays miss or hit immediately), reset to a known-good position.

For now, just ensure the noise path stays at a safe distance by tuning the Y-axis amplitude to be less aggressive (the fractals tend to extend less vertically):

```javascript
function getAutopilotPos(t) {
    const s = t * AUTOPILOT_SCALE;
    const r = getAutopilotRadius();
    return new THREE.Vector3(
        simplex3D(s, 0.0, 0.0) * r,
        simplex3D(0.0, s, 100.0) * r * 0.4,
        simplex3D(0.0, 100.0, s) * r,
    );
}
```

**Step 3: Handle tab visibility (pause when hidden)**

When the user switches tabs, `dt` can be very large. The `Math.min(dt, 0.1)` clamp handles this, but we should also pause the autopilot time advance when the tab is hidden to prevent the path from jumping:

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        mgr.stop();
    } else {
        mgr.start(animationLoop);
    }
});
```

This requires extracting the animation callback to a named function. Refactor: move the animation loop callback into a `const animationLoop = (dt) => { ... }` and call `mgr.start(animationLoop)`.

**Step 4: Verify in browser**

Expected: Switching between fractal types adjusts the autopilot path radius. Switching tabs and returning doesn't cause a jarring jump. The camera stays at a reasonable distance from the fractal surface.

**Step 5: Commit**

```bash
git add site/3d/scenes/raymarched-fractal/main.js
git commit -m "feat(raymarched-fractal): tune autopilot per fractal, handle tab visibility"
```

---

### Task 8: Integration

Add the scene to the landing page, regenerate architecture diagrams, and update ARCHITECTURE.md.

**Files:**
- Modify: `site/index.html`
- Modify: `site/3d/ARCHITECTURE.md`
- Regenerate: `site/3d/diagrams/` (via `npm run diagrams`)

**Step 1: Add link to landing page**

In `site/index.html`, add a new `<li>` in the "3D Scenes" list, after the Fractal Dreamscape entry:

```html
        <li><a href="3d/scenes/raymarched-fractal/">Raymarched Fractal</a></li>
```

**Step 2: Regenerate diagrams**

```bash
npm run diagrams
```

This updates `module-dependencies.mmd`, `class-hierarchy.mmd`, and `graph-data.json`.

**Step 3: Update ARCHITECTURE.md**

Add the new scene to the "Overview" section's scene list:

```markdown
- **Raymarched Fractal** -- A GPU-raymarched 3D fractal flythrough with four fractal types (Mandelbulb, Mandelbox, Menger Sponge, Hybrid morph), four visual styles, quality presets, and a cockpit-style camera with noise-driven autopilot.
```

Add a new entry in the Directory Structure under `scenes/`:

```
|   |   +-- raymarched-fractal/
|   |   |   +-- index.html
|   |   |   +-- main.js
|   |   |   +-- fractal.vert          # Passthrough vertex shader (fullscreen quad)
|   |   |   +-- fractal.frag          # Raymarching engine: 4 DEs + lighting + styles
```

Add a scene description section after the existing scene descriptions (e.g., after the boids or fractal-dreamscape section -- match the ordering used in the file).

**Step 4: Verify the pre-commit hook passes**

```bash
npm run diagrams -- --check
```

Expected: Exit code 0 (diagrams up to date).

**Step 5: Commit everything**

```bash
git add site/index.html site/3d/ARCHITECTURE.md site/3d/diagrams/ site/3d/scenes/raymarched-fractal/
git commit -m "feat(raymarched-fractal): integrate into landing page, update architecture docs"
```

**Step 6: Final verification**

Run `npm run serve` and:
1. Open `http://localhost:3000/` -- verify the "Raymarched Fractal" link appears
2. Click it -- verify the scene loads and runs
3. Test each fractal type via the dropdown
4. Test each visual style
5. Test quality presets (Low should be visibly pixelated, Ultra should be smooth)
6. Test keyboard steering + return to autopilot
7. Test mouse freelook + idle reset
8. Test fullscreen (press F or double-click)

---

Plan complete and saved to `docs/plans/2026-02-13-raymarched-fractal-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
