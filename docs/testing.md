# Testing Guide

## Philosophy

- **Tests reflect desired functionality, not buggy code.** A test describes what the system *should* do. If the code is wrong, the test fails -- the test is not rewritten to match the bug.
- **All claims must be backed by log evidence.** Never conclude "the bug is X" without showing the log output that proves it. If you cannot produce evidence, you do not have a conclusion.
- **Observations and hypotheses are kept separate.** An observation is a raw fact ("brightness dropped to 0 at t=7s"). A hypothesis is an inference ("the autocamera transition blanks the framebuffer"). Mixing them leads to false conclusions.
- **Tests should be deterministic where possible.** When nondeterminism is unavoidable (e.g., random walk direction, camera drift targets), document *why* the test is nondeterministic and use retries judiciously. The Playwright config sets `retries: 3` for this reason.

## Tools & Setup

### Playwright

The project uses [Playwright](https://playwright.dev/) for browser-based integration testing. All WebGL scenes run in headless Chromium with SwiftShader for software rendering.

**Config:** `playwright.config.mjs` at the project root.

Key settings:
- `testDir: './tests'`
- `timeout: 120_000` (2 minutes per test -- scenes need time to render and be sampled)
- `retries: 3` (to handle nondeterministic visual output)
- `viewport: { width: 800, height: 600 }`
- WebGL flags: `--use-gl=angle`, `--use-angle=swiftshader`, `--enable-webgl`
- `webServer`: serves `site/` on port 3333 via `npx serve`

### Running Tests

```bash
# Run all tests
npx playwright test

# Run a specific test file
npx playwright test tests/autocamera-blackout.spec.mjs

# Run with visible browser (for debugging)
npx playwright test --headed

# Run with Playwright UI
npx playwright test --ui
```

### Test Directory

All tests live in `tests/` at the project root:

| File | What It Tests |
|------|---------------|
| `autocamera-blackout.spec.mjs` | Fractal-dreamscape scene stays visible when autocamera activates |
| `line-walker-blackout.spec.mjs` | Line-walker scene stays visible across all autocamera modes (drift, orbit, follow) |

## Test Patterns

### Dual-Test Pattern for Bugs

Every bug gets two tests:

1. **Success test** -- validates the expected behavior. This test should PASS when the bug is fixed and FAIL while the bug is present.
2. **Bug detection test** -- includes `BUG-{ID}` in assertion messages. This test should FAIL when the bug is present and PASS when it is fixed.

The `BUG-{ID}` tag in assertion messages makes it easy to search for known-bug tests and track which bugs have been resolved. Both tests exist to prevent regressions: the success test confirms the fix works, and the bug detection test confirms the specific failure mode no longer occurs.

### Canvas Pixel Sampling

For visual/WebGL scenes, direct framebuffer reads are unreliable in headless mode (preserveDrawingBuffer issues). Instead, use **element screenshots + pixel analysis**:

```javascript
import { PNG } from 'pngjs';

async function sampleCanvasScreenshot(page) {
    const canvas = page.locator('#canvas');
    const screenshot = await canvas.screenshot({ type: 'png' });
    const png = PNG.sync.read(screenshot);
    const { width, height, data } = png;

    // Sample a grid of pixels (not every pixel -- performance matters)
    const sampleSize = 20;
    const stepX = Math.max(1, Math.floor(width / sampleSize));
    const stepY = Math.max(1, Math.floor(height / sampleSize));

    let totalBrightness = 0;
    let blackPixels = 0;
    let sampleCount = 0;
    let maxBrightness = 0;

    for (let x = 0; x < width; x += stepX) {
        for (let y = 0; y < height; y += stepY) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;
            totalBrightness += brightness;
            if (brightness < 5) blackPixels++;
            if (brightness > maxBrightness) maxBrightness = brightness;
            sampleCount++;
        }
    }

    return {
        avgBrightness: totalBrightness / sampleCount,
        maxBrightness,
        blackRatio: blackPixels / sampleCount,
        isBlack: (blackPixels / sampleCount) > 0.95,
    };
}
```

**Key points:**
- Sample periodically (e.g., every 500ms--1000ms) and track brightness over time
- Use `isBlack` (blackRatio > 0.95) to detect full blackouts
- Use `maxBrightness` to detect content visibility vs. background-only frames (e.g., the line-walker background is `0x0a0a1a` with max channel ~26, so `maxBrightness > 30` indicates visible content)
- Document threshold values and why they were chosen

### localStorage Injection for Settings

Scenes load settings from localStorage on init. To test specific configurations, set localStorage *before* the scene's JS runs:

```javascript
// Navigate first so localStorage is accessible on the correct origin
await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });

// Set settings before the scene initializes
await page.evaluate((timeout) => {
    localStorage.setItem('scenes:line-walker:autoCamEnabled', 'true');
    localStorage.setItem('scenes:line-walker:autoCamTimeout', JSON.stringify(timeout));
    localStorage.setItem('scenes:line-walker:autoCamMode', JSON.stringify('drift'));
}, AUTOCAM_TIMEOUT_SEC);

// Reload so the scene picks up localStorage values on init
await page.reload({ waitUntil: 'domcontentloaded' });
```

The localStorage key format is `scenes:{sceneId}:{settingKey}`, matching the `SettingsPanel` class's `#storageKey()` method.

### Console Log Capture

Capture browser console output filtered by component prefix tags:

```javascript
const consoleLogs = [];
page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ time: Date.now(), type: msg.type(), text });
    // Print relevant debug logs in real-time for test runner output
    if (text.includes('[autocam]') || text.includes('[scene-name]')) {
        console.log(`  BROWSER: ${text}`);
    }
});

// Also capture page errors
page.on('pageerror', (err) => {
    console.log(`  PAGE ERROR: ${err.message}`);
});
```

After the test runs, filter and dump debug logs for analysis:

```javascript
const debugLogs = consoleLogs.filter(
    (l) => l.text.includes('[autocam]') || l.text.includes('[scene-name]')
);
if (debugLogs.length > 0) {
    console.log('\n--- Debug logs from browser ---');
    for (const log of debugLogs) {
        console.log(`  [${new Date(log.time).toISOString()}] ${log.text}`);
    }
    console.log('--- End debug logs ---\n');
}
```

### Scenario Runner Pattern

For testing the same behavior across multiple configurations (e.g., autocamera modes), extract a shared scenario runner:

```javascript
async function runBlackoutScenario(page, { mode, timeoutSec, observeSec, sampleIntervalMs }) {
    // Set up console capture
    // Navigate and inject localStorage
    // Sample pixels over time
    // Dump debug logs
    // Return structured results: { samples, debugLogs, consoleLogs }
}

test('drift mode', async ({ page }) => {
    const { samples } = await runBlackoutScenario(page, {
        mode: 'drift', timeoutSec: 5, observeSec: 15, sampleIntervalMs: 500,
    });
    // Assert on samples
});

test('orbit mode', async ({ page }) => {
    const { samples } = await runBlackoutScenario(page, {
        mode: 'orbit', timeoutSec: 5, observeSec: 15, sampleIntervalMs: 500,
    });
    // Assert on samples
});
```

See `tests/line-walker-blackout.spec.mjs` for a complete implementation of this pattern.

## Shared Utilities

Test helpers should live in `tests/helpers/`. Currently the pixel sampling function is duplicated across test files. Candidates for extraction:

| Utility | Description |
|---------|-------------|
| `sampleCanvasScreenshot(page)` | Screenshot a `#canvas` element and analyze pixel brightness |
| `runBlackoutScenario(page, options)` | Full blackout detection flow (navigate, inject settings, sample, capture logs) |
| `captureConsoleLogs(page, prefixes)` | Set up filtered console log capture for given `[prefix]` tags |

## Writing New Tests

1. **Check existing tests first.** Read the files in `tests/` to understand established patterns before writing new ones.
2. **Use the pixel sampling pattern** for any test that needs to verify visual rendering.
3. **Prefer stable selectors.** All scenes use `id="canvas"` for the main canvas element.
4. **Use deterministic assertions where possible.** When testing nondeterministic output (random walks, drift cameras), use ratio-based thresholds and document why the threshold was chosen:
   ```javascript
   // Allow up to 30% of samples to lose content (camera may briefly
   // look away from line), but if >70% lose content, the autocam
   // is clearly failing to track the walker.
   expect(contentLossRatio).toBeLessThan(0.7);
   ```
5. **Always capture and dump debug logs.** Even for passing tests, the log output is valuable for future debugging.
6. **Document timing constants.** Explain why you chose specific values for `AUTOCAM_TIMEOUT_SEC`, `SAMPLE_INTERVAL_MS`, `TOTAL_OBSERVATION_SEC`, etc.
