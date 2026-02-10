import * as THREE from 'three';

/**
 * @typedef {Object} BoidParams
 * @property {number} speed - Global speed multiplier
 * @property {number} separation - Separation force weight
 * @property {number} alignment - Alignment force weight
 * @property {number} cohesion - Cohesion force weight
 * @property {number} separationRadius - Distance threshold for separation
 * @property {number} neighborRadius - Distance threshold for alignment/cohesion
 */

/**
 * Spatial hash grid for efficient neighbor lookups.
 * Divides 3D space into cells of a given size and allows O(n) neighbor queries.
 */
class SpatialGrid {
    /** @type {number} */     #cellSize;
    /** @type {number} */     #invCellSize;
    /** @type {Map<number, number[]>} */ #cells = new Map();

    /** @param {number} cellSize */
    constructor(cellSize) {
        this.#cellSize = cellSize;
        this.#invCellSize = 1 / cellSize;
    }

    /** Clear the grid for a new frame */
    clear() {
        this.#cells.clear();
    }

    /** Update cell size (e.g. when neighborRadius changes) */
    setCellSize(size) {
        this.#cellSize = size;
        this.#invCellSize = 1 / size;
    }

    /**
     * Hash a 3D cell coordinate to a single integer key.
     * Uses large primes to minimize collisions.
     */
    #hash(cx, cy, cz) {
        return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) | 0;
    }

    /**
     * Insert a boid index at a world position.
     * @param {number} index
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    insert(index, x, y, z) {
        const cx = Math.floor(x * this.#invCellSize);
        const cy = Math.floor(y * this.#invCellSize);
        const cz = Math.floor(z * this.#invCellSize);
        const key = this.#hash(cx, cy, cz);
        let cell = this.#cells.get(key);
        if (!cell) {
            cell = [];
            this.#cells.set(key, cell);
        }
        cell.push(index);
    }

    /**
     * Query all boid indices in the 3x3x3 neighborhood of cells around a position.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number[]} result - Array to fill with neighbor indices (cleared first)
     */
    query(x, y, z, result) {
        result.length = 0;
        const cx = Math.floor(x * this.#invCellSize);
        const cy = Math.floor(y * this.#invCellSize);
        const cz = Math.floor(z * this.#invCellSize);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = this.#hash(cx + dx, cy + dy, cz + dz);
                    const cell = this.#cells.get(key);
                    if (cell) {
                        for (let i = 0; i < cell.length; i++) {
                            result.push(cell[i]);
                        }
                    }
                }
            }
        }
    }
}

export class BoidSimulation {
    /** @type {THREE.InstancedMesh} */ mesh;
    /** @type {number} */              count;
    /** @type {Float32Array} */        positions;
    /** @type {Float32Array} */        velocities;
    /** @type {THREE.Vector3} */       bounds;

    #geometry;
    #material;
    #dummy = new THREE.Object3D();
    #grid;
    #neighborResult = [];
    #maxSpeed = 8;
    #maxForce = 4;

    /**
     * @param {THREE.Scene} scene
     * @param {number} count
     */
    constructor(scene, count = 500) {
        this.#geometry = new THREE.ConeGeometry(0.25, 0.8, 4);
        // Rotate geometry so the cone points along +Z (forward direction)
        this.#geometry.rotateX(Math.PI / 2);

        this.#material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x334466,
            emissiveIntensity: 0.5,
            flatShading: true,
        });

        // Bounding box: boids wrap around this volume (toroidal space)
        this.bounds = new THREE.Vector3(60, 60, 60);

        this.#grid = new SpatialGrid(15);

        this.count = 0;
        this.mesh = null;
        this.positions = new Float32Array(0);
        this.velocities = new Float32Array(0);

        this.rebuild(count, scene);
    }

    /**
     * Rebuild the instanced mesh with a new boid count.
     * Randomizes all positions and velocities.
     * @param {number} count
     * @param {THREE.Scene} scene
     */
    rebuild(count, scene) {
        // Remove old mesh
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.dispose();
        }

        this.count = count;

        // Allocate typed arrays: 3 floats per boid (x, y, z)
        this.positions = new Float32Array(count * 3);
        this.velocities = new Float32Array(count * 3);

        // Initialize with random positions and velocities within bounds
        const hx = this.bounds.x * 0.5;
        const hy = this.bounds.y * 0.5;
        const hz = this.bounds.z * 0.5;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            this.positions[i3]     = (Math.random() - 0.5) * this.bounds.x;
            this.positions[i3 + 1] = (Math.random() - 0.5) * this.bounds.y;
            this.positions[i3 + 2] = (Math.random() - 0.5) * this.bounds.z;

            this.velocities[i3]     = (Math.random() - 0.5) * 4;
            this.velocities[i3 + 1] = (Math.random() - 0.5) * 4;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 4;
        }

        // Create instanced mesh
        this.mesh = new THREE.InstancedMesh(this.#geometry, this.#material, count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // Set initial transforms
        this.#updateMatrices();

        scene.add(this.mesh);
    }

    /**
     * Run one simulation step.
     * @param {number} dt - Delta time in seconds
     * @param {BoidParams} params
     */
    update(dt, params) {
        const {
            speed = 1,
            separation = 1.5,
            alignment = 1.0,
            cohesion = 1.0,
            separationRadius = 5,
            neighborRadius = 15,
        } = params;

        const count = this.count;
        const pos = this.positions;
        const vel = this.velocities;
        const hx = this.bounds.x * 0.5;
        const hy = this.bounds.y * 0.5;
        const hz = this.bounds.z * 0.5;

        // Update spatial grid cell size to match neighbor radius
        this.#grid.setCellSize(neighborRadius);
        this.#grid.clear();

        // Insert all boids into the grid
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            this.#grid.insert(i, pos[i3], pos[i3 + 1], pos[i3 + 2]);
        }

        const maxSpeed = this.#maxSpeed * speed;
        const maxForce = this.#maxForce * speed;
        const sepRadSq = separationRadius * separationRadius;
        const neiRadSq = neighborRadius * neighborRadius;

        // Temporary accumulators
        let sepX, sepY, sepZ, sepCount;
        let aliX, aliY, aliZ, aliCount;
        let cohX, cohY, cohZ, cohCount;
        let dx, dy, dz, distSq, dist;
        let steerX, steerY, steerZ, steerLen;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const px = pos[i3];
            const py = pos[i3 + 1];
            const pz = pos[i3 + 2];

            sepX = 0; sepY = 0; sepZ = 0; sepCount = 0;
            aliX = 0; aliY = 0; aliZ = 0; aliCount = 0;
            cohX = 0; cohY = 0; cohZ = 0; cohCount = 0;

            // Query spatial grid for nearby boids
            this.#grid.query(px, py, pz, this.#neighborResult);
            const neighbors = this.#neighborResult;

            for (let n = 0; n < neighbors.length; n++) {
                const j = neighbors[n];
                if (j === i) continue;

                const j3 = j * 3;

                // Compute wrapped distance
                dx = pos[j3] - px;
                dy = pos[j3 + 1] - py;
                dz = pos[j3 + 2] - pz;

                // Toroidal wrapping for distance calculation
                if (dx > hx) dx -= this.bounds.x;
                else if (dx < -hx) dx += this.bounds.x;
                if (dy > hy) dy -= this.bounds.y;
                else if (dy < -hy) dy += this.bounds.y;
                if (dz > hz) dz -= this.bounds.z;
                else if (dz < -hz) dz += this.bounds.z;

                distSq = dx * dx + dy * dy + dz * dz;

                // Separation: steer away from very close boids
                if (distSq < sepRadSq && distSq > 0.0001) {
                    dist = Math.sqrt(distSq);
                    // Weight inversely by distance
                    const weight = 1 / dist;
                    sepX -= dx * weight;
                    sepY -= dy * weight;
                    sepZ -= dz * weight;
                    sepCount++;
                }

                // Alignment & Cohesion: use neighbors within neighborRadius
                if (distSq < neiRadSq) {
                    // Alignment: accumulate velocity
                    aliX += vel[j3];
                    aliY += vel[j3 + 1];
                    aliZ += vel[j3 + 2];
                    aliCount++;

                    // Cohesion: accumulate position
                    cohX += dx;
                    cohY += dy;
                    cohZ += dz;
                    cohCount++;
                }
            }

            // Compute steering forces
            let forceX = 0, forceY = 0, forceZ = 0;

            // Separation force
            if (sepCount > 0) {
                steerX = sepX / sepCount;
                steerY = sepY / sepCount;
                steerZ = sepZ / sepCount;
                steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                if (steerLen > 0) {
                    // Normalize and scale to maxSpeed, then subtract current velocity
                    steerX = (steerX / steerLen) * maxSpeed - vel[i3];
                    steerY = (steerY / steerLen) * maxSpeed - vel[i3 + 1];
                    steerZ = (steerZ / steerLen) * maxSpeed - vel[i3 + 2];
                    // Limit force
                    steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                    if (steerLen > maxForce) {
                        steerX = (steerX / steerLen) * maxForce;
                        steerY = (steerY / steerLen) * maxForce;
                        steerZ = (steerZ / steerLen) * maxForce;
                    }
                    forceX += steerX * separation;
                    forceY += steerY * separation;
                    forceZ += steerZ * separation;
                }
            }

            // Alignment force
            if (aliCount > 0) {
                steerX = aliX / aliCount;
                steerY = aliY / aliCount;
                steerZ = aliZ / aliCount;
                steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                if (steerLen > 0) {
                    steerX = (steerX / steerLen) * maxSpeed - vel[i3];
                    steerY = (steerY / steerLen) * maxSpeed - vel[i3 + 1];
                    steerZ = (steerZ / steerLen) * maxSpeed - vel[i3 + 2];
                    steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                    if (steerLen > maxForce) {
                        steerX = (steerX / steerLen) * maxForce;
                        steerY = (steerY / steerLen) * maxForce;
                        steerZ = (steerZ / steerLen) * maxForce;
                    }
                    forceX += steerX * alignment;
                    forceY += steerY * alignment;
                    forceZ += steerZ * alignment;
                }
            }

            // Cohesion force: steer toward average position of neighbors
            if (cohCount > 0) {
                // Average offset = center of nearby boids relative to this one
                steerX = cohX / cohCount;
                steerY = cohY / cohCount;
                steerZ = cohZ / cohCount;
                steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                if (steerLen > 0) {
                    steerX = (steerX / steerLen) * maxSpeed - vel[i3];
                    steerY = (steerY / steerLen) * maxSpeed - vel[i3 + 1];
                    steerZ = (steerZ / steerLen) * maxSpeed - vel[i3 + 2];
                    steerLen = Math.sqrt(steerX * steerX + steerY * steerY + steerZ * steerZ);
                    if (steerLen > maxForce) {
                        steerX = (steerX / steerLen) * maxForce;
                        steerY = (steerY / steerLen) * maxForce;
                        steerZ = (steerZ / steerLen) * maxForce;
                    }
                    forceX += steerX * cohesion;
                    forceY += steerY * cohesion;
                    forceZ += steerZ * cohesion;
                }
            }

            // Apply forces to velocity
            vel[i3]     += forceX * dt;
            vel[i3 + 1] += forceY * dt;
            vel[i3 + 2] += forceZ * dt;

            // Limit speed
            const spdSq = vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2];
            if (spdSq > maxSpeed * maxSpeed) {
                const spd = Math.sqrt(spdSq);
                vel[i3]     = (vel[i3] / spd) * maxSpeed;
                vel[i3 + 1] = (vel[i3 + 1] / spd) * maxSpeed;
                vel[i3 + 2] = (vel[i3 + 2] / spd) * maxSpeed;
            }

            // Ensure a minimum speed so boids don't stall
            const minSpeed = maxSpeed * 0.25;
            if (spdSq < minSpeed * minSpeed && spdSq > 0.0001) {
                const spd = Math.sqrt(spdSq);
                vel[i3]     = (vel[i3] / spd) * minSpeed;
                vel[i3 + 1] = (vel[i3 + 1] / spd) * minSpeed;
                vel[i3 + 2] = (vel[i3 + 2] / spd) * minSpeed;
            }

            // Update position
            pos[i3]     += vel[i3] * dt;
            pos[i3 + 1] += vel[i3 + 1] * dt;
            pos[i3 + 2] += vel[i3 + 2] * dt;

            // Toroidal wrapping
            if (pos[i3] > hx) pos[i3] -= this.bounds.x;
            else if (pos[i3] < -hx) pos[i3] += this.bounds.x;
            if (pos[i3 + 1] > hy) pos[i3 + 1] -= this.bounds.y;
            else if (pos[i3 + 1] < -hy) pos[i3 + 1] += this.bounds.y;
            if (pos[i3 + 2] > hz) pos[i3 + 2] -= this.bounds.z;
            else if (pos[i3 + 2] < -hz) pos[i3 + 2] += this.bounds.z;
        }

        // Update instance matrices
        this.#updateMatrices();
    }

    /**
     * Compute the speed of a boid (magnitude of its velocity).
     * @param {number} index
     * @returns {number}
     */
    getSpeed(index) {
        const i3 = index * 3;
        const vx = this.velocities[i3];
        const vy = this.velocities[i3 + 1];
        const vz = this.velocities[i3 + 2];
        return Math.sqrt(vx * vx + vy * vy + vz * vz);
    }

    /**
     * Set the color of a single boid instance.
     * @param {number} index
     * @param {THREE.Color} color
     */
    setColor(index, color) {
        this.mesh.setColorAt(index, color);
    }

    /** Mark the instance color buffer as needing upload to GPU */
    colorsNeedUpdate() {
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    /** Update all instance matrices from the positions/velocities arrays */
    #updateMatrices() {
        const dummy = this.#dummy;
        const pos = this.positions;
        const vel = this.velocities;
        const up = new THREE.Vector3(0, 1, 0);
        const lookTarget = new THREE.Vector3();

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;

            dummy.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);

            // Orient boid to face its velocity direction
            lookTarget.set(
                pos[i3] + vel[i3],
                pos[i3 + 1] + vel[i3 + 1],
                pos[i3 + 2] + vel[i3 + 2],
            );
            dummy.lookAt(lookTarget);

            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /** Dispose of GPU resources */
    dispose() {
        if (this.mesh) {
            this.mesh.dispose();
        }
        this.#geometry.dispose();
        this.#material.dispose();
    }
}
