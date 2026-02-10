# Wireframe Flythrough -- Planning Context

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> i saw another guy who had a little airplane that just flies through a procedurally generated terrain with wireframe looking little hills and mountains and trees appearing as they get close to the frame. very cyberpunk.
-- Source: user, first message in conversation (one of the two original inspirations)

### User-Confirmed Designs

Wireframe flythrough selected from brainstorm:

> **4. Wireframe Flythrough** (the airplane one you described)
> - Camera moves forward through procedurally generated terrain
> - Wireframe mountains via simplex noise heightmap
> - Neon/cyberpunk color palette on black. Synthwave vibes.
> - ~200-300 lines. Needs a noise library (or inline simplex).
-- Source: Claude brainstorm, confirmed implicitly by user proceeding with four-scene plan

Detailed scene design confirmed:

> **Concept:** Camera flies forward over procedurally generated terrain. Ground is a wireframe mesh colored in neon gradients. Objects (trees, pyramids, columns) appear as wireframe shapes. Synthwave/cyberpunk aesthetic -- dark sky, neon ground, maybe a grid horizon line.
>
> **Configurable settings:**
> - Fly speed
> - Terrain roughness (noise frequency/amplitude)
> - Wireframe color (neon green, pink, cyan, custom)
> - Object density (trees/shapes per chunk)
> - Fog distance
> - Camera height
> - Sky color / horizon glow
>
> **Implementation:** Chunked terrain -- a ring buffer of terrain strips ahead of the camera. Each strip is a `PlaneGeometry` with vertex heights from `lib/utils/noise.js` simplex3D (using z-position as seed so terrain is deterministic for a given position). Old chunks behind the camera are recycled to the front with new noise values. Uses `lib/core/camera.js` `createFlyCamera` for forward movement.
-- Source: Claude scene design, confirmed by user with "yeah!" (same confirmation as all four scenes)

### Claude Specifications (Uncontradicted)

Amendment regarding camera behavior:

> **Wireframe Flythrough camera clarified.** Does NOT use OrbitControls or `createFlyCamera`. Camera moves forward automatically along -Z each frame. No user steering. Pure screensaver mode.
-- Source: Claude, design doc amendment #4

Camera implementation from plan:

> **IMPORTANT -- Camera behavior:** This scene does NOT use OrbitControls or `createFlyCamera`. The camera moves forward automatically at a configurable speed. There is no user steering. The camera setup is:
>
> ```js
> // Do NOT pass orbitControls: true -- this scene has no orbit controls
> const mgr = new SceneManager(canvas, {
>     background: 0x000011,
>     orbitControls: false,  // No orbit controls for this scene
> });
>
> // Camera flies forward along -Z axis
> mgr.camera.position.set(0, cameraHeight, 0);
> mgr.camera.lookAt(0, cameraHeight, -100);
>
> // In the update loop:
> mgr.camera.position.z -= speed * dt;
> terrain.update(mgr.camera.position.z);
> ```
>
> The camera simply translates forward each frame. Terrain chunks recycle ahead of it. Fog hides the generation seam. That's it -- no WASD, no mouse look, no pointer lock. Pure screensaver.
-- Source: Claude, amended Task 9 of implementation plan

TerrainManager API:

> class TerrainManager {
>     constructor(scene, options)  // chunkSize, chunkCount, segments, frequency, amplitude
>     update(cameraZ)              // recycle chunks as camera moves
>     setColor(hex)                // update wireframe color
>     dispose()
> }
-- Source: Claude, Task 9 of implementation plan

Object types:

> Simple wireframe shapes placed on the terrain:
> - **Trees:** Wireframe cone on a wireframe cylinder (trunk)
> - **Pyramids:** Wireframe tetrahedron
> - **Columns:** Wireframe cylinder
-- Source: Claude, Task 9 of implementation plan

Visual elements:

> **Additional visual elements:**
> - `THREE.FogExp2` with configurable density (denser fog = shorter view distance)
> - A `THREE.GridHelper` at y=0 for the synthwave ground-grid effect, repositioned each frame to stay centered under the camera
> - Neon color applied to both terrain wireframe and grid via `THREE.MeshBasicMaterial({ wireframe: true, color: neonColor })` and `THREE.LineBasicMaterial({ color: neonColor })`
-- Source: Claude, Task 9 of implementation plan

## Alignment with Design Doc

The design doc (Section "Pages > 3. Wireframe Flythrough", lines 42-54) describes:
- Camera flies forward over procedurally generated terrain
- Ground is wireframe mesh with neon gradients
- Objects (trees, pyramids, columns) as wireframe shapes
- Synthwave/cyberpunk aesthetic
- Settings: Fly speed, Terrain roughness, Wireframe color, Object density, Fog distance, Camera height, Sky color/horizon glow
- Implementation via chunked terrain, ring buffer, PlaneGeometry with simplex3D noise, old chunks recycled

The design doc originally said "Uses `createFlyCamera` for forward movement" but was amended to clarify the camera does NOT use createFlyCamera or OrbitControls.

## Alignment with Implementation Plan

Task 9 covers the Wireframe Flythrough with four files:
- `site/3d/scenes/wireframe-flythrough/terrain.js` -- TerrainManager class (API specified, implementation left to agent)
- `site/3d/scenes/wireframe-flythrough/objects.js` -- createTree, createPyramid, createColumn factory functions
- `site/3d/scenes/wireframe-flythrough/main.js` -- scene setup with automatic camera movement (key code provided)
- `site/3d/scenes/wireframe-flythrough/index.html` -- HTML shell

Task 8 (Simplex Noise) is a prerequisite for this scene.

## Gaps or Concerns

1. **No user interaction at all** -- This scene has no OrbitControls and no FlyCamera. The user's original description mentioned "a little airplane that just flies through" which aligns with automatic movement. However, the user also said all pages should be "interactive and/or just act as kinda nifty visual effects / screensavers." The wireframe flythrough is purely screensaver (no interaction beyond settings). This is acceptable -- the "and/or" in the user's requirement permits pure screensaver mode.

2. **terrain.js lacks complete code** -- The implementation plan provides the TerrainManager API but not complete implementation code. The agent will need to implement chunk generation, recycling logic, and noise-based vertex displacement. The algorithm description is sufficient but not as detailed as, say, the Walker class code.

3. **objects.js placement algorithm** -- The plan says "Objects are spawned randomly on terrain chunks when they're recycled. Old objects are removed with old chunks." The specifics of how objects are placed (random positions on chunk surface, snapped to terrain height, density control) are left to the implementer.

4. **"Sky color / horizon glow" setting** -- Listed in the design doc settings but not clearly addressed in the implementation plan. The plan mentions `background: 0x000011` and fog but does not specify a configurable sky gradient or horizon glow. This could be implemented as a simple background color setting or as a more complex gradient shader. The simpler interpretation (configurable background color) is likely sufficient.

5. **No steering, so user's "airplane" reference** -- The user mentioned an airplane in their inspiration, but the implementation has no airplane model or avatar. The camera IS the airplane. This is fine -- the user's description was of a reference they saw, and the plan interprets it as a camera flythrough.

## Implementation Guidance

- Create SceneManager with `orbitControls: false`. Camera is positioned at `(0, cameraHeight, 0)` looking along -Z.
- Each frame: `camera.position.z -= speed * dt`, then call `terrain.update(camera.position.z)`.
- TerrainManager maintains a ring buffer of N terrain chunks (PlaneGeometry with wireframe material). When the camera passes a chunk, that chunk is moved to the front of the queue and its vertices are recomputed with new noise values.
- Simplex noise is called with `simplex2D(x * frequency, z * frequency) * amplitude` for each vertex height.
- FogExp2 hides the generation seam at the far end.
- GridHelper repositioned each frame to stay centered under camera.
- Decorative objects are created as simple wireframe geometries (ConeGeometry for trees, TetrahedronGeometry for pyramids, CylinderGeometry for columns) and added to chunks during recycling.
- Neon color is configurable via a hex color picker. Applied to all wireframe materials.
- Auto-camera target: `() => ({ position: mgr.camera.position.clone(), direction: new THREE.Vector3(0, 0, -1) })` with default mode `follow`. Note: since this scene's camera already moves forward automatically, auto-camera in follow mode should add gentle elevation variation and slight lateral drift rather than taking over completely.
