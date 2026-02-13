import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';
import { simplex3D } from '../../lib/utils/noise.js';

// --- Load shaders ---
const [vertSrc, fragSrc] = await Promise.all([
    loadShader('./fractal.vert'),
    loadShader('./fractal.frag'),
]);

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

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, {
    background: 0x000000,
    orbitControls: false,
});

// Replace camera with ortho for fullscreen quad
mgr.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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

// --- Quality preset handler ---
settings.onChange('quality', (preset) => {
    const p = QUALITY_PRESETS[preset];
    if (p) {
        settings.values.maxIterations = p.iterations;
        settings.controller('maxIterations').updateDisplay();
        settings.values.resolutionScale = p.resolution;
        settings.controller('resolutionScale').updateDisplay();
    }
});

// --- Uniforms ---
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
    uAccentColor:   { value: (() => { const c = new THREE.Color(settings.get('accentColor')); return new THREE.Vector3(c.r, c.g, c.b); })() },
    uMaxIterations: { value: settings.get('maxIterations') },
};

const material = createShaderMaterial(vertSrc, fragSrc, uniforms);

// --- Fullscreen quad ---
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
mgr.scene.add(quad);

// --- Settings change handlers ---
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

function setAccentColor(hex) {
    const c = new THREE.Color(hex);
    uniforms.uAccentColor.value.set(c.r, c.g, c.b);
}
setAccentColor(settings.get('accentColor'));
settings.onChange('accentColor', setAccentColor);

// --- Resolution scaling ---
const origResize = mgr.resize.bind(mgr);

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

mgr.resize = () => {
    origResize();
    applyResolutionScale();
};

// --- AutoCamera (pattern consistency -- actual flight is noise-based autopilot) ---
const autoCamera = new AutoCamera(mgr.camera, null);
autoCamera.setTarget(() => ({ position: new THREE.Vector3(0, 0, 0) }));

function updateAutoCamUI(enabled) {
    const ctrl = settings.controller('autoCamTimeout');
    enabled ? ctrl.enable() : ctrl.disable();
}
updateAutoCamUI(settings.get('autoCamEnabled'));
settings.onChange('autoCamEnabled', (v) => updateAutoCamUI(v));

let autoCamTimer = null;
function resetAutoCamTimer() {
    if (autoCamTimer) clearTimeout(autoCamTimer);
    if (settings.get('autoCamEnabled')) {
        autoCamTimer = setTimeout(
            () => { /* autopilot return -- wired in Task 6 */ },
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
let morphPhase = 0;

// --- Animation loop ---
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

    // Gentle roll oscillation for cinematic feel
    const rollAngle = Math.sin(autopilotTime * 0.1) * 0.15;
    up.applyAxisAngle(dir, rollAngle);

    uniforms.uCameraPos.value.copy(pos);
    uniforms.uCameraDir.value.copy(dir);
    uniforms.uCameraUp.value.copy(up);

    // Sync per-frame uniforms from settings
    uniforms.uPower.value = settings.get('power');
    uniforms.uFoldLimit.value = settings.get('foldLimit');
    uniforms.uBoxScale.value = settings.get('boxScale');
});
