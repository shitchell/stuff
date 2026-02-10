/** @param {number} a @param {number} b @param {number} t @returns {number} */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** @param {number} v @param {number} min @param {number} max @returns {number} */
export function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
}

/**
 * Map a value from one range to another.
 * @param {number} v @param {number} inMin @param {number} inMax
 * @param {number} outMin @param {number} outMax @returns {number}
 */
export function map(v, inMin, inMax, outMin, outMax) {
    return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** @param {number} min @param {number} max @returns {number} */
export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}
