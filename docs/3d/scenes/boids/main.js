import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { hslToHex } from '../../lib/utils/color.js';
import { map, clamp } from '../../lib/utils/math.js';
import { BoidSimulation } from './boids.js';

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, { background: 0x000000 });
mgr.camera.position.set(0, 40, 80);
mgr.controls.target.set(0, 0, 0);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
mgr.scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(30, 50, 20);
mgr.scene.add(dirLight);

// Subtle fog for depth perception
mgr.scene.fog = new THREE.FogExp2(0x000000, 0.008);

// --- Settings ---
const settings = new SettingsPanel('boids', { title: 'Boids' });
settings
    .addSlider('boidCount', 'Boid Count', 50, 2000, 50, 500)
    .addSlider('speed', 'Speed', 0.1, 5.0, 0.1, 1.0)
    .addSlider('separation', 'Separation', 0.0, 3.0, 0.1, 1.5)
    .addSlider('alignment', 'Alignment', 0.0, 3.0, 0.1, 1.0)
    .addSlider('cohesion', 'Cohesion', 0.0, 3.0, 0.1, 1.0)
    .addSlider('separationRadius', 'Sep. Radius', 1, 20, 1, 5)
    .addSlider('neighborRadius', 'Neighbor Radius', 5, 50, 1, 15)
    .addDropdown('colorMode', 'Color Mode', ['velocity', 'group', 'rainbow'], 'velocity')
    .addToggle('paused', 'Paused', false)
    .addButton('Reset', () => {
        boids.rebuild(settings.get('boidCount'), mgr.scene);
        updateColors();
    })
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'orbit');

// When boid count changes, rebuild the simulation
settings.onChange('boidCount', (count) => {
    boids.rebuild(count, mgr.scene);
    updateColors();
});

// --- Boid Simulation ---
let boids = new BoidSimulation(mgr.scene, settings.get('boidCount'));

// --- Color utilities ---
// Group palette: 8 distinct colors for group mode
const GROUP_PALETTE = [
    new THREE.Color('#ff4444'),
    new THREE.Color('#44aaff'),
    new THREE.Color('#44ff88'),
    new THREE.Color('#ffaa44'),
    new THREE.Color('#ff44ff'),
    new THREE.Color('#44ffff'),
    new THREE.Color('#ffff44'),
    new THREE.Color('#ff8888'),
];

const tempColor = new THREE.Color();

function updateColors() {
    const mode = settings.get('colorMode');
    const count = boids.count;
    const maxSpeed = 8 * settings.get('speed');

    for (let i = 0; i < count; i++) {
        if (mode === 'velocity') {
            // Color by speed: slow = blue, fast = red/orange
            const spd = boids.getSpeed(i);
            const t = clamp(spd / maxSpeed, 0, 1);
            // Hue: 240 (blue) down to 0 (red)
            const hue = map(t, 0, 1, 240, 0);
            tempColor.set(hslToHex(hue, 85, 55));
            boids.setColor(i, tempColor);
        } else if (mode === 'group') {
            // Divide boids into groups, each with a different color
            const groupIndex = i % GROUP_PALETTE.length;
            boids.setColor(i, GROUP_PALETTE[groupIndex]);
        } else if (mode === 'rainbow') {
            // Color by index using HSL
            const hue = (i / count) * 360;
            tempColor.set(hslToHex(hue, 80, 55));
            boids.setColor(i, tempColor);
        }
    }

    boids.colorsNeedUpdate();
}

// Update colors when color mode changes
settings.onChange('colorMode', () => updateColors());

// Set initial colors
updateColors();

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

// --- Animation ---
mgr.start((dt) => {
    if (settings.get('paused')) {
        autoCamera.update(dt);
        return;
    }

    // Run simulation step with current settings
    boids.update(dt, {
        speed: settings.get('speed'),
        separation: settings.get('separation'),
        alignment: settings.get('alignment'),
        cohesion: settings.get('cohesion'),
        separationRadius: settings.get('separationRadius'),
        neighborRadius: settings.get('neighborRadius'),
    });

    // Update boid colors every frame (velocity mode changes per frame)
    updateColors();

    // Auto-camera update
    autoCamera.update(dt);
});
