import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';
import { simplex3D } from '../../lib/utils/noise.js';

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
