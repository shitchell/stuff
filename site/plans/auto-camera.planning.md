# AutoCamera -- Planning Context

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> yeah! can we also note: for the screensaver effect, i'd love to add a 30s timeout such that, after 30s of inactivity, the camera will automatically start (smoothly) moving around focused on some central object (be it the plane, the (every-updating) tip of the line, etc...). this would be configurable in the menu (blank = never switch to camera auto-move, int = seconds of inactivity before switching, default=30)
-- Source: user, after confirming the four scene designs (note: this was the second version of this message; the user interrupted and revised the first version to add more detail)

> awesome :) i was using 1 field for seconds to save configs lol (no idea why; they're free), but i like your mode setting, and if we're adding that, i think let's go ahead and add 3: enabled (bool), inactivity seconds (int), mode
-- Source: user, refining the auto-camera settings to three distinct fields

> ooh, yeah... it would ideally center on a node's (updating) x/y/z coordinates OR, if a page is setup in such a way that it defines new "central" nodes, we should have a system whereby those "new" nodes will be cleanly recognized by our autocamera. perhaps some standard `getFocusNodeCoordinates()` or similar function in autocamera that calls a page's own custom defined `getFocusNode()`, which returns whatever that page decides is the "focus" node for its purposes
-- Source: user, responding to Claude's concern about the follow mode hardcoding z-offset. User wants a flexible target interface.

### User-Confirmed Designs

AutoCamera module design confirmed:

> ### `lib/core/auto-camera.js`
>
> ```js
> export class AutoCamera {
>     constructor(camera, controls, options = {})
>
>     setTarget(targetFn)     // function returning THREE.Vector3 (e.g., () => line.tip)
>     setMode(mode)           // 'orbit', 'drift', 'follow' -- how it moves when active
>     activate()              // start smooth transition into auto-movement
>     deactivate()            // user touched controls, smoothly hand back control
>     update(dt)              // called each frame by SceneManager
> }
> ```
>
> **Behavior:**
> - Listens for the same inactivity signal as `ChromeController` but with its own timeout (default 30s, configurable, blank = disabled)
> - On activation, **smoothly lerps** from current camera position/orientation into the auto-movement path -- no jarring snap
> - Any mouse/keyboard/touch input immediately deactivates and hands control back to OrbitControls (or FlyCamera), again with a smooth transition
-- Source: Claude design, confirmed by user with "awesome :)"

Settings panel design confirmed:

> Clean. Three fields, no overloading. Settings panel for auto-camera becomes:
>
> ```
> Auto-camera           [checkmark]
> Inactivity (seconds)  [slider 30]    <- slider, 5-120, disabled when unchecked
> Auto-camera mode      [orbit dropdown]      <- disabled when unchecked
> ```
>
> The toggle greys out the other two when off. Simple.
-- Source: Claude, following user's explicit three-field requirement. Not separately confirmed but directly implements user requirement.

Mode descriptions confirmed:

> **Modes:**
> - `orbit` -- circles the target at a fixed radius, slowly varying elevation (good for lorenz, reaction-diffusion)
> - `drift` -- lazy random walk around the target, like a documentary camera (good for line-walker)
> - `follow` -- tracks the target from behind/above as it moves (good for flythrough)
>
> Each scene picks a default mode but it's selectable in settings.
-- Source: Claude, confirmed implicitly as part of "awesome :)" response

### Claude Specifications (Uncontradicted)

Amendment regarding target interface:

> **AutoCamera target interface expanded.** `setTarget(fn)` now expects `fn` to return `{ position: Vector3, direction?: Vector3 }` instead of just `Vector3`. The `direction` field is used by `follow` mode to position the camera behind the target. If omitted, follow mode falls back to orbit behavior.
-- Source: Claude, design doc amendment #5

Target function interface (from implementation plan):

> /**
>  * Set the target function. Must return { position: Vector3, direction?: Vector3 }.
>  * `position` is the point to look at / orbit around.
>  * `direction` (optional) is the target's forward direction -- used by
>  * 'follow' mode to position the camera behind the target. If omitted,
>  * follow mode falls back to orbit behavior.
>  *
>  * @param {() => { position: THREE.Vector3, direction?: THREE.Vector3 }} fn
>  */
> setTarget(fn) { this.#targetFn = fn; }
-- Source: Claude, amended Task 12

Follow mode with direction support:

> case 'follow': {
>     // Position camera behind and above the target's forward direction.
>     // If no direction provided, fall back to orbit mode behavior.
>     if (targetDir) {
>         // Place camera opposite to the target's direction vector
>         const behind = targetDir.clone().normalize().multiplyScalar(-this.#followDistance);
>         desiredPos = targetPos.clone().add(behind);
>         desiredPos.y += this.#followHeight;
>     } else {
>         // No direction info -- orbit instead
>         ...
>     }
> }
-- Source: Claude, amended Task 12

Scene-specific target functions:

> | Scene | Default Mode | Target Function |
> |-------|-------------|-----------------|
> | line-walker | `drift` | `() => ({ position: walker.tip })` -- orbits/drifts around the growing tip |
> | lorenz | `orbit` | `() => ({ position: new THREE.Vector3(0, 0, 25) })` -- orbits the attractor centroid |
> | wireframe-flythrough | `follow` | `() => ({ position: mgr.camera.position.clone(), direction: new THREE.Vector3(0, 0, -1) })` -- follows the camera from behind. **Note:** Since this scene's camera already moves forward automatically, AutoCamera in `follow` mode should add gentle elevation variation and slight lateral drift to the camera's existing path rather than taking over completely. |
> | reaction-diffusion | `orbit` | `() => ({ position: new THREE.Vector3(0, 0, 0) })` -- orbits the sphere center |
-- Source: Claude, amended Task 13

Smooth transition via smoothstep:

> /** Hermite smoothstep for smooth transitions */
> function smoothstep(t) {
>     return t * t * (3 - 2 * t);
> }
-- Source: Claude, Task 12

Integration with ChromeController via separate timer:

> // Wire with ChromeController -- create a second timer for auto-camera:
> let autoCamTimer = null;
> function resetAutoCamTimer() {
>     if (autoCamTimer) clearTimeout(autoCamTimer);
>     if (autoCamera.active) autoCamera.deactivate();
>     if (settings.get('autoCamEnabled')) {
>         autoCamTimer = setTimeout(
>             () => autoCamera.activate(),
>             settings.get('autoCamTimeout') * 1000
>         );
>     }
> }
-- Source: Claude, Task 13

## Alignment with Design Doc

The design doc (Section "AutoCamera", lines 163-186) describes:
- AutoCamera class with constructor(camera, controls, options), setTarget, setMode, activate, deactivate, update
- Settings: enabled (bool, default true), inactivity seconds (int, 5-120, default 30), mode (orbit/drift/follow)
- Three modes with per-scene defaults
- Target function returns `{ position: Vector3, direction?: Vector3 }` (amended)

## Alignment with Implementation Plan

Task 12 provides complete AutoCamera class code (~120 lines) with:
- All three modes (orbit, drift, follow) implemented
- Smooth transition via smoothstep interpolation
- Direction-aware follow mode with orbit fallback
- Private state management (#time, #driftTarget, #driftTimer, etc.)

Task 13 provides the integration pattern for all four scenes, including:
- Settings panel additions (3 settings)
- Timer-based activation linked to ChromeController
- Scene-specific target functions table
- Verification steps

## Gaps or Concerns

1. **User wanted `getFocusNodeCoordinates()` / `getFocusNode()` pattern** -- The user specifically asked for "some standard `getFocusNodeCoordinates()` or similar function in autocamera that calls a page's own custom defined `getFocusNode()`." The implementation uses `setTarget(fn)` where `fn` is a function that returns `{ position, direction? }`. This is functionally equivalent to the user's request -- the "page's own custom defined" function IS the `fn` passed to `setTarget()`. The naming differs but the pattern matches. The user's intent is satisfied.

2. **Wireframe flythrough auto-camera behavior** -- The plan notes that since the flythrough camera already moves forward automatically, auto-camera in follow mode "should add gentle elevation variation and slight lateral drift to the camera's existing path rather than taking over completely." This behavior is described in prose but not implemented in the code. The implementer needs to handle this special case.

3. **Settings greying out** -- The user's confirmed design shows the inactivity slider and mode dropdown being "disabled when unchecked." The implementation plan wires `autoCamEnabled` to enable/disable the timer, but does not explicitly show lil-gui's controller enable/disable mechanism for greying out the dependent controls. lil-gui supports `.enable()` and `.disable()` on controllers; the implementer should use these.

4. **ChromeController vs AutoCamera timer separation** -- ChromeController has a 3-second timeout for UI hiding. AutoCamera has a separate, longer timeout (default 30s) for camera activation. These are independent timers, not shared. The implementation plan handles this correctly with separate timeouts, but the implementer should understand they are decoupled.

## Implementation Guidance

- AutoCamera is a standalone class in `lib/core/auto-camera.js`. It does NOT extend or modify ChromeController.
- Each scene creates its own AutoCamera instance and calls `setTarget(fn)` with a scene-specific function.
- The target function is called every frame during `update(dt)`. It must return `{ position: Vector3, direction?: Vector3 }`.
- `activate()` saves the current camera position and disables OrbitControls. `deactivate()` re-enables controls.
- Transition uses hermite smoothstep over `transitionDuration` seconds (default 2).
- Three modes: orbit (sinusoidal angle + elevation), drift (random target points with exponential lerp), follow (behind direction vector or orbit fallback).
- Integration: each scene adds three settings, creates an AutoCamera, sets up a timer that resets on ChromeController's `onActive` callback, and calls `autoCamera.update(dt)` in the render loop.
- The auto-camera timer is managed in each scene's main.js, not inside AutoCamera itself. AutoCamera only knows about activate/deactivate/update.
