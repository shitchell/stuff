import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { hslToHex } from '../../lib/utils/color.js';
import { LorenzTrail, PRESETS } from './attractor.js';

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, { background: 0x0a0a1a });
mgr.camera.position.set(0, 0, 80);
mgr.controls.target.set(0, 0, 25);

// --- Trail management ---
// Trails are stored in an array. When trail count changes, we add/remove
// trails to match. Each trail gets a slightly offset initial condition.
const BASE_INITIAL = new THREE.Vector3(1, 1, 1);
let trails = [];
const trailLines = [];

function getInitialState(index) {
    // Each trail offset by 0.001 * index in x, for sensitivity demo
    return new THREE.Vector3(
        BASE_INITIAL.x + index * 0.001,
        BASE_INITIAL.y,
        BASE_INITIAL.z,
    );
}

// Fixed colors for multi-trail mode (one per trail, from palette)
const TRAIL_COLORS = [
    new THREE.Color('#ff4444'),
    new THREE.Color('#44aaff'),
    new THREE.Color('#44ff88'),
    new THREE.Color('#ffaa44'),
    new THREE.Color('#ff44ff'),
];

function rebuildTrails(count) {
    // Remove old
    trailLines.forEach(line => mgr.scene.remove(line));
    trails.forEach(t => t.geometry.dispose());
    trails.length = 0;
    trailLines.length = 0;

    // Create new
    for (let i = 0; i < count; i++) {
        const trail = new LorenzTrail(getInitialState(i));
        trails.push(trail);
        const mat = new THREE.LineBasicMaterial({ vertexColors: true });
        const line = new THREE.Line(trail.geometry, mat);
        trailLines.push(line);
        mgr.scene.add(line);
    }
}

// --- Settings ---
// IMPORTANT: Preset and individual sigma/rho/beta sliders are LOCKED TOGETHER.
// Selecting a preset updates the sliders to match.
// Manually changing a slider does NOT change the preset dropdown label
// (the dropdown just shows the last-selected preset).
const settings = new SettingsPanel('lorenz', { title: 'Lorenz Attractor' });
settings
    .addDropdown('preset', 'Preset', ['classic', 'chaotic', 'periodic'], 'classic')
    .addSlider('sigma', 'Sigma', 1, 30, 0.1, PRESETS.classic.sigma)
    .addSlider('rho', 'Rho', 1, 120, 0.1, PRESETS.classic.rho)
    .addSlider('beta', 'Beta', 0.1, 10, 0.01, PRESETS.classic.beta)
    .addSlider('speed', 'Speed', 1, 100, 1, 30)
    .addSlider('trailCount', 'Trail Count', 1, 5, 1, 1)
    .addSlider('trailLength', 'Trail Length (0=inf)', 0, 50000, 500, 0)
    .addDropdown('colorMode', 'Color Mode', {
        'By Velocity': 'velocity',
        'By Time': 'time',
        'Fixed Per Trail': 'fixed',
    }, 'velocity')
    .addToggle('paused', 'Paused', false)
    .addButton('Reset', () => rebuildTrails(settings.get('trailCount')))
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'orbit');

// When preset changes, update the sigma/rho/beta sliders
settings.onChange('preset', (name) => {
    const p = PRESETS[name];
    if (p) {
        // Update internal values AND the GUI display
        settings.values.sigma = p.sigma;
        settings.values.rho = p.rho;
        settings.values.beta = p.beta;
        // Force lil-gui to refresh its display
        settings.gui.controllersRecursive().forEach(c => c.updateDisplay());
    }
});

// When trail count changes, rebuild all trails
settings.onChange('trailCount', (count) => rebuildTrails(count));

// --- Auto-Camera ---
const autoCamera = new AutoCamera(mgr.camera, mgr.controls);
autoCamera.setTarget(() => ({ position: new THREE.Vector3(0, 0, 25) }));
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

// --- Initialize ---
rebuildTrails(settings.get('trailCount'));

// --- Animation ---
mgr.start((dt, elapsed) => {
    if (settings.get('paused')) return;

    const speed = settings.get('speed');
    const params = {
        sigma: settings.get('sigma'),
        rho: settings.get('rho'),
        beta: settings.get('beta'),
    };
    const colorMode = settings.get('colorMode');
    const simDt = 0.005; // fixed integration timestep
    const stepsPerFrame = Math.round(speed);

    for (const [i, trail] of trails.entries()) {
        for (let s = 0; s < stepsPerFrame; s++) {
            // Compute color for this point based on mode
            let color;
            if (colorMode === 'velocity') {
                // Color by speed: compute derivative magnitude
                const { sigma, rho, beta } = params;
                const { x, y, z } = trail.state;
                const dx = sigma * (y - x);
                const dy = x * (rho - z) - y;
                const dz = x * y - beta * z;
                const spd = Math.sqrt(dx*dx + dy*dy + dz*dz);
                // Map speed to hue: 0 (slow=blue) to 200 (fast=red)
                const hue = Math.max(0, 240 - spd * 2);
                color = new THREE.Color(hslToHex(hue, 90, 55));
            } else if (colorMode === 'time') {
                // Hue cycles over time
                const hue = ((elapsed * 20) + i * 60) % 360;
                color = new THREE.Color(hslToHex(hue, 80, 55));
            } else {
                // Fixed color per trail
                color = TRAIL_COLORS[i % TRAIL_COLORS.length];
            }

            if (!trail.step(params, simDt, color)) {
                trail.reset(getInitialState(i));
            }
        }

        // Trail length trimming (same pattern as line-walker)
        const trailLen = settings.get('trailLength');
        if (trailLen > 0 && trail.pointCount > trailLen) {
            trail.geometry.setDrawRange(trail.pointCount - trailLen, trailLen);
        }
    }

    // Auto-camera update
    autoCamera.update(dt);
});
