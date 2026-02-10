import * as THREE from 'three';
import { loadShader, createShaderMaterial } from '../../lib/utils/shader.js';

/** Named parameter presets (f, k) */
export const PRESETS = {
    coral:   { f: 0.0545, k: 0.062 },
    mitosis: { f: 0.0367, k: 0.0649 },
    maze:    { f: 0.029,  k: 0.057 },
    spots:   { f: 0.035,  k: 0.065 },
    waves:   { f: 0.014,  k: 0.054 },
};

/**
 * Gray-Scott reaction-diffusion simulation using ping-pong render targets.
 *
 * Owns its own scene + orthographic camera for fullscreen quad rendering.
 * The main scene's sphere reads from `this.texture` for display.
 */
export class ReactionDiffusion {
    /** @type {THREE.WebGLRenderer} */ #renderer;
    /** @type {number} */              resolution;
    /** @type {THREE.WebGLRenderTarget} */ rtA;
    /** @type {THREE.WebGLRenderTarget} */ rtB;
    /** @type {THREE.Scene} */         simScene;
    /** @type {THREE.OrthographicCamera} */ simCamera;
    /** @type {THREE.ShaderMaterial} */ simMaterial;
    /** @type {THREE.Mesh} */          #quad;

    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} resolution - Texture width/height (e.g. 128, 256, 512)
     * @param {string} vertexShader - Fullscreen quad vertex shader source
     * @param {string} fragmentShader - Gray-Scott fragment shader source
     */
    constructor(renderer, resolution, vertexShader, fragmentShader) {
        this.#renderer = renderer;
        this.resolution = resolution;

        // Create two float render targets for ping-pong
        const rtOptions = {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping,
        };
        this.rtA = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);
        this.rtB = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);

        // Dedicated simulation scene + orthographic camera (-1 to 1)
        this.simScene = new THREE.Scene();
        this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Simulation shader material
        this.simMaterial = createShaderMaterial(vertexShader, fragmentShader, {
            uState: { value: null },
            uResolution: { value: new THREE.Vector2(resolution, resolution) },
            uF: { value: PRESETS.coral.f },
            uK: { value: PRESETS.coral.k },
            uDt: { value: 1.0 },
        });

        // Fullscreen quad (PlaneGeometry(2,2) fills clip space with the passthrough vert)
        const quadGeo = new THREE.PlaneGeometry(2, 2);
        this.#quad = new THREE.Mesh(quadGeo, this.simMaterial);
        this.simScene.add(this.#quad);
    }

    /**
     * Set feed rate and kill rate.
     * @param {number} f - Feed rate
     * @param {number} k - Kill rate
     */
    setParams(f, k) {
        this.simMaterial.uniforms.uF.value = f;
        this.simMaterial.uniforms.uK.value = k;
    }

    /**
     * Write initial state to both render targets.
     * A = 1 everywhere, B = 0 everywhere, then B = 1 in seed regions.
     * @param {'center'|'random'|'ring'} pattern
     */
    seed(pattern) {
        const size = this.resolution;
        const data = new Float32Array(size * size * 4);

        // Initialize: A = 1 everywhere, B = 0 everywhere
        for (let i = 0; i < size * size; i++) {
            data[i * 4]     = 1.0; // A
            data[i * 4 + 1] = 0.0; // B
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }

        // Set seed regions (B = 1)
        if (pattern === 'center') {
            // 10x10 block in center
            const cx = size / 2, cy = size / 2, r = 5;
            for (let y = cy - r; y < cy + r; y++) {
                for (let x = cx - r; x < cx + r; x++) {
                    if (x >= 0 && x < size && y >= 0 && y < size) {
                        data[(y * size + x) * 4 + 1] = 1.0;
                    }
                }
            }
        } else if (pattern === 'random') {
            // Random scattered seeds
            for (let i = 0; i < 20; i++) {
                const sx = Math.random() * size | 0;
                const sy = Math.random() * size | 0;
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        const px = sx + dx;
                        const py = sy + dy;
                        if (px >= 0 && px < size && py >= 0 && py < size) {
                            data[(py * size + px) * 4 + 1] = 1.0;
                        }
                    }
                }
            }
        } else if (pattern === 'ring') {
            // Ring around center
            const cx = size / 2, cy = size / 2, r = size * 0.2;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (Math.abs(d - r) < 3) {
                        data[(y * size + x) * 4 + 1] = 1.0;
                    }
                }
            }
        }

        // Create DataTexture with the initial state
        const seedTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
        seedTex.needsUpdate = true;

        // Render the seed texture to both render targets using the simulation quad
        // We temporarily swap the material to a simple copy material
        const copyMaterial = new THREE.MeshBasicMaterial({ map: seedTex });
        this.#quad.material = copyMaterial;

        // Render to rtA
        this.#renderer.setRenderTarget(this.rtA);
        this.#renderer.render(this.simScene, this.simCamera);

        // Render to rtB
        this.#renderer.setRenderTarget(this.rtB);
        this.#renderer.render(this.simScene, this.simCamera);

        // Restore simulation material and reset render target
        this.#quad.material = this.simMaterial;
        this.#renderer.setRenderTarget(null);

        // Cleanup
        copyMaterial.dispose();
        seedTex.dispose();
    }

    /**
     * Run N simulation steps (ping-pong between render targets).
     * @param {number} stepsPerFrame - Number of simulation steps to run
     */
    step(stepsPerFrame) {
        for (let i = 0; i < stepsPerFrame; i++) {
            // Read from rtA, write to rtB
            this.simMaterial.uniforms.uState.value = this.rtA.texture;
            this.#renderer.setRenderTarget(this.rtB);
            this.#renderer.render(this.simScene, this.simCamera);
            // Swap
            [this.rtA, this.rtB] = [this.rtB, this.rtA];
        }
        this.#renderer.setRenderTarget(null); // Reset to screen
    }

    /**
     * Returns the current state texture (for display on the sphere).
     * After step(), rtA holds the most recent output.
     * @returns {THREE.Texture}
     */
    get texture() {
        return this.rtA.texture;
    }

    /** Clean up GPU resources */
    dispose() {
        this.rtA.dispose();
        this.rtB.dispose();
        this.simMaterial.dispose();
        this.#quad.geometry.dispose();
    }
}
