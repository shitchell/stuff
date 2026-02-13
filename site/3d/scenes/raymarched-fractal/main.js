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
