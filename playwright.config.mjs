import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 120_000,
    retries: 3,
    use: {
        browserName: 'chromium',
        headless: true,
        viewport: { width: 800, height: 600 },
        // Allow WebGL to work in headless mode
        launchOptions: {
            args: [
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-webgl',
            ],
        },
    },
    webServer: {
        command: 'npx serve docs/ -l 3333 --no-clipboard',
        port: 3333,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
});
