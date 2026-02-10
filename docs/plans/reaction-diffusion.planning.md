# Reaction-Diffusion on Sphere -- Planning Context

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> can we add one more of your choosing from tier 3?
-- Source: user, second message in conversation (requesting Claude pick a Tier 3 visualization)

### User-Confirmed Designs

Reaction-Diffusion on Sphere selected by user from Claude's recommendation:

> For the Tier 3 pick, I suggested Reaction-Diffusion on a Sphere. It's the most visually distinct from the other three (which are all lines/particles/geometry). But want to make sure you're into it -- it produces organic coral/cell patterns that slowly evolve on a rotating sphere. Alternative?
-- Source: Claude question, confirmed by user selecting "Reaction-Diffusion on Sphere"

Detailed scene design confirmed:

> **Concept:** Gray-Scott reaction-diffusion model running as a fragment shader on a sphere's surface. Organic, coral-like patterns emerge and evolve continuously. Sphere slowly rotates. OrbitControls to inspect.
>
> **Configurable settings:**
> - Feed rate (F) and Kill rate (k) -- with named presets ("coral", "mitosis", "maze", "spots", "waves")
> - Simulation speed
> - Color palette (organic, thermal, monochrome)
> - Sphere rotation speed
> - Resolution (texture size -- performance vs detail tradeoff)
> - Reset / seed pattern (center dot, random noise, ring)
>
> **Implementation:** Two render targets (ping-pong) with a Gray-Scott fragment shader. Each frame, the shader reads from one texture and writes the next simulation step to the other. The sphere's material samples the current texture. Uses `lib/utils/shader.js` for shader loading and `createShaderMaterial`. The GLSL is stored as separate `.frag`/`.vert` files in the scene directory.
-- Source: Claude scene design, confirmed by user with "yeah!" (same confirmation as all four scenes)

### Claude Specifications (Uncontradicted)

Amendment regarding simulation.js detail:

> **Reaction-Diffusion simulation.js detailed.** Added complete ping-pong render target setup, seed function implementation, and sphere UV mapping notes.
-- Source: Claude, design doc amendment #6

Ping-pong setup (from amended implementation plan):

> **Ping-pong setup (critical detail):**
>
> Two `THREE.WebGLRenderTarget` with `THREE.FloatType` and `THREE.RGBAFormat`. Channel R = chemical A, channel G = chemical B. The constructor creates:
>
> 1. Two render targets (`rtA`, `rtB`) of size `resolution x resolution`
> 2. A fullscreen quad: `new THREE.PlaneGeometry(2, 2)` -- fills the entire clip space
> 3. A dedicated `THREE.Scene` and `THREE.Camera` (orthographic, -1 to 1) just for the simulation pass -- these are separate from the main scene
> 4. The simulation shader material (reaction-diffusion.frag) applied to the quad
-- Source: Claude, amended Task 11

Ping-pong step logic:

> Each call to `step()`:
> ```js
> for (let i = 0; i < stepsPerFrame; i++) {
>     // Read from current, write to other
>     this.simMaterial.uniforms.uState.value = this.rtA.texture;
>     renderer.setRenderTarget(this.rtB);
>     renderer.render(this.simScene, this.simCamera);
>     // Swap
>     [this.rtA, this.rtB] = [this.rtB, this.rtA];
> }
> renderer.setRenderTarget(null); // Reset to screen
> ```
-- Source: Claude, amended Task 11

Seed function implementation:

> **Seed function:** To write initial state to a render target, create a `THREE.DataTexture` filled with the initial (A=1, B=0) everywhere, then set B=1 in seed regions
-- Source: Claude, amended Task 11 (complete code for center, random, and ring seed patterns provided)

Sphere UV mapping note:

> **Sphere UV mapping note:** `THREE.SphereGeometry` generates standard UV coordinates that map the texture onto the sphere. The simulation texture wraps horizontally (left/right edges meet) which is correct for a sphere's equator. There will be some distortion at the poles -- this is normal and actually looks good (the patterns compress at the poles, creating natural variation).
-- Source: Claude, amended Task 11

Display shader -- critical note about vertex shader:

> **Important:** The display shader is applied to the sphere as a `THREE.ShaderMaterial`. Its vertex shader must use Three.js standard projection (`projectionMatrix * modelViewMatrix * vec4(position, 1.0)`) -- NOT the fullscreen quad passthrough used by the simulation shader. The display shader's fragment shader samples the simulation texture using the sphere's `vUv` coordinates.
-- Source: Claude, amended Task 11 Step 2

Named presets:

> **Named presets** (f, k values):
> - coral: (0.0545, 0.062)
> - mitosis: (0.0367, 0.0649)
> - maze: (0.029, 0.057)
> - spots: (0.035, 0.065)
> - waves: (0.014, 0.054)
-- Source: Claude, Task 11

Gray-Scott equations:

> - `dA = Da * lap(A) - A*B*B + f*(1-A)`
> - `dB = Db * lap(B) + A*B*B - (k+f)*B`
> - `Da = 1.0`, `Db = 0.5` (standard diffusion rates)
-- Source: Claude, Task 11

Preset/slider locking:

> **Preset/slider locking:** Same pattern as Lorenz -- selecting a preset updates the F/k sliders.
-- Source: Claude, Task 11 Step 2

## Alignment with Design Doc

The design doc (Section "Pages > 4. Reaction-Diffusion on Sphere", lines 57-68) describes:
- Gray-Scott reaction-diffusion model as fragment shader on sphere
- Organic coral-like patterns
- Sphere slowly rotates, OrbitControls
- Settings: Feed/Kill rates with presets, Simulation speed, Color palette, Sphere rotation speed, Resolution, Reset/seed pattern
- Implementation via ping-pong render targets

The design doc was amended to add detailed simulation.js specification (amendment #6).

## Alignment with Implementation Plan

Task 11 covers the Reaction-Diffusion scene with six files:
- `docs/scenes/reaction-diffusion/simulation.js` -- ReactionDiffusion class (API + detailed ping-pong setup code)
- `docs/scenes/reaction-diffusion/main.js` -- scene setup (described, key details specified)
- `docs/scenes/reaction-diffusion/reaction-diffusion.frag` -- complete Gray-Scott shader code provided
- `docs/scenes/reaction-diffusion/reaction-diffusion.vert` -- fullscreen quad passthrough (code provided)
- `docs/scenes/reaction-diffusion/display.frag` -- palette-based display shader (code provided with organic, thermal, monochrome palettes)
- `docs/scenes/reaction-diffusion/index.html` -- HTML shell

Task 10 (Shader utility) is a prerequisite.

## Gaps or Concerns

1. **display.vert not listed as a file** -- The display shader needs its own vertex shader (using Three.js standard projection, NOT the fullscreen quad passthrough). The implementation plan lists `display.frag` but does not list a separate `display.vert`. The display fragment shader is noted as being "paired with a standard Three.js vertex shader, NOT the fullscreen quad vert." In practice, Three.js `ShaderMaterial` can accept a custom vertex shader string inline, so a separate file may not be needed. However, this should be clarified -- either provide a `display.vert` file or use Three.js's built-in vertex shader via `ShaderMaterial`'s default.

2. **Seed function render-to-texture** -- The seed function creates a `THREE.DataTexture` but then says "Copy to both render targets by rendering a textured quad... (render tex to rtA, then copy rtA to rtB)" with an ellipsis. The exact mechanism for writing a DataTexture to a WebGLRenderTarget is left partially unspecified. The implementer needs to: create a temporary mesh with the DataTexture, render it to rtA, then render from rtA to rtB (or just write the same DataTexture to both targets).

3. **Simulation speed setting** -- The plan says "steps per frame, 1-20" but does not specify the simulation timestep (`uDt` uniform). The shader uses `uDt` in the Gray-Scott equations. A reasonable default would be `uDt = 1.0` since the step size is already controlled by how many steps per frame are executed.

4. **Resolution change behavior** -- Changing resolution (128/256/512) requires destroying and recreating both render targets and the DataTexture. The plan does not explicitly describe this, but it follows naturally from the ReactionDiffusion class having resolution as a constructor parameter -- a resolution change would require a new instance.

## Implementation Guidance

- ReactionDiffusion class owns two WebGLRenderTargets (float type, RGBA format), a dedicated simulation scene with orthographic camera, and a fullscreen quad with the simulation shader.
- The simulation runs entirely on the GPU. Each step: set uState to current texture, render to other target, swap targets.
- The sphere in the main scene uses a separate display ShaderMaterial that reads from `simulation.texture` (the current target's texture).
- CRITICAL: The simulation vertex shader (`reaction-diffusion.vert`) uses `gl_Position = vec4(position, 1.0)` for the fullscreen quad. The display shader on the sphere must use `gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0)` for proper 3D projection.
- Seed function writes initial state to both render targets. A=1.0 everywhere, B=0.0 everywhere, except in seed regions where B=1.0.
- Named presets map to (f, k) pairs. Selecting a preset updates the F/k sliders (same pattern as Lorenz).
- Sphere rotates via `sphere.rotation.y += rotationSpeed * dt`.
- Add ambient light for subtle depth cues on the sphere surface.
- Auto-camera target: `() => ({ position: new THREE.Vector3(0, 0, 0) })` with default mode `orbit`.
