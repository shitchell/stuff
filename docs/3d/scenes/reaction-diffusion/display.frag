precision highp float;
uniform sampler2D uState;
uniform int uPalette; // 0 = organic, 1 = thermal, 2 = monochrome
varying vec2 vUv;

vec3 organicPalette(float t) {
    return mix(vec3(0.0, 0.05, 0.15), mix(vec3(0.0, 0.6, 0.3), vec3(1.0, 0.9, 0.2), t), t);
}

vec3 thermalPalette(float t) {
    if (t < 0.33) return mix(vec3(0.0), vec3(0.5, 0.0, 0.8), t * 3.0);
    if (t < 0.66) return mix(vec3(0.5, 0.0, 0.8), vec3(1.0, 0.4, 0.0), (t - 0.33) * 3.0);
    return mix(vec3(1.0, 0.4, 0.0), vec3(1.0), (t - 0.66) * 3.0);
}

void main() {
    vec4 state = texture2D(uState, vUv);
    float B = state.g;
    vec3 color;
    if (uPalette == 0) color = organicPalette(B);
    else if (uPalette == 1) color = thermalPalette(B);
    else color = vec3(1.0 - B);
    gl_FragColor = vec4(color, 1.0);
}
