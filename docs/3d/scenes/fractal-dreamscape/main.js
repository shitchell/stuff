import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';

// --- Load shaders ---
const [vertSrc, fragSrc] = await Promise.all([
    loadShader('./fractal.vert'),
    loadShader('./fractal.frag'),
]);

// --- Palette name -> int mapping for the shader uniform ---
const PALETTE_MAP = {
    psychedelic: 0,
    fire: 1,
    ocean: 2,
    neon: 3,
    monochrome: 4,
};

// --- Scene ---
// Use SceneManager but we will override the camera with our own orthographic camera.
// orbitControls: false since this is a 2D shader scene.
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, {
    background: 0x000000,
    orbitControls: false,
});

// Replace the default camera with a simple orthographic camera for fullscreen quad
mgr.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// --- Settings ---
const settings = new SettingsPanel('fractal-dreamscape', { title: 'Fractal Dreamscape' });
settings
    .addSlider('symmetry', 'Symmetry', 2, 16, 2, 8)
    .addSlider('zoomSpeed', 'Zoom Speed', 0.0, 2.0, 0.05, 0.3)
    .addSlider('colorSpeed', 'Color Speed', 0.0, 3.0, 0.1, 0.5)
    .addSlider('warpIntensity', 'Warp Intensity', 0.0, 2.0, 0.05, 0.5)
    .addSlider('brightness', 'Brightness', 0.5, 2.0, 0.1, 1.0)
    .addDropdown('palette', 'Palette', {
        'Psychedelic': 'psychedelic',
        'Fire': 'fire',
        'Ocean': 'ocean',
        'Neon': 'neon',
        'Monochrome': 'monochrome',
    }, 'psychedelic')
    .addToggle('paused', 'Paused', false)
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['static', 'orbit', 'drift', 'follow'], 'static');

// --- Shader material ---
const uniforms = {
    uTime:          { value: 0.0 },
    uResolution:    { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uSymmetry:      { value: settings.get('symmetry') },
    uZoomSpeed:     { value: settings.get('zoomSpeed') },
    uColorSpeed:    { value: settings.get('colorSpeed') },
    uWarpIntensity: { value: settings.get('warpIntensity') },
    uJuliaC:        { value: new THREE.Vector2(-0.7, 0.27015) },
    uPalette:       { value: PALETTE_MAP[settings.get('palette')] },
    uBrightness:    { value: settings.get('brightness') },
};

const material = createShaderMaterial(vertSrc, fragSrc, uniforms);

// --- Fullscreen quad ---
const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    material,
);
mgr.scene.add(quad);

// --- Keep resolution uniform updated on resize ---
function updateResolution() {
    const dpr = window.devicePixelRatio;
    uniforms.uResolution.value.set(
        window.innerWidth * dpr,
        window.innerHeight * dpr
    );
}

const origResize = mgr.resize.bind(mgr);
mgr.resize = () => {
    origResize();
    updateResolution();
};

// Set initial value
updateResolution();

// --- Palette change ---
settings.onChange('palette', (v) => {
    uniforms.uPalette.value = PALETTE_MAP[v];
});

// --- Auto-Camera (included for pattern consistency) ---
const autoCamera = new AutoCamera(mgr.camera, null);
autoCamera.setTarget(() => ({ position: new THREE.Vector3(0, 0, 0) }));
autoCamera.setMode(settings.get('autoCamMode'));

settings.onChange('autoCamMode', (v) => autoCamera.setMode(v));

function updateAutoCamUI(enabled) {
    const timeoutCtrl = settings.controller('autoCamTimeout');
    const modeCtrl = settings.controller('autoCamMode');
    if (enabled) {
        timeoutCtrl.enable();
        modeCtrl.enable();
    } else {
        timeoutCtrl.disable();
        modeCtrl.disable();
    }
}
updateAutoCamUI(settings.get('autoCamEnabled'));
settings.onChange('autoCamEnabled', (v) => updateAutoCamUI(v));

// --- Auto-Camera Timer ---
let autoCamTimer = null;
function resetAutoCamTimer() {
    if (autoCamTimer) clearTimeout(autoCamTimer);
    if (autoCamera.active) autoCamera.deactivate();
    if (settings.get('autoCamEnabled')) {
        autoCamTimer = setTimeout(
            () => autoCamera.activate(),
            settings.get('autoCamTimeout') * 1000
        );
    }
}

// --- Chrome ---
const chrome = new ChromeController([settings.domElement], {
    onActive: () => resetAutoCamTimer(),
});

// Start auto-camera timer on load
resetAutoCamTimer();
settings.onChange('autoCamEnabled', () => resetAutoCamTimer());
settings.onChange('autoCamTimeout', () => resetAutoCamTimer());

// --- Julia C parameter animation ---
// Traces a figure-8 / lemniscate path in the complex plane for interesting morphing.
// The path stays within the "connected Julia set" region (roughly |c| < 0.8).
function animateJuliaC(time) {
    // Figure-8 lemniscate of Bernoulli, scaled to stay in interesting region
    const t = time * 0.12;
    const scale = 0.75;
    const sint = Math.sin(t);
    const cost = Math.cos(t);
    const denom = 1.0 + sint * sint;

    // Lemniscate parametrization: x = cos(t)/(1+sin^2(t)), y = sin(t)*cos(t)/(1+sin^2(t))
    const x = scale * cost / denom;
    const y = scale * sint * cost / denom;

    return { x, y };
}

// --- Animation loop ---
let elapsed = 0;

mgr.start((dt) => {
    // Time accumulation (respect paused toggle)
    if (!settings.get('paused')) {
        elapsed += dt;
    }

    // Update time uniform
    uniforms.uTime.value = elapsed;

    // Update all uniforms from settings
    uniforms.uSymmetry.value = settings.get('symmetry');
    uniforms.uZoomSpeed.value = settings.get('zoomSpeed');
    uniforms.uColorSpeed.value = settings.get('colorSpeed');
    uniforms.uWarpIntensity.value = settings.get('warpIntensity');
    uniforms.uBrightness.value = settings.get('brightness');

    // Animate Julia c parameter along figure-8 path
    const jc = animateJuliaC(elapsed);
    uniforms.uJuliaC.value.set(jc.x, jc.y);

    // Auto-camera update (static mode = no-op for 2D scene, but keeps pattern)
    autoCamera.update(dt);
});
