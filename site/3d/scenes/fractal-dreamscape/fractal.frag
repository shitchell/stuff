precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform float uSymmetry;
uniform float uZoomSpeed;
uniform float uColorSpeed;
uniform float uWarpIntensity;
uniform vec2  uJuliaC;
uniform int   uPalette;
uniform float uBrightness;

// ---------- Constants ----------
#define PI  3.14159265359
#define TAU 6.28318530718
#define MAX_ITER 150

// ---------- Inigo Quilez cosine palette ----------
// palette(t) = a + b * cos(TAU * (c*t + d))
vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// Five selectable palettes
vec3 getPaletteColor(float t) {
    // Shift hue over time for breathing effect
    float phase = uTime * uColorSpeed * 0.1;
    t = fract(t + phase);

    if (uPalette == 0) {
        // Psychedelic -- vivid rainbow with shifting hues
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.00, 0.33, 0.67)
        );
    } else if (uPalette == 1) {
        // Fire -- deep reds, oranges, yellows
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 0.5),
            vec3(0.00, 0.10, 0.20)
        );
    } else if (uPalette == 2) {
        // Ocean -- cyans, blues, teals
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.30, 0.20, 0.20)
        );
    } else if (uPalette == 3) {
        // Neon -- hot pinks, electric blues, greens
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(2.0, 1.0, 1.0),
            vec3(0.50, 0.20, 0.25)
        );
    } else {
        // Monochrome -- grayscale with subtle blue tint
        float v = 0.5 + 0.5 * cos(TAU * t);
        return vec3(v * 0.9, v * 0.93, v);
    }
}

// ---------- Simplex-ish noise for domain warping ----------
// Compact 2D hash-based noise (good enough for warping, avoids large code)
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion -- 3 octaves for organic warping
float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 3; i++) {
        v += amp * valueNoise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return v;
}

// ---------- Domain warping ----------
vec2 domainWarp(vec2 uv) {
    float t = uTime * 0.15;
    float intensity = uWarpIntensity;

    // Two layers of warping for more organic feel
    float nx = fbm(uv * 2.0 + vec2(t * 1.3, t * 0.7));
    float ny = fbm(uv * 2.0 + vec2(t * 0.9 + 5.0, t * 1.1 + 3.0));

    vec2 warp1 = vec2(nx - 0.5, ny - 0.5) * intensity * 0.6;

    // Second warp layer (feeds back the first)
    float nx2 = fbm((uv + warp1) * 3.0 + vec2(t * 0.5 + 10.0, t * 0.8));
    float ny2 = fbm((uv + warp1) * 3.0 + vec2(t * 0.6 + 7.0, t * 0.3 + 13.0));

    vec2 warp2 = vec2(nx2 - 0.5, ny2 - 0.5) * intensity * 0.4;

    return uv + warp1 + warp2;
}

// ---------- Kaleidoscope folding ----------
vec2 kaleidoscope(vec2 uv, float symmetry) {
    // Convert to polar
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Fold into a sector
    float sector = TAU / symmetry;
    a = mod(a, sector);

    // Mirror within sector for clean symmetry
    if (a > sector * 0.5) {
        a = sector - a;
    }

    // Back to Cartesian
    return vec2(cos(a), sin(a)) * r;
}

// ---------- Julia set with smooth coloring ----------
// Returns smooth iteration count in [0, 1] range
float julia(vec2 z, vec2 c) {
    float iter = 0.0;

    for (int i = 0; i < MAX_ITER; i++) {
        // z = z^2 + c
        float x = z.x * z.x - z.y * z.y + c.x;
        float y = 2.0 * z.x * z.y + c.y;
        z = vec2(x, y);

        float mag2 = dot(z, z);
        if (mag2 > 256.0) {
            // Smooth coloring: subtract fractional escape count
            // Using the renormalization formula: n - log2(log2(|z|))
            float sl = iter - log2(log2(mag2)) + 4.0;
            return sl / float(MAX_ITER);
        }
        iter += 1.0;
    }

    // Interior -- return a value based on final position for interior detail
    return 0.0;
}

// ---------- Sacred geometry overlay ----------
float sacredGeometry(vec2 uv) {
    float result = 0.0;
    float t = uTime * 0.05;

    // Concentric circles (pulsing)
    float r = length(uv);
    float rings = sin(r * 20.0 - uTime * 0.5) * 0.5 + 0.5;
    rings = smoothstep(0.45, 0.5, rings);
    result += rings * 0.15;

    // Radial lines (mandala spokes)
    float a = atan(uv.y, uv.x);
    float spokes = abs(sin(a * uSymmetry * 0.5 + t));
    spokes = smoothstep(0.97, 1.0, spokes);
    result += spokes * 0.12;

    // Hexagonal grid overlay (subtle)
    vec2 hex = uv * 8.0;
    // Hexagonal coordinate transform
    vec2 h = vec2(hex.x + hex.y / sqrt(3.0), 2.0 * hex.y / sqrt(3.0));
    vec2 hi = floor(h);
    vec2 hf = fract(h);
    // Distance to hex center
    float hd = min(min(
        length(hf - vec2(0.0, 0.0)),
        length(hf - vec2(1.0, 0.0))),
        min(
        length(hf - vec2(0.0, 1.0)),
        length(hf - vec2(1.0, 1.0)))
    );
    float hexLine = 1.0 - smoothstep(0.03, 0.08, abs(hd - 0.5));
    result += hexLine * 0.08;

    // Flower of life pattern (overlapping circles)
    float flower = 0.0;
    for (int i = 0; i < 6; i++) {
        float angle = float(i) * TAU / 6.0 + t;
        vec2 center = vec2(cos(angle), sin(angle)) * 0.5;
        float circle = abs(length(uv - center) - 0.5);
        flower += smoothstep(0.02, 0.0, circle);
    }
    // Central circle
    flower += smoothstep(0.02, 0.0, abs(length(uv) - 0.5));
    result += flower * 0.06;

    return result;
}

// ---------- Vignette ----------
float vignette(vec2 uv) {
    float d = length(uv);
    return 1.0 - smoothstep(0.5, 1.8, d);
}

// ---------- Main ----------
void main() {
    // Aspect-corrected coordinates centered at origin
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

    // Zoom animation: slow continuous zoom with ping-pong
    float zoomCycle = uTime * uZoomSpeed;
    // Ping-pong between zoom levels using a sine wave for smooth reversal
    float zoomLevel = 1.0 + 2.0 * (0.5 + 0.5 * sin(zoomCycle * 0.3));
    // Exponential zoom for that fractal "infinite dive" feel
    float zoom = pow(1.5, zoomLevel);
    uv /= zoom;

    // Apply domain warping before kaleidoscope for organic flow
    vec2 warpedUV = domainWarp(uv);

    // Kaleidoscope folding
    vec2 kaleido = kaleidoscope(warpedUV, uSymmetry);

    // Julia set computation
    // The c parameter from JS traces an interesting path;
    // add subtle shader-side modulation for extra life
    vec2 c = uJuliaC;
    c += vec2(
        sin(uTime * 0.037) * 0.02,
        cos(uTime * 0.043) * 0.02
    );

    float fractalValue = julia(kaleido, c);

    // Color mapping with smooth coloring
    vec3 color;
    if (fractalValue <= 0.0) {
        // Interior: use a dark, subtly shifting color
        float interiorDetail = length(kaleido) * 2.0;
        interiorDetail = fract(interiorDetail + uTime * uColorSpeed * 0.05);
        color = getPaletteColor(interiorDetail) * 0.15;
    } else {
        // Exterior: map iteration count to palette
        // Apply color speed to cycle through palette over time
        float colorT = fractalValue * 3.0 + uTime * uColorSpeed * 0.08;
        color = getPaletteColor(colorT);

        // Boost contrast for more vivid output
        color = pow(color, vec3(0.85));
    }

    // Sacred geometry overlay (composited additively)
    float sacred = sacredGeometry(uv * zoom * 0.5);
    // Modulate sacred geometry brightness with time for breathing
    sacred *= 0.7 + 0.3 * sin(uTime * 0.3);
    vec3 sacredColor = getPaletteColor(uTime * uColorSpeed * 0.02) * sacred;
    color += sacredColor;

    // Apply brightness
    color *= uBrightness;

    // Vignette for depth
    color *= vignette(uv * zoom * 0.7);

    // Subtle glow in bright areas
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color += color * smoothstep(0.6, 1.0, lum) * 0.3;

    // Final output -- clamp to prevent blowout
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
