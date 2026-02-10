import * as THREE from 'three';

/**
 * @param {number} [fov=75]
 * @param {number} [near=0.1]
 * @param {number} [far=1000]
 * @returns {THREE.PerspectiveCamera}
 */
export function createPerspectiveCamera(fov = 75, near = 0.1, far = 1000) {
    const aspect = window.innerWidth / window.innerHeight;
    return new THREE.PerspectiveCamera(fov, aspect, near, far);
}

/**
 * @param {number} [frustumSize=10]
 * @param {number} [near=-100]
 * @param {number} [far=100]
 * @returns {THREE.OrthographicCamera}
 */
export function createOrthographicCamera(frustumSize = 10, near = -100, far = 100) {
    const aspect = window.innerWidth / window.innerHeight;
    return new THREE.OrthographicCamera(
        -frustumSize * aspect, frustumSize * aspect,
        frustumSize, -frustumSize,
        near, far
    );
}

/**
 * Creates a fly-through camera controlled by WASD + mouse look.
 * Returns the camera and an update function to call each frame.
 *
 * @param {Object} options
 * @param {number} [options.speed=20]
 * @param {number} [options.near=0.1]
 * @param {number} [options.far=2000]
 * @param {number} [options.fov=75]
 * @param {HTMLElement} listenElement - Element to attach key/mouse listeners to
 * @returns {{ camera: THREE.PerspectiveCamera, update: (dt: number) => void, dispose: () => void, velocity: THREE.Vector3 }}
 */
export function createFlyCamera(options = {}, listenElement = document) {
    const { speed = 20, near = 0.1, far = 2000, fov = 75 } = options;
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    const velocity = new THREE.Vector3();
    const keys = {};
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    const onKeyDown = (e) => { keys[e.code] = true; };
    const onKeyUp = (e) => { keys[e.code] = false; };
    const onMouseMove = (e) => {
        if (document.pointerLockElement !== listenElement) return;
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= e.movementX * 0.002;
        euler.x -= e.movementY * 0.002;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);

    function update(dt) {
        const direction = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp'])    direction.z -= 1;
        if (keys['KeyS'] || keys['ArrowDown'])  direction.z += 1;
        if (keys['KeyA'] || keys['ArrowLeft'])   direction.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) direction.x += 1;
        if (keys['Space'])                       direction.y += 1;
        if (keys['ShiftLeft'])                   direction.y -= 1;

        direction.normalize().multiplyScalar(speed * dt);
        direction.applyQuaternion(camera.quaternion);
        camera.position.add(direction);
    }

    function dispose() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('mousemove', onMouseMove);
    }

    return { camera, update, dispose, velocity };
}
