import { test, expect } from '@playwright/test';

const SCENE_URL = 'http://localhost:3333/3d/scenes/line-walker/';

// Timing constants (unchanged from Attempt 02)
// AUTOCAM_TIMEOUT_SEC: Reduced from 5 to 2 to shorten test duration.
const AUTOCAM_TIMEOUT_SEC = 2;
// TRANSITION_BUFFER_SEC: Wait this long after autocam timeout for transition to
// complete (2s transition duration + 1s margin).
const TRANSITION_BUFFER_SEC = 3;
// SAMPLE_INTERVAL_MS: Sample camera position every 2 seconds.
const SAMPLE_INTERVAL_MS = 2000;
// TOTAL_OBSERVATION_SEC: 10 seconds of observation after autocam activates (5 samples).
const TOTAL_OBSERVATION_SEC = 10;

// Distance thresholds per mode (unchanged from Attempt 02).
// These assume fix values: orbitRadius=3, followDistance=2, followHeight=1.
const MODE_THRESHOLDS = {
    orbit: {
        // orbit: distance <= orbitRadius * 1.5 = 4.5 (elevation oscillation margin)
        maxMedianDistance: 4.5,
        label: 'orbit',
    },
    drift: {
        // drift: distance <= orbitRadius * 1.2 = 3.6 (drift range 1.5-3 units)
        maxMedianDistance: 3.6,
        label: 'drift',
    },
    follow: {
        // follow: distance <= sqrt(followDistance^2 + followHeight^2) * 1.5
        //       = sqrt(4 + 1) * 1.5 = 3.35
        maxMedianDistance: 3.35,
        label: 'follow',
    },
};

// Bug detection threshold: any sample at or above this distance indicates the
// old buggy defaults are in effect (followDistance=15, orbitRadius=30).
const BUG_DISTANCE_THRESHOLD = 15;

/**
 * Read camera state from the browser context via __testHarness.
 * Returns { distance, cameraPos, walkerTip, autoCamActive, cameraNear } or null
 * if the harness is not available.
 */
async function readCameraState(page) {
    return page.evaluate(() => {
        const h = window.__testHarness;
        if (!h) return null;
        const cam = h.camera;
        const tip = h.walker.tip; // Returns Vector3 clone
        const distance = cam.position.distanceTo(tip);
        return {
            cameraPos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            walkerTip: { x: tip.x, y: tip.y, z: tip.z },
            distance,
            autoCamActive: h.autoCamera.active,
            cameraNear: cam.near,
        };
    });
}

/**
 * Helper: Run a camera distance observation scenario for line-walker.
 * Navigates to the scene, sets localStorage config, waits for autocam to
 * activate and transition to complete, then samples camera distance repeatedly.
 */
async function runCameraDistanceScenario(page, { mode }) {
    const consoleLogs = [];
    page.on('console', (msg) => {
        const text = msg.text();
        consoleLogs.push({ time: Date.now(), type: msg.type(), text });
        if (text.includes('[autocam-debug]') || text.includes('[line-walker-debug]') || text.includes('[autocam]')) {
            console.log(`  BROWSER: ${text}`);
        }
    });
    page.on('pageerror', (err) => {
        console.log(`  PAGE ERROR: ${err.message}`);
    });

    console.log(`\n========== SCENARIO: mode=${mode} timeout=${AUTOCAM_TIMEOUT_SEC}s ==========`);
    console.log(`Navigating to ${SCENE_URL}`);
    await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });

    // Inject localStorage settings before scene init
    await page.evaluate(({ timeout, mode: m }) => {
        localStorage.setItem('scenes:line-walker:autoCamEnabled', 'true');
        localStorage.setItem('scenes:line-walker:autoCamTimeout', JSON.stringify(timeout));
        localStorage.setItem('scenes:line-walker:autoCamMode', JSON.stringify(m));
    }, { timeout: AUTOCAM_TIMEOUT_SEC, mode });

    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for scene to initialize
    await page.waitForTimeout(2000);

    // Check test harness availability
    const initialState = await readCameraState(page);
    const harnessAvailable = initialState !== null;
    console.log(`Test harness available: ${harnessAvailable}`);

    if (harnessAvailable) {
        console.log(`Initial camera distance: ${initialState.distance.toFixed(2)}`);
        console.log(`AutoCamera active: ${initialState.autoCamActive}`);
        console.log(`camera.near: ${initialState.cameraNear}`);
    }

    // Wait for autocam timeout + transition buffer
    const waitMs = (AUTOCAM_TIMEOUT_SEC + TRANSITION_BUFFER_SEC) * 1000;
    console.log(`Waiting ${waitMs}ms for autocam timeout + transition...`);
    await page.waitForTimeout(waitMs);

    // Collect distance samples
    const samples = [];
    const totalSamples = Math.ceil((TOTAL_OBSERVATION_SEC * 1000) / SAMPLE_INTERVAL_MS);
    console.log(`Collecting ${totalSamples} samples over ${TOTAL_OBSERVATION_SEC}s...`);

    for (let i = 0; i < totalSamples; i++) {
        if (i > 0) await page.waitForTimeout(SAMPLE_INTERVAL_MS);
        const state = await readCameraState(page);
        if (state) {
            samples.push(state);
            console.log(
                `  [sample ${i + 1}/${totalSamples}] distance=${state.distance.toFixed(3)} ` +
                `active=${state.autoCamActive} near=${state.cameraNear} ` +
                `cam=(${state.cameraPos.x.toFixed(3)}, ${state.cameraPos.y.toFixed(3)}, ${state.cameraPos.z.toFixed(3)}) ` +
                `tip=(${state.walkerTip.x.toFixed(3)}, ${state.walkerTip.y.toFixed(3)}, ${state.walkerTip.z.toFixed(3)})`
            );
        } else {
            console.log(`  [sample ${i + 1}/${totalSamples}] harness unavailable`);
        }
    }

    // Dump debug logs
    const debugLogs = consoleLogs.filter(
        (l) => l.text.includes('[autocam-debug]') || l.text.includes('[line-walker-debug]') || l.text.includes('[autocam]')
    );
    console.log('\n=== All Debug Logs from Browser (chronological) ===');
    if (debugLogs.length > 0) {
        for (const log of debugLogs) {
            console.log(`  [${new Date(log.time).toISOString()}] ${log.text}`);
        }
    } else {
        console.log('  (no debug logs captured)');
    }
    console.log('=== End Debug Logs ===\n');

    // Distance sample history
    console.log('=== Distance Sample History ===');
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        console.log(
            `  sample ${i + 1}: distance=${s.distance.toFixed(3)} active=${s.autoCamActive}`
        );
    }
    console.log('=== End Distance History ===\n');

    return { samples, harnessAvailable, debugLogs, consoleLogs };
}

/**
 * Compute the median of an array of numbers.
 */
function median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ========================================================================
// Success Tests
// ========================================================================

test.describe('Line-walker AutoCamera blackout detection', () => {
    for (const mode of ['orbit', 'drift', 'follow']) {
        test(`line-walker ${mode}: camera should stay near walker after autocam activates`, async ({ page }) => {
            const { samples, harnessAvailable } = await runCameraDistanceScenario(page, { mode });

            // Assert harness is available
            expect(
                harnessAvailable,
                `BUG-AUTOCAM-BLACKOUT: window.__testHarness is not available. ` +
                `The Developer must expose autoCamera, walker, and camera via ` +
                `window.__testHarness in line-walker/main.js.`
            ).toBe(true);

            // Assert we got distance samples
            expect(
                samples.length,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] No distance samples collected. ` +
                `Expected at least 1 sample.`
            ).toBeGreaterThan(0);

            // Filter to samples where autocam is active
            const activeSamples = samples.filter((s) => s.autoCamActive);
            expect(
                activeSamples.length,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] AutoCamera never became active. ` +
                `Expected at least 1 active sample.`
            ).toBeGreaterThan(0);

            const distances = activeSamples.map((s) => s.distance);
            const medianDist = median(distances);
            const minDist = Math.min(...distances);
            const maxDist = Math.max(...distances);
            const threshold = MODE_THRESHOLDS[mode].maxMedianDistance;

            // Read camera.near from the first sample (or default to 0.1)
            const cameraNear = activeSamples[0].cameraNear ?? 0.1;

            console.log(
                `[${mode}] Active samples: ${activeSamples.length}, ` +
                `median=${medianDist.toFixed(3)}, min=${minDist.toFixed(3)}, ` +
                `max=${maxDist.toFixed(3)}, threshold=${threshold}, cameraNear=${cameraNear}`
            );

            // Assertion 1 (existing): Median distance within expected bounds
            expect(
                medianDist,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] Camera median distance from walker ` +
                `is ${medianDist.toFixed(3)} units, which exceeds the ${threshold} unit ` +
                `threshold. The camera is too far from the walker. Distances: ` +
                `min=${minDist.toFixed(3)}, max=${maxDist.toFixed(3)}.`
            ).toBeLessThanOrEqual(threshold);

            // Assertion 2 (NEW - Attempt 03): No sample below camera.near
            expect(
                minDist,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] Camera distance from walker dropped ` +
                `to ${minDist.toFixed(4)} units, which is below camera.near ` +
                `(${cameraNear}). Geometry within camera.near is clipped by the GPU, ` +
                `causing blackout.`
            ).toBeGreaterThanOrEqual(cameraNear);
        });
    }

    // ========================================================================
    // Bug Detection Tests
    // ========================================================================

    for (const mode of ['orbit', 'drift', 'follow']) {
        test(`BUG-AUTOCAM-BLACKOUT: ${mode} should not position camera too far from walker`, async ({ page }) => {
            const { samples, harnessAvailable } = await runCameraDistanceScenario(page, { mode });

            // Assert harness is available
            expect(
                harnessAvailable,
                `BUG-AUTOCAM-BLACKOUT: window.__testHarness is not available. ` +
                `The Developer must expose autoCamera, walker, and camera via ` +
                `window.__testHarness in line-walker/main.js.`
            ).toBe(true);

            // Assert we got distance samples
            expect(
                samples.length,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] No distance samples collected.`
            ).toBeGreaterThan(0);

            // Filter to samples where autocam is active
            const activeSamples = samples.filter((s) => s.autoCamActive);
            expect(
                activeSamples.length,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] AutoCamera never became active.`
            ).toBeGreaterThan(0);

            const distances = activeSamples.map((s) => s.distance);
            const minDist = Math.min(...distances);
            const maxDist = Math.max(...distances);

            // Read camera.near from the first sample (or default to 0.1)
            const cameraNear = activeSamples[0].cameraNear ?? 0.1;

            // Bug detection: no sample should be at old buggy distances (>= 15 units)
            const farSamples = activeSamples.filter((s) => s.distance >= BUG_DISTANCE_THRESHOLD);

            console.log(
                `[${mode}] Active samples: ${activeSamples.length}, ` +
                `far samples (>= ${BUG_DISTANCE_THRESHOLD}): ${farSamples.length}, ` +
                `min=${minDist.toFixed(3)}, max=${maxDist.toFixed(3)}, cameraNear=${cameraNear}`
            );

            // Assertion 1 (existing): No samples at old buggy distances
            expect(
                farSamples.length,
                `BUG-AUTOCAM-BLACKOUT: Camera positioned too far from scene content, ` +
                `causing blackout. [${mode}] Found ${farSamples.length}/${activeSamples.length} ` +
                `samples with distance >= ${BUG_DISTANCE_THRESHOLD} units. ` +
                `Max distance: ${maxDist.toFixed(3)} units. Old default orbitRadius was 30, ` +
                `followDistance was 15. The camera must stay closer to the walker to keep ` +
                `thin line geometry visible.`
            ).toBe(0);

            // Assertion 2 (NEW - Attempt 03): No sample below camera.near (near-plane clipping)
            expect(
                minDist,
                `BUG-AUTOCAM-BLACKOUT: [${mode}] Camera position converged too close ` +
                `to target (${minDist.toFixed(4)} units < camera.near=${cameraNear}). ` +
                `Near-plane clipping causes all geometry within camera.near to be invisible.`
            ).toBeGreaterThanOrEqual(cameraNear);
        });
    }
});
