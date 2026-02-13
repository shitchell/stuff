import * as THREE from 'three';

/**
 * @typedef {'orbit'|'drift'|'follow'} AutoCameraMode
 * @typedef {Object} AutoCameraOptions
 * @property {number} [transitionDuration=2] - seconds to smoothly transition in/out
 * @property {number} [orbitRadius=30] - radius for orbit mode
 * @property {number} [orbitSpeed=0.15] - radians/sec for orbit mode
 * @property {number} [followDistance=15] - distance behind target for follow mode
 * @property {number} [followHeight=5] - height above target for follow mode
 * @property {number} [smoothing=0] - camera position smoothing as time constant in seconds
 *     (0=instant, higher=lazier). Applied uniformly to all modes.
 */

export class AutoCamera {
    /** @type {THREE.Camera} */           #camera;
    /** @type {import('three').OrbitControls|null} */ #controls;
    /** @type {() => { position: THREE.Vector3, direction?: THREE.Vector3 }} */
    #targetFn = () => ({ position: new THREE.Vector3() });
    /** @type {AutoCameraMode} */         #mode = 'orbit';
    /** @type {boolean} */                active = false;

    // Transition state
    #transitioning = false;
    #transitionProgress = 0;
    #transitionDuration;
    #savedPosition = new THREE.Vector3();
    #savedTarget = new THREE.Vector3();

    // Auto-movement state
    #time = 0;
    #driftTarget = new THREE.Vector3();
    #driftTimer = 0;

    // Options
    #orbitRadius;
    #orbitSpeed;
    #followDistance;
    #followHeight;
    #smoothing;

    /**
     * @param {THREE.Camera} camera
     * @param {import('three').OrbitControls|null} controls
     * @param {AutoCameraOptions} [options]
     */
    constructor(camera, controls, options = {}) {
        this.#camera = camera;
        this.#controls = controls;
        this.#transitionDuration = options.transitionDuration ?? 2;
        this.#orbitRadius = options.orbitRadius ?? 30;
        this.#orbitSpeed = options.orbitSpeed ?? 0.15;
        this.#followDistance = options.followDistance ?? 15;
        this.#followHeight = options.followHeight ?? 5;
        this.#smoothing = options.smoothing ?? 0;
    }

    /**
     * Set the target function. Must return { position: Vector3, direction?: Vector3 }.
     * `position` is the point to look at / orbit around.
     * `direction` (optional) is the target's forward direction — used by
     * 'follow' mode to position the camera behind the target. If omitted,
     * follow mode falls back to orbit behavior.
     *
     * @param {() => { position: THREE.Vector3, direction?: THREE.Vector3 }} fn
     */
    setTarget(fn) { this.#targetFn = fn; }

    /** @param {AutoCameraMode} mode */
    setMode(mode) { this.#mode = mode; }

    /** @param {number} smoothing - time constant in seconds (0=instant, higher=lazier) */
    setSmoothing(smoothing) { this.#smoothing = smoothing; }

    activate() {
        if (this.active) return;
        this.active = true;
        this.#transitioning = true;
        this.#transitionProgress = 0;
        this.#savedPosition.copy(this.#camera.position);
        if (this.#controls) {
            this.#savedTarget.copy(this.#controls.target);
            this.#controls.enabled = false;
        }
        this.#time = 0;
        this.#driftTimer = 0;
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.#transitioning = false;
        if (this.#controls) {
            this.#controls.enabled = true;
        }
    }

    /** @param {number} dt - seconds */
    update(dt) {
        if (!this.active) return;
        this.#time += dt;

        // targetFn returns { position: Vector3, direction?: Vector3 }
        const { position: targetPos, direction: targetDir } = this.#targetFn();
        let desiredPos;
        const desiredLookAt = targetPos;

        switch (this.#mode) {
            case 'orbit': {
                const angle = this.#time * this.#orbitSpeed;
                const elevation = Math.sin(this.#time * 0.1) * 0.3 + 0.5;
                desiredPos = new THREE.Vector3(
                    targetPos.x + Math.cos(angle) * this.#orbitRadius,
                    targetPos.y + this.#orbitRadius * elevation,
                    targetPos.z + Math.sin(angle) * this.#orbitRadius,
                );
                break;
            }
            case 'drift': {
                this.#driftTimer -= dt;
                if (this.#driftTimer <= 0) {
                    const angle = Math.random() * Math.PI * 2;
                    const elev = Math.random() * 0.8 + 0.2;
                    const r = this.#orbitRadius * (0.5 + Math.random() * 0.5);
                    // Store as offset from target, not absolute position
                    this.#driftTarget.set(
                        Math.cos(angle) * r,
                        r * elev,
                        Math.sin(angle) * r,
                    );
                    this.#driftTimer = 3 + Math.random() * 4;
                }
                // Desired position = target + drift offset.
                // Shared smoothing (below) handles the lazy camera transition.
                desiredPos = targetPos.clone().add(this.#driftTarget);
                break;
            }
            case 'follow': {
                // Position camera behind and above the target's forward direction.
                // If no direction provided, fall back to orbit mode behavior.
                if (targetDir) {
                    // Place camera opposite to the target's direction vector
                    const behind = targetDir.clone().normalize().multiplyScalar(-this.#followDistance);
                    desiredPos = targetPos.clone().add(behind);
                    desiredPos.y += this.#followHeight;
                } else {
                    // No direction info — orbit instead
                    const angle = this.#time * this.#orbitSpeed;
                    desiredPos = new THREE.Vector3(
                        targetPos.x + Math.cos(angle) * this.#followDistance,
                        targetPos.y + this.#followHeight,
                        targetPos.z + Math.sin(angle) * this.#followDistance,
                    );
                }
                break;
            }
            default:
                desiredPos = this.#camera.position.clone();
        }

        // Smooth transition on activation
        if (this.#transitioning) {
            this.#transitionProgress += dt / this.#transitionDuration;
            if (this.#transitionProgress >= 1) {
                this.#transitionProgress = 1;
                this.#transitioning = false;
            }
            const t = smoothstep(this.#transitionProgress);
            this.#camera.position.lerpVectors(this.#savedPosition, desiredPos, t);
        } else if (this.#smoothing > 0) {
            this.#camera.position.lerp(desiredPos, 1 - Math.exp(-dt / this.#smoothing));
        } else {
            this.#camera.position.copy(desiredPos);
        }

        this.#camera.lookAt(desiredLookAt);

        // Update orbit controls target to match (so handoff is smooth)
        if (this.#controls) {
            this.#controls.target.copy(desiredLookAt);
        }
    }
}

/** Hermite smoothstep for smooth transitions */
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}
