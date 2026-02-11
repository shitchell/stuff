import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const SCENE_URL = 'http://localhost:3333/3d/scenes/fractal-dreamscape/';
// AUTOCAM_TIMEOUT_SEC: Inactivity timeout before autocam activates.
const AUTOCAM_TIMEOUT_SEC = 5;
// SAMPLE_INTERVAL_MS: Reduced from 1000 to 2000 to limit the number of
// SwiftShader screenshots (each takes ~25s when the shader renders).
const SAMPLE_INTERVAL_MS = 2000;
// TOTAL_OBSERVATION_SEC: Reduced from 12 to 4 to stay well within the timeout.
// This gives 2 samples in the observation window -- sufficient to confirm
// the scene renders visible content after autocam activates.
const TOTAL_OBSERVATION_SEC = 4;

/**
 * Take a screenshot of the canvas element and analyze pixel brightness.
 * This avoids WebGL preserveDrawingBuffer issues.
 */
async function sampleCanvasScreenshot(page) {
    const canvas = page.locator('#canvas');
    const screenshot = await canvas.screenshot({ type: 'png' });
    const png = PNG.sync.read(screenshot);
    const { width, height, data } = png;

    // Sample a grid of pixels for performance
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

    const avgBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 0;
    const blackRatio = sampleCount > 0 ? blackPixels / sampleCount : 1;

    return {
        avgBrightness: Math.round(avgBrightness * 100) / 100,
        maxBrightness,
        blackRatio: Math.round(blackRatio * 1000) / 1000,
        sampleCount,
        width,
        height,
        isBlack: blackRatio > 0.95,
    };
}

test.describe('AutoCamera blackout detection', () => {
    // ========================================================================
    // Success Test
    // ========================================================================
    test('fractal-dreamscape should NOT go black when autocamera activates', async ({ page }) => {
        // 5-minute timeout to accommodate SwiftShader's slow shader rendering
        // (~25s per screenshot when the shader actually renders). With the fix
        // applied, the shader renders and screenshots are slow. Without the fix,
        // the scene is black and screenshots are fast. OBS-017, OBS-022.
        test.setTimeout(300_000);

        // Collect all console messages for analysis
        const consoleLogs = [];
        page.on('console', (msg) => {
            const text = msg.text();
            consoleLogs.push({ time: Date.now(), type: msg.type(), text });
            if (text.includes('[autocam]') || text.includes('[fractal]')) {
                console.log(`  BROWSER: ${text}`);
            }
        });
        page.on('pageerror', (err) => {
            console.log(`  PAGE ERROR: ${err.message}`);
        });

        console.log(`Navigating to ${SCENE_URL}`);
        console.log(`AutoCamera timeout set to ${AUTOCAM_TIMEOUT_SEC}s`);
        await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });

        // Set localStorage: enable autocam, set timeout, and CRITICALLY set mode
        // to 'orbit'. OBS-012: default mode is 'static' which masks the bug
        // (camera never moves in static mode).
        await page.evaluate((timeout) => {
            localStorage.setItem('scenes:fractal-dreamscape:autoCamEnabled', 'true');
            localStorage.setItem('scenes:fractal-dreamscape:autoCamTimeout', JSON.stringify(timeout));
            localStorage.setItem('scenes:fractal-dreamscape:autoCamMode', JSON.stringify('orbit'));
        }, AUTOCAM_TIMEOUT_SEC);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Verify the scene is rendering (not black from the start)
        const initialSample = await sampleCanvasScreenshot(page);
        console.log(
            `[t=0s] Initial sample: avg=${initialSample.avgBrightness} max=${initialSample.maxBrightness} ` +
            `blackRatio=${initialSample.blackRatio} ${initialSample.isBlack ? 'BLACK' : 'OK'}`
        );

        // Track samples over time
        const samples = [];
        const startTime = Date.now();
        const totalSamples = Math.ceil((TOTAL_OBSERVATION_SEC * 1000) / SAMPLE_INTERVAL_MS);

        for (let i = 0; i < totalSamples; i++) {
            await page.waitForTimeout(SAMPLE_INTERVAL_MS);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const sample = await sampleCanvasScreenshot(page);
            sample.elapsedSec = parseFloat(elapsed);
            samples.push(sample);

            const status = sample.isBlack ? 'BLACK' : 'OK';
            console.log(
                `[t=${elapsed}s] ${status} | avg=${sample.avgBrightness} max=${sample.maxBrightness} blackRatio=${sample.blackRatio}`
            );
        }

        // Dump debug logs
        const debugLogs = consoleLogs.filter(
            (l) => l.text.includes('[autocam]') || l.text.includes('[fractal]')
        );
        if (debugLogs.length > 0) {
            console.log('\n--- Debug logs from browser ---');
            for (const log of debugLogs) {
                console.log(`  ${log.text}`);
            }
            console.log('--- End debug logs ---\n');
        }

        // Find blackout events
        const blackoutSamples = samples.filter((s) => s.isBlack);
        const nonBlackSamples = samples.filter((s) => !s.isBlack);

        console.log(
            `\nResults: ${blackoutSamples.length} black samples, ${nonBlackSamples.length} non-black samples out of ${samples.length} total`
        );

        if (blackoutSamples.length > 0) {
            const firstBlackout = blackoutSamples[0];
            console.log(
                `BLACKOUT DETECTED at t=${firstBlackout.elapsedSec}s (autocam timeout was ${AUTOCAM_TIMEOUT_SEC}s)`
            );
        }

        // Assertion: scene should NOT go black after init.
        // Allow the very first 1s of samples to be potentially black (WebGL init).
        const samplesAfterInit = samples.filter((s) => s.elapsedSec >= 1);
        const blackoutsAfterInit = samplesAfterInit.filter((s) => s.isBlack);

        expect(
            blackoutsAfterInit.length,
            `BUG-AUTOCAM-BLACKOUT: Scene went black in ${blackoutsAfterInit.length} out of ` +
            `${samplesAfterInit.length} samples after init. ` +
            `First blackout at t=${blackoutsAfterInit[0]?.elapsedSec}s. ` +
            `AutoCamera timeout was ${AUTOCAM_TIMEOUT_SEC}s.`
        ).toBe(0);
    });

    // ========================================================================
    // Bug Detection Test
    // ========================================================================
    test('BUG-AUTOCAM-BLACKOUT: fractal-dreamscape camera should not move outside frustum', async ({ page }) => {
        // 5-minute timeout for SwiftShader shader rendering speed.
        test.setTimeout(300_000);

        const consoleLogs = [];
        page.on('console', (msg) => {
            const text = msg.text();
            consoleLogs.push({ time: Date.now(), type: msg.type(), text });
            if (text.includes('[autocam]') || text.includes('[fractal]')) {
                console.log(`  BROWSER: ${text}`);
            }
        });
        page.on('pageerror', (err) => {
            console.log(`  PAGE ERROR: ${err.message}`);
        });

        console.log(`Navigating to ${SCENE_URL}`);
        await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });

        // CRITICALLY set autoCamMode to 'orbit' -- default 'static' masks the bug (OBS-012).
        await page.evaluate((timeout) => {
            localStorage.setItem('scenes:fractal-dreamscape:autoCamEnabled', 'true');
            localStorage.setItem('scenes:fractal-dreamscape:autoCamTimeout', JSON.stringify(timeout));
            localStorage.setItem('scenes:fractal-dreamscape:autoCamMode', JSON.stringify('orbit'));
        }, AUTOCAM_TIMEOUT_SEC);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Verify initial render is OK
        const initialSample = await sampleCanvasScreenshot(page);
        console.log(
            `[t=0s] Initial: avg=${initialSample.avgBrightness} max=${initialSample.maxBrightness} ` +
            `blackRatio=${initialSample.blackRatio} ${initialSample.isBlack ? 'BLACK' : 'OK'}`
        );

        // Wait for autocam to fully activate (timeout + transition + buffer)
        const autocamWait = (AUTOCAM_TIMEOUT_SEC + 5) * 1000;
        console.log(`Waiting ${autocamWait}ms for autocam activation + transition...`);
        await page.waitForTimeout(autocamWait);

        // Sample 3 post-autocam frames
        const POST_AUTOCAM_SAMPLES = 3;
        const postAutocamSamples = [];

        for (let i = 0; i < POST_AUTOCAM_SAMPLES; i++) {
            if (i > 0) await page.waitForTimeout(SAMPLE_INTERVAL_MS);
            const sample = await sampleCanvasScreenshot(page);
            postAutocamSamples.push(sample);
            const status = sample.isBlack ? 'BLACK' : 'OK';
            console.log(
                `[post-autocam ${i + 1}/${POST_AUTOCAM_SAMPLES}] ${status} | ` +
                `avg=${sample.avgBrightness} max=${sample.maxBrightness} blackRatio=${sample.blackRatio}`
            );
        }

        // Dump debug logs
        const debugLogs = consoleLogs.filter(
            (l) => l.text.includes('[autocam]') || l.text.includes('[fractal]')
        );
        if (debugLogs.length > 0) {
            console.log('\n--- Debug logs from browser ---');
            for (const log of debugLogs) {
                console.log(`  ${log.text}`);
            }
            console.log('--- End debug logs ---\n');
        }

        // Bug detection: ALL post-autocam samples should be non-black
        const blackSamples = postAutocamSamples.filter((s) => s.isBlack);

        expect(
            blackSamples.length,
            `BUG-AUTOCAM-BLACKOUT: Camera positioned too far from scene content, causing blackout. ` +
            `Found ${blackSamples.length}/${POST_AUTOCAM_SAMPLES} black samples after AutoCamera activated. ` +
            `The orthographic camera (near=0, far=1) was likely moved outside its frustum range ` +
            `by AutoCamera's orbit/drift positioning (15-30 units from target). ` +
            `The fullscreen quad at z=0 falls outside the [0,1] clipping range.`
        ).toBe(0);
    });
});
