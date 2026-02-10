/**
 * Convert HSL to hex string.
 * @param {number} h - Hue 0-360
 * @param {number} s - Saturation 0-100
 * @param {number} l - Lightness 0-100
 * @returns {string} Hex color string, e.g. '#ff0000'
 */
export function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Built-in color palettes. Each is an array of hex color stops. */
const PALETTES = {
    rainbow: ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'],
    neon:    ['#ff00ff', '#00ffff', '#ff00ff'],
    fire:    ['#000000', '#ff4400', '#ffaa00', '#ffff44'],
    ocean:   ['#000033', '#003366', '#0066cc', '#00aaff', '#66ddff'],
    thermal: ['#000033', '#6600cc', '#ff0066', '#ffaa00', '#ffffff'],
    mono:    ['#000000', '#ffffff'],
};

/**
 * Get a palette by name.
 * @param {string} name
 * @returns {string[]} Array of hex color stops
 */
export function palette(name) {
    return PALETTES[name] || PALETTES.rainbow;
}

/**
 * Sample a color from a palette at position t (0-1).
 * Linearly interpolates between stops.
 * @param {number} t - Position in palette, 0.0 to 1.0
 * @param {string[]|string} pal - Palette array or palette name
 * @returns {string} Hex color
 */
export function colorRamp(t, pal = 'rainbow') {
    const stops = typeof pal === 'string' ? palette(pal) : pal;
    const n = stops.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const f = (t * n) - i;

    const a = hexToRgb(stops[i]);
    const b = hexToRgb(stops[i + 1]);

    const r = Math.round(a.r + (b.r - a.r) * f);
    const g = Math.round(a.g + (b.g - a.g) * f);
    const bl = Math.round(a.b + (b.b - a.b) * f);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/**
 * Parse hex color to RGB object.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
