import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { colorRamp, hslToHex } from '../../lib/utils/color.js';
import { randomRange } from '../../lib/utils/math.js';
import { Walker } from './walker.js';

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, { background: 0x0a0a1a });
mgr.camera.position.set(10, 10, 10);
mgr.controls.target.set(0, 0, 0);

// --- Settings ---
const settings = new SettingsPanel('line-walker', { title: 'Line Walker' });
settings
    .addSlider('speed', 'Speed (steps/s)', 1, 200, 1, 60)
    .addSlider('stepLength', 'Step Length', 0.05, 2, 0.05, 0.5)
    .addSlider('bias', 'Direction Bias', 0, 1, 0.01, 0.6)
    .addDropdown('colorMode', 'Color Mode', {
        'Rainbow Gradient': 'rainbow',
        'Single Color': 'single',
        'Random Per Segment': 'random',
    }, 'rainbow')
    .addColor('singleColor', 'Color (single mode)', '#00aaff')
    .addSlider('trailLength', 'Trail Length (0=inf)', 0, 10000, 100, 0)
    .addToggle('paused', 'Paused', false)
    .addButton('Reset', () => {
        walker.reset();
        stepAccumulator = 0;
    })
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'drift');

// Color mode note: The three modes work as follows:
// - 'rainbow': Hue cycles smoothly as the line grows (uses colorRamp with 'rainbow' palette)
// - 'single': Entire line is one color, set by the 'singleColor' color picker
// - 'random': Each segment gets a random hue (randomRange(0, 360) → hslToHex)

// --- Auto-Camera ---
const autoCamera = new AutoCamera(mgr.camera, mgr.controls);
autoCamera.setTarget(() => ({ position: walker.tip }));
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

// --- Walker ---
let walker = new Walker({
    stepLength: settings.get('stepLength'),
    bias: settings.get('bias'),
});

// Line material — we'll use vertex colors for the gradient
const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true });

// Allocate color buffer matching position buffer
const colors = new Float32Array(walker.maxPoints * 3);
const colorAttr = new THREE.BufferAttribute(colors, 3);
walker.geometry.setAttribute('color', colorAttr);

const line = new THREE.Line(walker.geometry, lineMaterial);
mgr.scene.add(line);

// React to settings changes
settings.onChange('stepLength', (v) => { walker.stepLength = v; });
settings.onChange('bias', (v) => { walker.bias = v; });

// --- Animation ---
let stepAccumulator = 0;

mgr.start((dt) => {
    if (settings.get('paused')) return;

    const speed = settings.get('speed');
    stepAccumulator += dt * speed;

    while (stepAccumulator >= 1) {
        stepAccumulator -= 1;

        if (!walker.step()) {
            // Buffer full — shift or wrap
            walker.reset();
        }

        // Color the new point based on color mode
        const mode = settings.get('colorMode');
        let c;
        if (mode === 'rainbow') {
            const t = (walker.pointCount / walker.maxPoints) % 1;
            c = new THREE.Color(colorRamp(t, 'rainbow'));
        } else if (mode === 'single') {
            c = new THREE.Color(settings.get('singleColor'));
        } else if (mode === 'random') {
            c = new THREE.Color(hslToHex(randomRange(0, 360), 80, 60));
        }
        const ci = (walker.pointCount - 1) * 3;
        colors[ci]     = c.r;
        colors[ci + 1] = c.g;
        colors[ci + 2] = c.b;
        colorAttr.needsUpdate = true;
    }

    // Trail length trimming
    const trail = settings.get('trailLength');
    if (trail > 0 && walker.pointCount > trail) {
        walker.geometry.setDrawRange(walker.pointCount - trail, trail);
    }

    // Auto-camera update
    autoCamera.update(dt);
});
