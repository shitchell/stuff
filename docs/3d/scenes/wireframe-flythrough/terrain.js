import * as THREE from 'three';
import { simplex2D } from '../../lib/utils/noise.js';

/**
 * Manages a ring buffer of terrain chunks that recycle as the camera moves
 * forward along the -Z axis. Each chunk is a PlaneGeometry whose vertex Y
 * values are displaced by simplex noise, rendered as a neon wireframe.
 */
export class TerrainManager {
    /** @type {THREE.Scene} */          #scene;
    /** @type {number} */               chunkSize;
    /** @type {number} */               chunkCount;
    /** @type {number} */               segments;
    /** @type {number} */               frequency;
    /** @type {number} */               amplitude;
    /** @type {THREE.MeshBasicMaterial} */ #material;
    /** @type {Array<{mesh: THREE.Mesh, zStart: number, objects: THREE.Object3D[]}>} */ #chunks;
    /** @type {number} */               #nextZStart;
    /** @type {Function|null} */        #onChunkRecycled;

    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {number} [options.chunkSize=50]     - Length of each chunk along Z
     * @param {number} [options.chunkCount=10]    - Number of chunks in the ring buffer
     * @param {number} [options.segments=32]      - Geometry subdivisions per axis
     * @param {number} [options.frequency=0.04]   - Noise frequency (roughness)
     * @param {number} [options.amplitude=8]      - Noise amplitude (height)
     * @param {number} [options.color=0x00ffaa]   - Wireframe color
     * @param {number} [options.width=80]         - Terrain width along X
     * @param {Function} [options.onChunkRecycled] - Called with (mesh, zStart) when a chunk is recycled
     */
    constructor(scene, options = {}) {
        this.#scene = scene;
        this.chunkSize = options.chunkSize ?? 50;
        this.chunkCount = options.chunkCount ?? 10;
        this.segments = options.segments ?? 32;
        this.frequency = options.frequency ?? 0.04;
        this.amplitude = options.amplitude ?? 8;
        this.width = options.width ?? 80;
        this.#onChunkRecycled = options.onChunkRecycled ?? null;

        this.#material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: new THREE.Color(options.color ?? 0x00ffaa),
        });

        // Create initial chunks stretching from z=0 forward (into -Z).
        // Chunk 0 starts at z=0, chunk 1 at z=-chunkSize, etc.
        this.#chunks = [];
        for (let i = 0; i < this.chunkCount; i++) {
            const zStart = -i * this.chunkSize;
            const chunk = this.#createChunk(zStart);
            this.#chunks.push(chunk);
        }

        // The next chunk to be placed will go at this Z position
        this.#nextZStart = -this.chunkCount * this.chunkSize;
    }

    /**
     * Create a single terrain chunk positioned so that its front edge is at zStart
     * and it extends toward -Z by chunkSize.
     * @param {number} zStart - Z position of the chunk's near edge
     * @returns {{mesh: THREE.Mesh, zStart: number, objects: THREE.Object3D[]}}
     */
    #createChunk(zStart) {
        const geo = new THREE.PlaneGeometry(
            this.width,
            this.chunkSize,
            this.segments,
            this.segments
        );

        // PlaneGeometry is created in the XY plane. Rotate it to lie in the XZ plane.
        geo.rotateX(-Math.PI / 2);

        // Position the chunk so its center sits at the correct Z.
        // After rotation, the plane lies in XZ with center at origin.
        // We need the near edge at zStart, so center is at zStart - chunkSize/2.
        const mesh = new THREE.Mesh(geo, this.#material);
        mesh.position.z = zStart - this.chunkSize / 2;

        // Displace vertex Y values with noise
        this.#displaceVertices(mesh);

        this.#scene.add(mesh);

        return { mesh, zStart, objects: [] };
    }

    /**
     * Displace vertex Y positions using simplex noise based on world XZ coordinates.
     * @param {THREE.Mesh} mesh
     */
    #displaceVertices(mesh) {
        const posAttr = mesh.geometry.attributes.position;
        const count = posAttr.count;

        for (let i = 0; i < count; i++) {
            // Get world XZ from local position + mesh offset
            const localX = posAttr.getX(i);
            const localZ = posAttr.getZ(i);
            const worldX = localX + mesh.position.x;
            const worldZ = localZ + mesh.position.z;

            const height = simplex2D(worldX * this.frequency, worldZ * this.frequency) * this.amplitude;
            posAttr.setY(i, height);
        }

        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    }

    /**
     * Update the terrain ring buffer. Call each frame with the camera's current Z position.
     * When the camera passes a chunk (its near edge is behind the camera), that chunk
     * is recycled to the front of the queue (furthest ahead of the camera).
     * @param {number} cameraZ - Current camera Z position
     */
    update(cameraZ) {
        // Sort chunks by zStart descending (nearest to camera first)
        // Actually, we check: if a chunk's far edge (zStart - chunkSize) is behind the camera,
        // recycle it.
        let recycled = true;
        while (recycled) {
            recycled = false;
            for (let i = 0; i < this.#chunks.length; i++) {
                const chunk = this.#chunks[i];
                const chunkFarEdge = chunk.zStart - this.chunkSize;

                // If the chunk's far edge is behind the camera (more positive Z),
                // it's completely passed. Recycle it.
                if (chunkFarEdge > cameraZ + this.chunkSize) {
                    this.#recycleChunk(chunk);
                    recycled = true;
                    break; // Re-check after recycling
                }
            }
        }
    }

    /**
     * Recycle a chunk: remove its objects, reposition it ahead of the camera,
     * recompute terrain heights, and notify the callback.
     * @param {{mesh: THREE.Mesh, zStart: number, objects: THREE.Object3D[]}} chunk
     */
    #recycleChunk(chunk) {
        // Remove old decorative objects
        for (const obj of chunk.objects) {
            this.#scene.remove(obj);
            obj.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
        }
        chunk.objects = [];

        // Move chunk to the front (furthest ahead in -Z)
        chunk.zStart = this.#nextZStart;
        this.#nextZStart -= this.chunkSize;

        chunk.mesh.position.z = chunk.zStart - this.chunkSize / 2;

        // Recompute vertex heights for the new position
        this.#displaceVertices(chunk.mesh);

        // Notify callback (used by main.js to place objects)
        if (this.#onChunkRecycled) {
            this.#onChunkRecycled(chunk.mesh, chunk.zStart, chunk.objects);
        }
    }

    /**
     * Get the terrain height at a given world XZ position using noise.
     * Useful for placing objects at the correct elevation.
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {number}
     */
    getHeightAt(worldX, worldZ) {
        return simplex2D(worldX * this.frequency, worldZ * this.frequency) * this.amplitude;
    }

    /**
     * Update wireframe color for all chunks.
     * @param {string|number} hex - Color value (hex string or integer)
     */
    setColor(hex) {
        this.#material.color.set(hex);
    }

    /**
     * Update noise frequency (terrain roughness).
     * Takes effect on next chunk recycle.
     * @param {number} freq
     */
    setFrequency(freq) {
        this.frequency = freq;
    }

    /**
     * Update noise amplitude (terrain height).
     * Takes effect on next chunk recycle.
     * @param {number} amp
     */
    setAmplitude(amp) {
        this.amplitude = amp;
    }

    /**
     * Get the material (for external color syncing, e.g. GridHelper).
     * @returns {THREE.MeshBasicMaterial}
     */
    get material() {
        return this.#material;
    }

    /**
     * Clean up all chunks and remove from scene.
     */
    dispose() {
        for (const chunk of this.#chunks) {
            this.#scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            for (const obj of chunk.objects) {
                this.#scene.remove(obj);
                obj.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                });
            }
        }
        this.#material.dispose();
        this.#chunks = [];
    }
}
