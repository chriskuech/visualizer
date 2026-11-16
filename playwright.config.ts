import { defineConfig, devices } from '@playwright/test';

const AUDIO = 'tests/e2e/fixtures/clicks.wav';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/visualizer/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/visualizer/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${AUDIO}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Headless Firefox on Linux has no WebGL. In CI it runs headed on a virtual display
        // (xvfb-run) with Mesa software GL instead; see .github/workflows/publish.yml.
        headless: !process.env.FIREFOX_HEADED,
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
            'media.autoplay.default': 0,
            // CI runners have no GPU: allow software WebGL so the app is not "unsupported".
            'webgl.force-enabled': true,
            'webgl.disable-fail-if-major-performance-caveat': true,
          },
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
