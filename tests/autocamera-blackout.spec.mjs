import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const SCENE_URL = 'http://localhost:3333/3d/scenes/fractal-dreamscape/';
const AUTOCAM_TIMEOUT_SEC = 5;
const SAMPLE_INTERVAL_MS = 1000;
const TOTAL_OBSERVATION_SEC = 12;

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
    test('fractal-dreamscape should NOT go black when autocamera activates', async ({ page }) => {
        // Collect all console messages for analysis
        const consoleLogs = [];
        page.on('console', (msg) => {
            const text = msg.text();
            consoleLogs.push({ time: Date.now(), type: msg.type(), text });
            // Print autocam/fractal debug logs in real-time
            if (text.includes('[autocam]') || text.includes('[fractal]')) {
                console.log(`  BROWSER: ${text}`);
            }
        });

        // Also capture page errors
        page.on('pageerror', (err) => {
            console.log(`  PAGE ERROR: ${err.message}`);
        });

        // Set localStorage values BEFORE the scene's JS runs.
        // Navigate to a same-origin page first so localStorage is accessible,
        // then set the values and reload.
        console.log(`Navigating to ${SCENE_URL}`);
        console.log(`AutoCamera timeout set to ${AUTOCAM_TIMEOUT_SEC}s`);
        await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });
        await page.evaluate((timeout) => {
            // The settings panel uses keys like "scenes:fractal-dreamscape:KEY"
            localStorage.setItem('scenes:fractal-dreamscape:autoCamEnabled', 'true');
            localStorage.setItem('scenes:fractal-dreamscape:autoCamTimeout', JSON.stringify(timeout));
        }, AUTOCAM_TIMEOUT_SEC);
        // Reload so the scene picks up our localStorage values on init
        await page.reload({ waitUntil: 'domcontentloaded' });

        // Wait for WebGL to initialize and first frame to render
        await page.waitForTimeout(2000);

        // Verify the scene is rendering (not black from the start)
        const initialSample = await sampleCanvasScreenshot(page);
        console.log(`[t=0s] Initial sample: avg=${initialSample.avgBrightness} max=${initialSample.maxBrightness} blackRatio=${initialSample.blackRatio} ${initialSample.isBlack ? 'BLACK' : 'OK'}`);

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

        // Dump all autocam/fractal console logs
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

        // The assertion: scene should NOT go black at any point after rendering starts
        // Allow the very first 1s of samples to be potentially black (WebGL init),
        // but after that, no blackouts should occur.
        const samplesAfterInit = samples.filter((s) => s.elapsedSec >= 1);
        const blackoutsAfterInit = samplesAfterInit.filter((s) => s.isBlack);

        expect(
            blackoutsAfterInit.length,
            `Scene went black in ${blackoutsAfterInit.length} out of ${samplesAfterInit.length} samples after init. ` +
            `First blackout at t=${blackoutsAfterInit[0]?.elapsedSec}s. ` +
            `AutoCamera timeout was ${AUTOCAM_TIMEOUT_SEC}s.`
        ).toBe(0);
    });
});
