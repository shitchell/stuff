import * as THREE from 'three';

/**
 * Lorenz system parameters.
 * @typedef {Object} LorenzParams
 * @property {number} sigma
 * @property {number} rho
 * @property {number} beta
 */

/** Named parameter presets */
export const PRESETS = {
    classic:  { sigma: 10,  rho: 28,    beta: 8 / 3 },
    chaotic:  { sigma: 10,  rho: 99.96, beta: 8 / 3 },
    periodic: { sigma: 10,  rho: 13.96, beta: 8 / 3 },
};

export class LorenzTrail {
    /** @type {THREE.Vector3} */ state;
    /** @type {Float32Array} */ positions;
    /** @type {Float32Array} */ colors;
    /** @type {number} */       pointCount = 0;
    /** @type {number} */       maxPoints;
    /** @type {THREE.BufferGeometry} */ geometry;

    /**
     * @param {THREE.Vector3} initialState
     * @param {number} [maxPoints=100000]
     */
    constructor(initialState, maxPoints = 100000) {
        this.state = initialState.clone();
        this.maxPoints = maxPoints;
        this.positions = new Float32Array(maxPoints * 3);
        this.colors = new Float32Array(maxPoints * 3);

        this.positions[0] = this.state.x;
        this.positions[1] = this.state.y;
        this.positions[2] = this.state.z;
        this.pointCount = 1;

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setDrawRange(0, 1);
    }

    /**
     * Advance the system by dt using RK4.
     * @param {LorenzParams} params
     * @param {number} dt
     * @param {THREE.Color} color - color for the new point
     */
    step(params, dt, color) {
        if (this.pointCount >= this.maxPoints) return false;

        const { sigma, rho, beta } = params;
        const { x, y, z } = this.state;

        // Lorenz system derivatives
        const f = (x, y, z) => [
            sigma * (y - x),
            x * (rho - z) - y,
            x * y - beta * z,
        ];

        // RK4
        const k1 = f(x, y, z);
        const k2 = f(x + k1[0]*dt/2, y + k1[1]*dt/2, z + k1[2]*dt/2);
        const k3 = f(x + k2[0]*dt/2, y + k2[1]*dt/2, z + k2[2]*dt/2);
        const k4 = f(x + k3[0]*dt, y + k3[1]*dt, z + k3[2]*dt);

        this.state.x += (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]) * dt / 6;
        this.state.y += (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]) * dt / 6;
        this.state.z += (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]) * dt / 6;

        // Write position
        const i = this.pointCount * 3;
        this.positions[i]     = this.state.x;
        this.positions[i + 1] = this.state.y;
        this.positions[i + 2] = this.state.z;

        // Write color
        this.colors[i]     = color.r;
        this.colors[i + 1] = color.g;
        this.colors[i + 2] = color.b;

        this.pointCount++;
        this.geometry.setDrawRange(0, this.pointCount);
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;

        return true;
    }

    /** Reset to a new initial state */
    reset(initialState) {
        this.state = initialState.clone();
        this.positions[0] = this.state.x;
        this.positions[1] = this.state.y;
        this.positions[2] = this.state.z;
        this.pointCount = 1;
        this.geometry.setDrawRange(0, 1);
        this.geometry.attributes.position.needsUpdate = true;
    }
}
