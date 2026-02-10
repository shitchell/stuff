import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const SCENE_URL = 'http://localhost:3333/3d/scenes/line-walker/';
const AUTOCAM_TIMEOUT_SEC = 5;
const SAMPLE_INTERVAL_MS = 500;
const TOTAL_OBSERVATION_SEC = 15;

/**
 * Take a screenshot of the canvas element and analyze pixel brightness.
 * Uses element screenshot to avoid WebGL preserveDrawingBuffer issues.
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
            if (r < 10 && g < 10 && b < 10) blackPixels++;
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

/**
 * Helper: Run a single autocam blackout test scenario.
 * Navigates to the scene, sets localStorage config, samples pixels, collects logs,
 * and returns structured results for assertion.
 */
async function runBlackoutScenario(page, { mode, timeoutSec, observeSec, sampleIntervalMs }) {
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

    console.log(`\n========== SCENARIO: mode=${mode} timeout=${timeoutSec}s observe=${observeSec}s ==========`);
    console.log(`Navigating to ${SCENE_URL}`);
    await page.goto(SCENE_URL, { waitUntil: 'domcontentloaded' });

    await page.evaluate(({ timeout, mode }) => {
        localStorage.setItem('scenes:line-walker:autoCamEnabled', 'true');
        localStorage.setItem('scenes:line-walker:autoCamTimeout', JSON.stringify(timeout));
        localStorage.setItem('scenes:line-walker:autoCamMode', JSON.stringify(mode));
    }, { timeout: timeoutSec, mode });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const initialSample = await sampleCanvasScreenshot(page);
    console.log(`[t=0s] Initial: avg=${initialSample.avgBrightness} max=${initialSample.maxBrightness} blackRatio=${initialSample.blackRatio}`);

    const samples = [];
    const startTime = Date.now();
    const totalSamples = Math.ceil((observeSec * 1000) / sampleIntervalMs);

    for (let i = 0; i < totalSamples; i++) {
        await page.waitForTimeout(sampleIntervalMs);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const sample = await sampleCanvasScreenshot(page);
        sample.elapsedSec = parseFloat(elapsed);
        samples.push(sample);

        // Content visibility: maxBrightness > 30 means something besides background is visible
        // Background is 0x0a0a1a = rgb(10, 10, 26) -> max channel brightness ~26/255
        const hasContent = sample.maxBrightness > 30;
        const status = sample.isBlack ? '** BLACK **' : (hasContent ? 'CONTENT' : 'BG-ONLY');
        console.log(
            `[t=${elapsed}s] ${status} | avg=${sample.avgBrightness} max=${sample.maxBrightness} blackRatio=${sample.blackRatio}`
        );
    }

    // Print ALL captured debug logs
    const debugLogs = consoleLogs.filter(
        (l) => l.text.includes('[autocam-debug]') || l.text.includes('[line-walker-debug]') || l.text.includes('[autocam]')
    );
    console.log('\n=== ALL Debug Logs from Browser (chronological) ===');
    if (debugLogs.length > 0) {
        for (const log of debugLogs) {
            console.log(`  [${new Date(log.time).toISOString()}] ${log.text}`);
        }
    } else {
        console.log('  (no debug logs captured)');
    }
    console.log('=== End Debug Logs ===\n');

    // Pixel sample history
    console.log('=== Pixel Sample History ===');
    for (const s of samples) {
        const hasContent = s.maxBrightness > 30;
        const status = s.isBlack ? '** BLACK **' : (hasContent ? 'CONTENT' : 'BG-ONLY');
        console.log(`  t=${s.elapsedSec.toFixed(1)}s ${status} avg=${s.avgBrightness} max=${s.maxBrightness} blackRatio=${s.blackRatio}`);
    }
    console.log('=== End Pixel History ===\n');

    return { samples, debugLogs, consoleLogs, startTime, initialSample };
}

test.describe('Line-walker AutoCamera blackout detection', () => {
    test('line-walker drift mode: scene should remain visible when autocamera activates', async ({ page }) => {
        const { samples } = await runBlackoutScenario(page, {
            mode: 'drift',
            timeoutSec: AUTOCAM_TIMEOUT_SEC,
            observeSec: TOTAL_OBSERVATION_SEC,
            sampleIntervalMs: SAMPLE_INTERVAL_MS,
        });

        // Check for complete blackout (all pixels near-black)
        const samplesAfterInit = samples.filter((s) => s.elapsedSec >= 2);
        const blackoutsAfterInit = samplesAfterInit.filter((s) => s.isBlack);

        expect(
            blackoutsAfterInit.length,
            `[drift] Scene went black in ${blackoutsAfterInit.length}/${samplesAfterInit.length} samples. ` +
            `First at t=${blackoutsAfterInit[0]?.elapsedSec}s.`
        ).toBe(0);

        // Also check for content loss: after autocam activates (>timeoutSec+2s),
        // we should see actual line content (maxBrightness > 30), not just background.
        // The scene background is 0x0a0a1a which has max channel value ~26.
        const samplesAfterAutocam = samples.filter((s) => s.elapsedSec >= AUTOCAM_TIMEOUT_SEC + 2);
        const contentLossSamples = samplesAfterAutocam.filter((s) => s.maxBrightness <= 30);
        const contentLossRatio = samplesAfterAutocam.length > 0 ? contentLossSamples.length / samplesAfterAutocam.length : 0;

        console.log(
            `[drift] Content loss: ${contentLossSamples.length}/${samplesAfterAutocam.length} samples show only background (${(contentLossRatio * 100).toFixed(0)}%)`
        );

        // Allow up to 30% of samples to lose content (camera may briefly look away from line),
        // but if ALL samples lose content, the autocam is clearly failing to track the line.
        expect(
            contentLossRatio,
            `[drift] Camera lost sight of line content in ${(contentLossRatio * 100).toFixed(0)}% of samples ` +
            `after autocam activated. This indicates the camera is not tracking the walker.`
        ).toBeLessThan(0.7);
    });

    test('line-walker orbit mode: scene should remain visible when autocamera activates', async ({ page }) => {
        const { samples } = await runBlackoutScenario(page, {
            mode: 'orbit',
            timeoutSec: AUTOCAM_TIMEOUT_SEC,
            observeSec: TOTAL_OBSERVATION_SEC,
            sampleIntervalMs: SAMPLE_INTERVAL_MS,
        });

        const samplesAfterInit = samples.filter((s) => s.elapsedSec >= 2);
        const blackoutsAfterInit = samplesAfterInit.filter((s) => s.isBlack);

        expect(
            blackoutsAfterInit.length,
            `[orbit] Scene went black in ${blackoutsAfterInit.length}/${samplesAfterInit.length} samples. ` +
            `First at t=${blackoutsAfterInit[0]?.elapsedSec}s.`
        ).toBe(0);

        const samplesAfterAutocam = samples.filter((s) => s.elapsedSec >= AUTOCAM_TIMEOUT_SEC + 2);
        const contentLossSamples = samplesAfterAutocam.filter((s) => s.maxBrightness <= 30);
        const contentLossRatio = samplesAfterAutocam.length > 0 ? contentLossSamples.length / samplesAfterAutocam.length : 0;

        console.log(
            `[orbit] Content loss: ${contentLossSamples.length}/${samplesAfterAutocam.length} samples show only background (${(contentLossRatio * 100).toFixed(0)}%)`
        );

        expect(
            contentLossRatio,
            `[orbit] Camera lost sight of line content in ${(contentLossRatio * 100).toFixed(0)}% of samples ` +
            `after autocam activated. This indicates the camera is not tracking the walker.`
        ).toBeLessThan(0.7);
    });

    test('line-walker follow mode: scene should remain visible when autocamera activates', async ({ page }) => {
        const { samples } = await runBlackoutScenario(page, {
            mode: 'follow',
            timeoutSec: AUTOCAM_TIMEOUT_SEC,
            observeSec: TOTAL_OBSERVATION_SEC,
            sampleIntervalMs: SAMPLE_INTERVAL_MS,
        });

        const samplesAfterInit = samples.filter((s) => s.elapsedSec >= 2);
        const blackoutsAfterInit = samplesAfterInit.filter((s) => s.isBlack);

        expect(
            blackoutsAfterInit.length,
            `[follow] Scene went black in ${blackoutsAfterInit.length}/${samplesAfterInit.length} samples. ` +
            `First at t=${blackoutsAfterInit[0]?.elapsedSec}s.`
        ).toBe(0);

        const samplesAfterAutocam = samples.filter((s) => s.elapsedSec >= AUTOCAM_TIMEOUT_SEC + 2);
        const contentLossSamples = samplesAfterAutocam.filter((s) => s.maxBrightness <= 30);
        const contentLossRatio = samplesAfterAutocam.length > 0 ? contentLossSamples.length / samplesAfterAutocam.length : 0;

        console.log(
            `[follow] Content loss: ${contentLossSamples.length}/${samplesAfterAutocam.length} samples show only background (${(contentLossRatio * 100).toFixed(0)}%)`
        );

        expect(
            contentLossRatio,
            `[follow] Camera lost sight of line content in ${(contentLossRatio * 100).toFixed(0)}% of samples ` +
            `after autocam activated. This indicates the camera is not tracking the walker.`
        ).toBeLessThan(0.7);
    });
});
