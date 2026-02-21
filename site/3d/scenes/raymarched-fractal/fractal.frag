precision highp float;

varying vec2 vUv;

// ============================================================
// Section: Uniforms & Constants
// ============================================================

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uCameraPos;
uniform vec3  uCameraDir;
uniform vec3  uCameraUp;

// Fractal params
uniform int   uFractalType;  // 0=mandelbulb, 1=mandelbox, 2=menger, 3=hybrid
uniform float uPower;        // Mandelbulb power (default 8.0)
uniform float uFoldLimit;    // Mandelbox fold limit (default 1.0)
uniform float uBoxScale;     // Mandelbox scale (default 2.0)
uniform float uMorphProgress;// Hybrid morph 0..1

// Visual params
uniform int   uVisualStyle;  // 0=dark, 1=psychedelic, 2=geometric, 3=ambient
uniform float uAOStrength;
uniform float uFogDensity;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform vec3  uAccentColor;

// Quality
uniform int   uMaxIterations;

#define PI  3.14159265359
#define TAU 6.28318530718
#define MAX_STEPS 200
#define MIN_DIST 0.0005
#define MAX_DIST 50.0

// ============================================================
// Section: Utility Functions
// ============================================================

// IQ cosine palette: a + b * cos(TAU * (c*t + d))
vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// ============================================================
// DE: Mandelbulb
// Self-contained. Depends only on: uPower uniform
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

float DE_mandelbulb(vec3 p) {
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    float power = uPower;

    for (int i = 0; i < 15; i++) {
        r = length(z);
        if (r > 2.0) break;

        // Convert to polar
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;

        // Scale and rotate
        float zr = pow(r, power);
        theta *= power;
        phi *= power;

        // Back to cartesian
        z = zr * vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
        );
        z += p;
    }
    return 0.5 * log(r) * r / dr;
}

// ============================================================
// DE: Mandelbox
// Self-contained. Depends only on: uFoldLimit, uBoxScale uniforms
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

void boxFold(inout vec3 z, float limit) {
    z = clamp(z, -limit, limit) * 2.0 - z;
}

void sphereFold(inout vec3 z, inout float dz) {
    float r2 = dot(z, z);
    float minR2 = 0.25;
    float fixedR2 = 1.0;
    if (r2 < minR2) {
        float temp = fixedR2 / minR2;
        z *= temp;
        dz *= temp;
    } else if (r2 < fixedR2) {
        float temp = fixedR2 / r2;
        z *= temp;
        dz *= temp;
    }
}

float DE_mandelbox(vec3 p) {
    vec3 z = p;
    float dz = 1.0;
    float scale = uBoxScale;

    for (int i = 0; i < 15; i++) {
        boxFold(z, uFoldLimit);
        sphereFold(z, dz);
        z = scale * z + p;
        dz = dz * abs(scale) + 1.0;
    }
    return length(z) / abs(dz);
}

// ============================================================
// DE: Menger Sponge
// Self-contained. No special uniforms needed.
// To extract: copy this section + Uniforms + Utility sections
// ============================================================

float DE_menger(vec3 p) {
    vec3 z = abs(p);
    float scale = 3.0;
    float d = max(z.x, max(z.y, z.z)) - 1.0; // start with unit cube

    for (int i = 0; i < 8; i++) {
        z = abs(z);

        // Sort so z.x >= z.y >= z.z (using temp to avoid swizzle self-assignment,
        // which some GPU drivers handle incorrectly)
        float tmp;
        if (z.x < z.y) { tmp = z.x; z.x = z.y; z.y = tmp; }
        if (z.x < z.z) { tmp = z.x; z.x = z.z; z.z = tmp; }
        if (z.y < z.z) { tmp = z.y; z.y = z.z; z.z = tmp; }

        z = z * scale - (scale - 1.0);
        if (z.z < -0.5 * (scale - 1.0)) {
            z.z += scale - 1.0;
        }

        d = min(d, max(max(abs(z.x), abs(z.y)), abs(z.z)) * pow(scale, -float(i + 1)));
    }
    return d;
}

// ============================================================
// DE: Hybrid (Mandelbulb + Mandelbox morph)
// Depends on: DE_mandelbulb, DE_mandelbox, uMorphProgress
// To extract: copy this section + both source DE sections
// ============================================================

float DE_hybrid(vec3 p) {
    float d1 = DE_mandelbulb(p);
    float d2 = DE_mandelbox(p);
    return mix(d1, d2, uMorphProgress);
}

// ============================================================
// Section: DE Router
// ============================================================

float DE(vec3 p) {
    if (uFractalType == 0) return DE_mandelbulb(p);
    if (uFractalType == 1) return DE_mandelbox(p);
    if (uFractalType == 2) return DE_menger(p);
    return DE_hybrid(p);
}

// ============================================================
// Section: Raymarcher
// Returns vec2(distance, steps/MAX_STEPS) for AO calculation
// On miss: vec2(-1.0, closestApproach) for glow
// ============================================================

vec2 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    float minDist = MAX_DIST;

    for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= uMaxIterations) break;
        vec3 p = ro + rd * t;
        float d = DE(p);
        minDist = min(minDist, d);
        if (d < MIN_DIST) {
            return vec2(t, float(i) / float(uMaxIterations));
        }
        t += d;
        if (t > MAX_DIST) break;
    }
    return vec2(-1.0, minDist);
}

// ============================================================
// Section: Lighting & Coloring
// ============================================================

vec3 estimateNormal(vec3 p) {
    vec2 e = vec2(MIN_DIST * 2.0, 0.0);
    return normalize(vec3(
        DE(p + e.xyy) - DE(p - e.xyy),
        DE(p + e.yxy) - DE(p - e.yxy),
        DE(p + e.yyx) - DE(p - e.yyx)
    ));
}

float calcAO(vec3 p, vec3 n) {
    float ao = 0.0;
    float scale = 1.0;
    for (int i = 1; i <= 5; i++) {
        float dist = 0.02 * float(i);
        float d = DE(p + n * dist);
        ao += (dist - d) * scale;
        scale *= 0.5;
    }
    return clamp(1.0 - ao * uAOStrength, 0.0, 1.0);
}

vec3 getColor(float t, vec3 n, float ao) {
    vec3 color;

    if (uVisualStyle == 0) {
        // Dark & Atmospheric
        color = iqPalette(t,
            vec3(0.2, 0.2, 0.3),
            vec3(0.5, 0.4, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.00, 0.10, 0.20)
        );
    } else if (uVisualStyle == 1) {
        // Psychedelic
        color = iqPalette(t + uTime * 0.05,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.00, 0.33, 0.67)
        );
    } else if (uVisualStyle == 2) {
        // Geometric
        float v = 0.5 + 0.5 * cos(TAU * t);
        color = mix(vec3(v), uAccentColor, 0.2 + 0.3 * (1.0 - ao));
    } else {
        // Ambient
        color = iqPalette(t,
            vec3(0.6, 0.6, 0.65),
            vec3(0.3, 0.3, 0.3),
            vec3(1.0, 1.0, 0.5),
            vec3(0.10, 0.20, 0.30)
        );
    }

    return color;
}

vec3 shade(vec3 ro, vec3 rd, float dist, float stepRatio) {
    vec3 p = ro + rd * dist;
    vec3 n = estimateNormal(p);
    float ao = calcAO(p, n);

    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(n, lightDir), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    float colorIndex = dot(p, vec3(0.3, 0.5, 0.7)) * 0.5 + stepRatio;
    vec3 color = getColor(colorIndex, n, ao);

    vec3 lit = color * (0.15 + 0.7 * diff * ao + 0.15 * rim);

    // Fog per style
    float fogAmount;
    if (uVisualStyle == 0) {
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.5);
        lit = mix(lit, vec3(0.0), fogAmount);
    } else if (uVisualStyle == 1) {
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.2);
        lit = mix(lit, vec3(0.02), fogAmount);
    } else if (uVisualStyle == 2) {
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.4);
        lit = mix(lit, vec3(0.05), fogAmount);
    } else {
        fogAmount = 1.0 - exp(-dist * uFogDensity * 0.3);
        lit = mix(lit, vec3(0.03, 0.02, 0.04), fogAmount);
    }

    return lit;
}

// ============================================================
// Section: Main
// ============================================================

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

    // Build camera ray
    vec3 forward = normalize(uCameraDir);
    vec3 right = normalize(cross(forward, uCameraUp));
    vec3 up = cross(right, forward);

    float fov = 1.5;
    vec3 rd = normalize(uv.x * right + uv.y * up + fov * forward);
    vec3 ro = uCameraPos;

    vec2 result = march(ro, rd);
    float dist = result.x;
    float stepRatio = result.y;

    vec3 color;

    if (dist > 0.0) {
        color = shade(ro, rd, dist, stepRatio);
    } else {
        float closestApproach = result.y;

        // Background per style
        if (uVisualStyle == 0) {
            color = vec3(0.0);
        } else if (uVisualStyle == 1) {
            color = vec3(0.02, 0.01, 0.03);
        } else if (uVisualStyle == 2) {
            color = vec3(0.03);
        } else {
            color = vec3(0.02, 0.015, 0.025);
        }

        // Edge glow
        float glow = exp(-closestApproach * 50.0) * uGlowIntensity;
        vec3 glowColor;
        if (uVisualStyle == 0) {
            glowColor = vec3(0.3, 0.4, 0.8);
        } else if (uVisualStyle == 1) {
            glowColor = iqPalette(uTime * 0.03,
                vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
        } else if (uVisualStyle == 2) {
            glowColor = uAccentColor;
        } else {
            glowColor = vec3(0.5, 0.4, 0.6);
        }
        color += glowColor * glow;
    }

    color *= uBrightness;
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
