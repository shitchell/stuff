import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { colorRamp, hslToHex } from '../../lib/utils/color.js';
import { randomRange } from '../../lib/utils/math.js';
import { Walker } from './walker.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

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
    .addSlider('rainbowCycle', 'Rainbow Cycle (pts)', 100, 5000, 50, 1000)
    .addSlider('trailLength', 'Trail Length (0=inf)', 0, 10000, 100, 0)
    .addToggle('paused', 'Paused', false)
    .addButton('Reset', () => {
        walker.reset();
        stepAccumulator = 0;
    })
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'drift')
    .addSlider('camSmoothing', 'Camera Smoothing', 0, 20, 0.5, 0);

// Color mode note: The three modes work as follows:
// - 'rainbow': Hue cycles smoothly as the line grows (uses colorRamp with 'rainbow' palette)
// - 'single': Entire line is one color, set by the 'singleColor' color picker
// - 'random': Each segment gets a random hue (randomRange(0, 360) → hslToHex)

// --- Auto-Camera ---
const autoCamera = new AutoCamera(mgr.camera, mgr.controls, {
    followSmoothing: settings.get('camSmoothing'),
});
autoCamera.setTarget(() => ({ position: walker.tip }));
autoCamera.setMode(settings.get('autoCamMode'));

settings.onChange('autoCamMode', (v) => autoCamera.setMode(v));
settings.onChange('camSmoothing', (v) => autoCamera.setFollowSmoothing(v));

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

// Line2 material — world-space width so the line has 3D volume visible from all angles
const lineMaterial = new LineMaterial({
    worldUnits: true,
    linewidth: 0.15,
    vertexColors: true,
});
lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

// Allocate color buffer matching position buffer
const colors = new Float32Array(walker.maxPoints * 3);

// Pre-allocate Line2 geometry at max size so we can update data in-place.
// LineGeometry uses pairs format: each segment = [startXYZ, endXYZ] (6 floats).
// For N points, there are N-1 segments → (N-1)*6 floats.
const maxSegments = walker.maxPoints - 1;
const pairsPositions = new Float32Array(maxSegments * 6);
const pairsColors = new Float32Array(maxSegments * 6);

const lineGeometry = new LineGeometry();
lineGeometry.setPositions(pairsPositions);
lineGeometry.setColors(pairsColors);
lineGeometry.instanceCount = 0; // start with nothing visible

const line = new Line2(lineGeometry, lineMaterial);
mgr.scene.add(line);

// Cache references to the underlying GPU buffers for in-place updates
const posInstBuffer = lineGeometry.attributes.instanceStart.data; // InstancedInterleavedBuffer
const colorInstBuffer = lineGeometry.attributes.instanceColorStart.data;

// Update LineMaterial resolution on window resize
window.addEventListener('resize', () => {
    lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
});

// React to settings changes
settings.onChange('stepLength', (v) => { walker.stepLength = v; });
settings.onChange('bias', (v) => { walker.bias = v; });

// --- Test harness (exposes state for Playwright camera position assertions) ---
window.__testHarness = { autoCamera, walker, camera: mgr.camera, scene: mgr.scene, renderer: mgr.renderer };

// --- Animation ---
let stepAccumulator = 0;
let lastPointCount = 0;

/** Write walker positions/colors into the pairs buffer starting at segment index `segIdx`. */
function writePairsRange(startPt, endPt, segOffset) {
    const posArr = posInstBuffer.array;
    const colArr = colorInstBuffer.array;
    const wp = walker.positions;
    for (let i = startPt; i < endPt - 1; i++) {
        const si = (segOffset + i - startPt) * 6;
        const pi = i * 3;
        const ni = (i + 1) * 3;
        // position: start xyz, end xyz
        posArr[si]     = wp[pi];
        posArr[si + 1] = wp[pi + 1];
        posArr[si + 2] = wp[pi + 2];
        posArr[si + 3] = wp[ni];
        posArr[si + 4] = wp[ni + 1];
        posArr[si + 5] = wp[ni + 2];
        // color: start rgb, end rgb
        colArr[si]     = colors[pi];
        colArr[si + 1] = colors[pi + 1];
        colArr[si + 2] = colors[pi + 2];
        colArr[si + 3] = colors[ni];
        colArr[si + 4] = colors[ni + 1];
        colArr[si + 5] = colors[ni + 2];
    }
}

mgr.start((dt) => {
    if (settings.get('paused')) return;

    const speed = settings.get('speed');
    stepAccumulator += dt * speed;

    while (stepAccumulator >= 1) {
        stepAccumulator -= 1;

        if (!walker.step()) {
            // Buffer full — shift or wrap
            walker.reset();
            lastPointCount = 0;
        }

        // Color the new point based on color mode
        const mode = settings.get('colorMode');
        let c;
        if (mode === 'rainbow') {
            const t = (walker.pointCount / settings.get('rainbowCycle')) % 1;
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
    }

    // Update Line2 geometry in-place when points changed
    if (walker.pointCount !== lastPointCount && walker.pointCount >= 2) {
        const prevCount = lastPointCount;
        lastPointCount = walker.pointCount;

        // Trail length trimming
        const trail = settings.get('trailLength');
        let start = 0;
        const end = walker.pointCount;
        if (trail > 0 && end > trail) {
            start = end - trail;
            // Trail shifted — rewrite full visible range
            writePairsRange(start, end, 0);
        } else if (prevCount >= 2) {
            // Incremental: only write new segments (from prevCount-1 onward)
            const writeFrom = Math.max(start, prevCount - 1);
            writePairsRange(writeFrom, end, writeFrom - start);
        } else {
            // First time or after reset — write everything
            writePairsRange(start, end, 0);
        }

        lineGeometry.instanceCount = end - start - 1;
        posInstBuffer.needsUpdate = true;
        colorInstBuffer.needsUpdate = true;
        lineGeometry.computeBoundingSphere();
    }

    // Auto-camera update
    autoCamera.update(dt);
});
