import * as THREE from 'three';

/**
 * Load a shader source from a URL.
 * @param {string} url - Path to .vert or .frag file
 * @returns {Promise<string>} Shader source text
 */
export async function loadShader(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load shader: ${url} (${response.status})`);
    return response.text();
}

/**
 * Create a THREE.ShaderMaterial from vertex/fragment source and uniforms.
 * @param {string} vertexShader
 * @param {string} fragmentShader
 * @param {Object<string, THREE.IUniform>} uniforms
 * @param {Object} [options] - Additional ShaderMaterial options
 * @returns {THREE.ShaderMaterial}
 */
export function createShaderMaterial(vertexShader, fragmentShader, uniforms, options = {}) {
    return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        ...options,
    });
}
