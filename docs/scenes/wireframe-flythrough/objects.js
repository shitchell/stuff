import * as THREE from 'three';

/**
 * Factory functions for wireframe decorative objects placed on the terrain.
 * All objects use MeshBasicMaterial with wireframe:true for the neon aesthetic.
 */

/**
 * Create a wireframe tree: cone (foliage) atop a cylinder (trunk).
 * @param {number} [height=3] - Total tree height
 * @param {THREE.Color|number|string} [color=0x00ffaa] - Wireframe color
 * @returns {THREE.Group}
 */
export function createTree(height = 3, color = 0x00ffaa) {
    const group = new THREE.Group();

    const trunkHeight = height * 0.35;
    const trunkRadius = height * 0.05;
    const canopyHeight = height * 0.65;
    const canopyRadius = height * 0.25;

    const mat = new THREE.MeshBasicMaterial({
        wireframe: true,
        color: new THREE.Color(color),
    });

    // Trunk — cylinder
    const trunkGeo = new THREE.CylinderGeometry(
        trunkRadius, trunkRadius, trunkHeight, 6, 1
    );
    const trunk = new THREE.Mesh(trunkGeo, mat);
    trunk.position.y = trunkHeight / 2;
    group.add(trunk);

    // Foliage — cone
    const canopyGeo = new THREE.ConeGeometry(
        canopyRadius, canopyHeight, 8, 1
    );
    const canopy = new THREE.Mesh(canopyGeo, mat);
    canopy.position.y = trunkHeight + canopyHeight / 2;
    group.add(canopy);

    return group;
}

/**
 * Create a wireframe pyramid (tetrahedron).
 * @param {number} [size=2] - Tetrahedron radius
 * @param {THREE.Color|number|string} [color=0x00ffaa] - Wireframe color
 * @returns {THREE.Mesh}
 */
export function createPyramid(size = 2, color = 0x00ffaa) {
    const geo = new THREE.TetrahedronGeometry(size);
    const mat = new THREE.MeshBasicMaterial({
        wireframe: true,
        color: new THREE.Color(color),
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Offset so the base sits on the ground
    mesh.position.y = size * 0.5;
    return mesh;
}

/**
 * Create a wireframe column (tall cylinder).
 * @param {number} [height=5] - Column height
 * @param {number} [radius=0.3] - Column radius
 * @param {THREE.Color|number|string} [color=0x00ffaa] - Wireframe color
 * @returns {THREE.Mesh}
 */
export function createColumn(height = 5, radius = 0.3, color = 0x00ffaa) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 8, 2);
    const mat = new THREE.MeshBasicMaterial({
        wireframe: true,
        color: new THREE.Color(color),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height / 2;
    return mesh;
}

/**
 * Spawn random decorative objects on a terrain chunk.
 * Objects are placed at random XZ positions within the chunk bounds,
 * with Y set to the terrain height at that position.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Mesh} chunkMesh - The terrain chunk mesh
 * @param {number} chunkZStart - The Z position of the chunk's near edge
 * @param {number} chunkSize - Length of the chunk along Z
 * @param {number} chunkWidth - Width of the chunk along X
 * @param {THREE.Object3D[]} objectsArray - Array to push created objects into (for cleanup)
 * @param {Object} options
 * @param {number} [options.density=0.3] - Object density (0-1), maps to number of objects
 * @param {string|number} [options.color=0x00ffaa] - Wireframe color
 * @param {Function} [options.getHeightAt] - Function(worldX, worldZ) => height
 */
export function spawnObjects(scene, chunkMesh, chunkZStart, chunkSize, chunkWidth, objectsArray, options = {}) {
    const density = options.density ?? 0.3;
    const color = options.color ?? 0x00ffaa;
    const getHeightAt = options.getHeightAt;

    // Number of objects scales with density and chunk area
    const maxObjects = 12;
    const count = Math.floor(density * maxObjects);

    for (let i = 0; i < count; i++) {
        // Random position within the chunk
        const worldX = (Math.random() - 0.5) * chunkWidth * 0.8; // Keep away from edges
        const worldZ = chunkZStart - Math.random() * chunkSize;

        // Get terrain height at this position
        const y = getHeightAt ? getHeightAt(worldX, worldZ) : 0;

        // Pick a random object type
        const roll = Math.random();
        let obj;

        if (roll < 0.5) {
            // Tree (most common)
            const height = 1.5 + Math.random() * 3;
            obj = createTree(height, color);
        } else if (roll < 0.8) {
            // Pyramid
            const size = 0.8 + Math.random() * 1.5;
            obj = createPyramid(size, color);
        } else {
            // Column
            const height = 2 + Math.random() * 5;
            const radius = 0.15 + Math.random() * 0.25;
            obj = createColumn(height, radius, color);
        }

        obj.position.x = worldX;
        obj.position.y = y;
        obj.position.z = worldZ;

        scene.add(obj);
        objectsArray.push(obj);
    }
}

/**
 * Update the wireframe color on all objects in the provided array.
 * @param {THREE.Object3D[]} objects
 * @param {string|number} color
 */
export function updateObjectsColor(objects, color) {
    const c = new THREE.Color(color);
    for (const obj of objects) {
        obj.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.color.copy(c);
            }
        });
    }
}
