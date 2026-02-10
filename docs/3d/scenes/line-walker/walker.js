import * as THREE from 'three';
import { randomRange } from '../../lib/utils/math.js';

/**
 * @typedef {Object} WalkerOptions
 * @property {number} [stepLength=0.5]
 * @property {number} [bias=0.6] - 0 = fully random, 1 = perfectly straight
 * @property {number} [maxPoints=50000]
 */

export class Walker {
    /** @type {THREE.Vector3} */     position;
    /** @type {THREE.Vector3} */     direction;
    /** @type {Float32Array} */      positions;
    /** @type {number} */            pointCount = 0;
    /** @type {THREE.BufferGeometry} */ geometry;
    /** @type {number} */            stepLength;
    /** @type {number} */            bias;
    /** @type {number} */            maxPoints;

    /** @param {WalkerOptions} [options] */
    constructor(options = {}) {
        this.stepLength = options.stepLength ?? 0.5;
        this.bias = options.bias ?? 0.6;
        this.maxPoints = options.maxPoints ?? 50000;

        this.position = new THREE.Vector3(0, 0, 0);
        this.direction = new THREE.Vector3(
            randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1)
        ).normalize();

        // Pre-allocate buffer
        this.positions = new Float32Array(this.maxPoints * 3);
        this.positions[0] = 0;
        this.positions[1] = 0;
        this.positions[2] = 0;
        this.pointCount = 1;

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positions, 3)
        );
        this.geometry.setDrawRange(0, this.pointCount);
    }

    /** Advance one step. Returns false if buffer is full. */
    step() {
        if (this.pointCount >= this.maxPoints) return false;

        // Generate random direction
        const random = new THREE.Vector3(
            randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1)
        ).normalize();

        // Blend with previous direction based on bias
        this.direction.lerp(random, 1 - this.bias).normalize();

        // Move
        this.position.addScaledVector(this.direction, this.stepLength);

        // Write to buffer
        const i = this.pointCount * 3;
        this.positions[i]     = this.position.x;
        this.positions[i + 1] = this.position.y;
        this.positions[i + 2] = this.position.z;
        this.pointCount++;

        // Update draw range
        this.geometry.setDrawRange(0, this.pointCount);
        this.geometry.attributes.position.needsUpdate = true;

        return true;
    }

    /** Get the current tip position (for auto-camera targeting) */
    get tip() {
        return this.position.clone();
    }

    /** Reset the walker to origin */
    reset() {
        this.position.set(0, 0, 0);
        this.direction.set(
            randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1)
        ).normalize();
        this.positions[0] = 0;
        this.positions[1] = 0;
        this.positions[2] = 0;
        this.pointCount = 1;
        this.geometry.setDrawRange(0, 1);
        this.geometry.attributes.position.needsUpdate = true;
    }
}
