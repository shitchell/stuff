# Line Walker -- Planning Context

## Requirements (Verbatim Quotes)

### User Requirements (Highest Priority)

> the inspiration was a thing i saw where a dude has a page that takes a 3D canvas and then has a basic random bit that determines the next coordinate, then a line grows in that direction. then he can move the canvas around and watch it / zoom in or out...
-- Source: user, first message in conversation (the original inspiration for the entire project)

### User-Confirmed Designs

Line Walker scene description confirmed:

> **1. 3D Line Walker** (the one you described)
> - Random walk in 3D space, line grows each frame
> - OrbitControls to fly around and watch it grow
> - Color gradient along the line (hue shifts over time)
> - ~100 lines of Three.js. Dead simple, mesmerizing.
-- Source: Claude brainstorm, user confirmed entire tier list implicitly with "awesome!" and proceeding to discuss architecture

Detailed scene design confirmed:

> **Concept:** A single line grows through 3D space one segment at a time. Each step picks a random direction (biased slightly forward to avoid backtracking). Color shifts along the hue spectrum as it grows. OrbitControls to fly around.
>
> **Configurable settings:**
> - Speed (segments per second)
> - Step length
> - Direction bias (how "straight" vs "drunk" the walk is)
> - Line thickness
> - Color mode (rainbow gradient, single color, random per segment)
> - Trail length (infinite or fade after N segments)
> - Pause/restart
>
> **Implementation:** `THREE.BufferGeometry` with a growing position array. Each frame, compute next point, append to geometry, update draw range. Uses `lib/utils/color.js` for the hue ramp.
-- Source: Claude scene design, confirmed by user with "yeah!" (followed by auto-camera feature request)

### Claude Specifications (Uncontradicted)

Amendment regarding line thickness:

> **Line thickness removed from settings.** WebGL does not support `linewidth` on `THREE.Line` -- it is always 1px. Variable width requires `Line2` addon (5 extra vendor files + different geometry format). Deferred to future enhancement.
-- Source: Claude, identified during plan review. User did not object. Design doc amended to remove this setting.

Amendment regarding color modes (correcting an error in the initial implementation plan):

> **Line Walker color modes corrected.** Design said "rainbow gradient, single color, random per segment." Implementation plan initially mapped these to palette names (rainbow, neon, fire, etc.) -- wrong. Fixed to three distinct modes: Rainbow Gradient (hue cycles as line grows), Single Color (user picks one color via color picker), Random Per Segment (each segment gets a random hue).
-- Source: Claude, acknowledged as "a straight-up oversight during the translation from design to implementation." User confirmed the fix with "please :)"

Walker algorithm from implementation plan:

> The walker maintains a growing trail of 3D points. Each step picks a new direction: a random vector blended with the previous direction based on a "bias" parameter (higher bias = straighter path).
-- Source: Claude, Task 6 of implementation plan

Color mode implementation detail:

> Color mode note: The three modes work as follows:
> - 'rainbow': Hue cycles smoothly as the line grows (uses colorRamp with 'rainbow' palette)
> - 'single': Entire line is one color, set by the 'singleColor' color picker
> - 'random': Each segment gets a random hue (randomRange(0, 360) -> hslToHex)
-- Source: Claude, amended Task 6 code comment

## Alignment with Design Doc

The design doc (Section "Pages > 1. Line Walker", lines 12-25) describes:
- Single line growing through 3D space
- Random direction biased forward
- Color shifts along hue spectrum
- OrbitControls
- Settings: Speed, Step length, Direction bias, Line thickness (AMENDED: removed), Color mode, Trail length, Pause/restart
- Implementation via BufferGeometry with growing position array

The design doc was amended to remove "Line thickness" from settings and correct color modes. The amendment is documented in the "Amendments (2026-02-10)" section at the bottom of the design doc.

## Alignment with Implementation Plan

Task 6 covers the Line Walker scene with three files:
- `site/3d/scenes/line-walker/walker.js` -- complete Walker class code (~85 lines)
- `site/3d/scenes/line-walker/main.js` -- complete scene setup code (~80 lines, amended to fix color modes)
- `site/3d/scenes/line-walker/index.html` -- HTML shell with import map

The implementation plan includes:
- Walker class with step(), tip getter, reset() methods
- Pre-allocated Float32Array buffer with maxPoints limit
- Direction bias via lerp between previous direction and random vector
- Three color modes (rainbow gradient, single color via color picker, random per segment)
- Trail length trimming via setDrawRange
- Settings wired to walker properties via onChange callbacks

## Gaps or Concerns

1. **Pause/restart** -- The design doc lists "Pause/restart" as a setting. The implementation plan has a "Reset" button but no "Pause" toggle. The SceneManager has `stop()` and can re-call `start()`, but there is no explicit pause UI in the settings. This is a minor gap -- a pause toggle could be added via `addToggle('paused', 'Paused', false)` wired to skipping the step accumulation in the update loop.

2. **Buffer full behavior** -- When the walker reaches maxPoints, the current implementation calls `walker.reset()` which restarts from origin. The design doc says "Trail length (infinite or fade after N segments)" but does not specify what happens when the buffer is full with trail=infinite. The implementation plan's behavior (reset on buffer full) is reasonable but should be documented.

3. **No line thickness setting** -- Per amendment, this is intentionally removed. The design doc amendment documents this. No action needed unless Line2 support is added later.

## Implementation Guidance

- Walker class pre-allocates a Float32Array of `maxPoints * 3` floats for positions and another for colors.
- Each step: generate random direction vector, lerp with previous direction using bias factor, normalize, scale by stepLength, add to position, write to buffer.
- `geometry.setDrawRange(start, count)` controls both trail trimming and buffer growth.
- Color is set per-vertex via a separate color BufferAttribute. The material must have `vertexColors: true`.
- The three color modes require different logic paths in the animation loop: rainbow uses `colorRamp(t, 'rainbow')`, single uses a fixed THREE.Color from the color picker, random uses `hslToHex(randomRange(0, 360), 80, 60)`.
- Auto-camera target for this scene: `() => ({ position: walker.tip })` with default mode `drift`.
