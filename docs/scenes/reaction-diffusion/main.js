import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';
import { ReactionDiffusion, PRESETS } from './simulation.js';

// --- Load shaders ---
const [simVert, simFrag, displayFrag] = await Promise.all([
    loadShader('./reaction-diffusion.vert'),
    loadShader('./reaction-diffusion.frag'),
    loadShader('./display.frag'),
]);

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, { background: 0x0a0a1a });
mgr.camera.position.set(0, 0, 5);
mgr.controls.target.set(0, 0, 0);

// Ambient light for subtle depth cues on the sphere surface
mgr.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// --- Palette mapping: name -> int for the shader uniform ---
const PALETTE_MAP = { organic: 0, thermal: 1, monochrome: 2 };

// --- Settings ---
const settings = new SettingsPanel('reaction-diffusion', { title: 'Reaction-Diffusion' });
settings
    .addDropdown('preset', 'Preset', Object.keys(PRESETS), 'coral')
    .addSlider('feedRate', 'Feed Rate (F)', 0.01, 0.08, 0.0001, PRESETS.coral.f)
    .addSlider('killRate', 'Kill Rate (k)', 0.04, 0.07, 0.0001, PRESETS.coral.k)
    .addSlider('simSpeed', 'Sim Speed (steps/frame)', 1, 20, 1, 10)
    .addDropdown('palette', 'Palette', {
        'Organic': 'organic',
        'Thermal': 'thermal',
        'Monochrome': 'monochrome',
    }, 'organic')
    .addSlider('rotationSpeed', 'Rotation Speed', 0, 2, 0.01, 0.2)
    .addDropdown('resolution', 'Resolution', {
        '128': 128,
        '256': 256,
        '512': 512,
    }, 256)
    .addDropdown('seedPattern', 'Seed Pattern', ['center', 'random', 'ring'], 'center')
    .addButton('Reset', () => resetSimulation())
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'orbit');

// Preset/slider locking: selecting a preset updates F/k sliders (same pattern as Lorenz)
settings.onChange('preset', (name) => {
    const p = PRESETS[name];
    if (p) {
        settings.values.feedRate = p.f;
        settings.values.killRate = p.k;
        settings.gui.controllersRecursive().forEach(c => c.updateDisplay());
        // Also update the simulation parameters
        if (simulation) {
            simulation.setParams(p.f, p.k);
        }
    }
});

// When F/k sliders change manually, update simulation
settings.onChange('feedRate', (v) => {
    if (simulation) simulation.setParams(v, settings.get('killRate'));
});
settings.onChange('killRate', (v) => {
    if (simulation) simulation.setParams(settings.get('feedRate'), v);
});

// --- Auto-Camera ---
const autoCamera = new AutoCamera(mgr.camera, mgr.controls);
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

// --- Display material (for the sphere) ---
// Uses standard Three.js vertex transformation, NOT the fullscreen quad passthrough
const displayVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const displayMaterial = createShaderMaterial(displayVertexShader, displayFrag, {
    uState: { value: null },
    uPalette: { value: PALETTE_MAP[settings.get('palette')] },
});

// --- Sphere ---
const sphereGeo = new THREE.SphereGeometry(2, 64, 64);
const sphere = new THREE.Mesh(sphereGeo, displayMaterial);
mgr.scene.add(sphere);

// --- Simulation ---
let simulation = new ReactionDiffusion(mgr.renderer, settings.get('resolution'), simVert, simFrag);
simulation.setParams(settings.get('feedRate'), settings.get('killRate'));
simulation.seed(settings.get('seedPattern'));

// --- Reset / rebuild simulation ---
function resetSimulation() {
    const res = settings.get('resolution');

    // If resolution changed, rebuild the entire simulation
    if (simulation && simulation.resolution !== res) {
        simulation.dispose();
        simulation = new ReactionDiffusion(mgr.renderer, res, simVert, simFrag);
    }

    simulation.setParams(settings.get('feedRate'), settings.get('killRate'));
    simulation.seed(settings.get('seedPattern'));
}

// Resolution changes require full rebuild
settings.onChange('resolution', () => resetSimulation());

// Palette changes update the display shader uniform
settings.onChange('palette', (v) => {
    displayMaterial.uniforms.uPalette.value = PALETTE_MAP[v];
});

// --- Animation ---
mgr.start((dt) => {
    // Run simulation steps
    const stepsPerFrame = settings.get('simSpeed');
    simulation.step(stepsPerFrame);

    // Update display material with current simulation texture
    displayMaterial.uniforms.uState.value = simulation.texture;

    // Rotate sphere
    const rotationSpeed = settings.get('rotationSpeed');
    sphere.rotation.y += rotationSpeed * dt;

    // Auto-camera update
    autoCamera.update(dt);
});
