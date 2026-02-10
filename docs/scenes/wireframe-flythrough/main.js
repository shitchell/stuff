import * as THREE from 'three';
import { SceneManager } from '../../lib/core/scene.js';
import { SettingsPanel } from '../../lib/ui/settings.js';
import { ChromeController } from '../../lib/ui/chrome.js';
import { AutoCamera } from '../../lib/core/auto-camera.js';
import { TerrainManager } from './terrain.js';
import { spawnObjects, updateObjectsColor } from './objects.js';

// --- Scene ---
const canvas = document.getElementById('canvas');
const mgr = new SceneManager(canvas, {
    background: 0x000011,
    orbitControls: false, // No orbit controls — pure screensaver
    far: 500,
});

// --- Settings ---
const settings = new SettingsPanel('wireframe-flythrough', { title: 'Wireframe Flythrough' });
settings
    .addSlider('speed', 'Fly Speed', 5, 100, 1, 30)
    .addSlider('frequency', 'Terrain Roughness', 0.005, 0.15, 0.001, 0.04)
    .addSlider('amplitude', 'Terrain Height', 1, 25, 0.5, 8)
    .addColor('wireColor', 'Wireframe Color', '#00ffaa')
    .addSlider('density', 'Object Density', 0, 1, 0.05, 0.3)
    .addSlider('fogDensity', 'Fog Density', 0.002, 0.03, 0.001, 0.008)
    .addSlider('cameraHeight', 'Camera Height', 2, 30, 0.5, 12)
    .addColor('bgColor', 'Background Color', '#000011')
    .addColor('horizonColor', 'Horizon Glow', '#ff0066')
    .addToggle('autoCamEnabled', 'Auto-Camera', true)
    .addSlider('autoCamTimeout', 'Inactivity (sec)', 5, 120, 1, 30)
    .addDropdown('autoCamMode', 'Auto-Camera Mode', ['orbit', 'drift', 'follow'], 'follow');

// --- Auto-Camera ---
const autoCamera = new AutoCamera(mgr.camera, mgr.controls);
autoCamera.setTarget(() => ({
    position: mgr.camera.position.clone(),
    direction: new THREE.Vector3(0, 0, -1),
}));
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

// --- Collect all spawned objects for color updates ---
let allObjects = [];

// --- Terrain ---
const terrain = new TerrainManager(mgr.scene, {
    chunkSize: 50,
    chunkCount: 10,
    segments: 32,
    frequency: settings.get('frequency'),
    amplitude: settings.get('amplitude'),
    color: settings.get('wireColor'),
    width: 80,
    onChunkRecycled: (mesh, zStart, objectsArray) => {
        // Spawn decorative objects on the recycled chunk
        spawnObjects(mgr.scene, mesh, zStart, terrain.chunkSize, terrain.width, objectsArray, {
            density: settings.get('density'),
            color: settings.get('wireColor'),
            getHeightAt: (x, z) => terrain.getHeightAt(x, z),
        });
        // Track objects for color updates
        allObjects = allObjects.filter(o => o.parent !== null);
        allObjects.push(...objectsArray);
    },
});

// --- Camera ---
const cameraHeight = settings.get('cameraHeight');
mgr.camera.position.set(0, cameraHeight, 0);
mgr.camera.lookAt(0, cameraHeight * 0.8, -100);

// --- Fog ---
const bgColor = new THREE.Color(settings.get('bgColor'));
mgr.scene.fog = new THREE.FogExp2(bgColor, settings.get('fogDensity'));

// --- GridHelper ---
// A large grid at y=0 for the synthwave ground-grid effect
const gridSize = 400;
const gridDivisions = 80;
const gridHelper = new THREE.GridHelper(gridSize, gridDivisions,
    new THREE.Color(settings.get('wireColor')),
    new THREE.Color(settings.get('wireColor'))
);
// GridHelper may have one or two materials (center line + grid lines)
const gridMaterials = Array.isArray(gridHelper.material)
    ? gridHelper.material
    : [gridHelper.material];
gridMaterials.forEach(m => {
    m.opacity = 0.3;
    m.transparent = true;
});
mgr.scene.add(gridHelper);

// --- Horizon Glow ---
// A large plane positioned ahead of the camera with a vertical gradient:
// transparent at top, horizonColor at bottom.
const horizonGlowGeo = new THREE.PlaneGeometry(300, 80);
const horizonGlowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
        uColor: { value: new THREE.Color(settings.get('horizonColor')) },
        uOpacity: { value: 0.6 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            // Gradient: fully transparent at top (vUv.y=1), colored at bottom (vUv.y=0)
            float alpha = (1.0 - vUv.y) * uOpacity;
            // Smooth the falloff
            alpha = alpha * alpha;
            gl_FragColor = vec4(uColor, alpha);
        }
    `,
});
const horizonGlow = new THREE.Mesh(horizonGlowGeo, horizonGlowMat);
// Position it ahead of the camera, at ground level, facing the camera
horizonGlow.position.set(0, 20, mgr.camera.position.z - 200);
mgr.scene.add(horizonGlow);

// --- Settings Reactivity ---

settings.onChange('wireColor', (color) => {
    terrain.setColor(color);
    // Update grid color (may be single material or array)
    gridMaterials.forEach(m => m.color.set(color));
    // Update all spawned objects
    updateObjectsColor(allObjects, color);
});

settings.onChange('frequency', (freq) => {
    terrain.setFrequency(freq);
});

settings.onChange('amplitude', (amp) => {
    terrain.setAmplitude(amp);
});

settings.onChange('fogDensity', (density) => {
    mgr.scene.fog.density = density;
});

settings.onChange('cameraHeight', (h) => {
    mgr.camera.position.y = h;
});

settings.onChange('bgColor', (color) => {
    const c = new THREE.Color(color);
    mgr.scene.background = c;
    mgr.scene.fog.color.copy(c);
});

settings.onChange('horizonColor', (color) => {
    horizonGlowMat.uniforms.uColor.value.set(color);
});

// --- Animation Loop ---
mgr.start((dt) => {
    const speed = settings.get('speed');

    // Clamp dt to prevent huge jumps (e.g., after tab switch)
    const clampedDt = Math.min(dt, 0.1);

    // Move camera forward along -Z
    mgr.camera.position.z -= speed * clampedDt;

    // Keep camera looking forward
    const camZ = mgr.camera.position.z;
    const camY = mgr.camera.position.y;
    mgr.camera.lookAt(0, camY * 0.8, camZ - 100);

    // Update terrain (recycle chunks as needed)
    terrain.update(camZ);

    // Keep grid centered under camera (snap to grid cell size to avoid shimmer)
    const gridCellSize = gridSize / gridDivisions;
    gridHelper.position.x = Math.round(mgr.camera.position.x / gridCellSize) * gridCellSize;
    gridHelper.position.z = Math.round(camZ / gridCellSize) * gridCellSize;

    // Keep horizon glow ahead of camera
    horizonGlow.position.z = camZ - 200;

    // Auto-camera update
    autoCamera.update(clampedDt);
});
