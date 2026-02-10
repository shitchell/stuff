precision highp float;
uniform sampler2D uState;
uniform vec2 uResolution;
uniform float uF;
uniform float uK;
uniform float uDt;
varying vec2 vUv;

void main() {
    vec2 texel = 1.0 / uResolution;
    vec4 center = texture2D(uState, vUv);
    float A = center.r;
    float B = center.g;

    // Laplacian (5-point stencil)
    float lapA = 0.0, lapB = 0.0;
    vec4 n;
    n = texture2D(uState, vUv + vec2(texel.x, 0));  lapA += n.r; lapB += n.g;
    n = texture2D(uState, vUv - vec2(texel.x, 0));  lapA += n.r; lapB += n.g;
    n = texture2D(uState, vUv + vec2(0, texel.y));   lapA += n.r; lapB += n.g;
    n = texture2D(uState, vUv - vec2(0, texel.y));   lapA += n.r; lapB += n.g;
    lapA -= 4.0 * A;
    lapB -= 4.0 * B;

    // Gray-Scott
    float Da = 1.0, Db = 0.5;
    float reaction = A * B * B;
    float newA = A + (Da * lapA - reaction + uF * (1.0 - A)) * uDt;
    float newB = B + (Db * lapB + reaction - (uK + uF) * B) * uDt;

    gl_FragColor = vec4(clamp(newA, 0.0, 1.0), clamp(newB, 0.0, 1.0), 0.0, 1.0);
}
