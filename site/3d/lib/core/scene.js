import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * @typedef {Object} SceneOptions
 * @property {'perspective'|'orthographic'} [cameraType='perspective']
 * @property {number} [fov=75]
 * @property {number} [near=0.1]
 * @property {number} [far=1000]
 * @property {number|string} [background=0x000000]
 * @property {boolean} [antialias=true]
 * @property {boolean} [orbitControls=true]
 * @property {boolean} [orbitDamping=true]
 */

export class SceneManager {
    /** @type {THREE.Scene} */                          scene;
    /** @type {THREE.PerspectiveCamera|THREE.OrthographicCamera} */ camera;
    /** @type {THREE.WebGLRenderer} */                  renderer;
    /** @type {OrbitControls|null} */                    controls;
    /** @type {boolean} */                              running = false;

    #animationId = null;
    #canvas;
    #onResize;

    constructor(canvas, options = {}) {
        const {
            cameraType = 'perspective',
            fov = 75,
            near = 0.1,
            far = 1000,
            background = 0x000000,
            antialias = true,
            orbitControls = true,
            orbitDamping = true,
        } = options;

        this.#canvas = canvas;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(background);

        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        if (cameraType === 'orthographic') {
            const frustum = fov; // reuse fov param as frustum half-size
            this.camera = new THREE.OrthographicCamera(
                -frustum * aspect, frustum * aspect,
                frustum, -frustum,
                near, far
            );
        } else {
            this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        }

        // Controls
        this.controls = null;
        if (orbitControls) {
            this.controls = new OrbitControls(this.camera, canvas);
            this.controls.enableDamping = orbitDamping;
        }

        // Resize
        this.#onResize = () => this.resize();
        window.addEventListener('resize', this.#onResize);
    }

    /** @param {(dt: number, elapsed: number) => void} updateFn */
    start(updateFn) {
        this.running = true;
        let last = performance.now();

        const loop = (now) => {
            if (!this.running) return;
            this.#animationId = requestAnimationFrame(loop);
            const dt = (now - last) / 1000;
            last = now;
            updateFn(dt, now / 1000);
            if (this.controls) this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };

        this.#animationId = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        if (this.#animationId !== null) {
            cancelAnimationFrame(this.#animationId);
            this.#animationId = null;
        }
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h);

        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = w / h;
        } else if (this.camera.isOrthographicCamera) {
            const aspect = w / h;
            const frustum = this.camera.top; // original half-size
            this.camera.left = -frustum * aspect;
            this.camera.right = frustum * aspect;
        }
        this.camera.updateProjectionMatrix();
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this.#onResize);
        if (this.controls) this.controls.dispose();
        this.scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                materials.forEach(m => m.dispose());
            }
        });
        this.renderer.dispose();
    }
}
