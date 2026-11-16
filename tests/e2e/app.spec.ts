import { expect, type Page, test } from '@playwright/test';

const WAV = 'tests/e2e/fixtures/clicks.wav';

async function startWithFile(page: Page) {
  await page.goto('./');
  await page.locator('#start-source-trigger').click();
  await page.getByRole('option', { name: /Audio file/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await (await chooser).setFiles(WAV);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'running');
}

/** Turns Denoise off before the app loads, so the ring shows the raw input level. */
async function rawMeter(page: Page) {
  await page.addInitScript(() => localStorage.setItem('denoise', 'false'));
}

/** Samples the level ring for `ms`, keeping the controls visible; returns sorted samples. */
async function ringSamples(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(async (duration) => {
    const ring = document.getElementById('level-ring')!;
    const xs: number[] = [];
    const end = performance.now() + duration;
    while (performance.now() < end) {
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      xs.push(Number(ring.style.getPropertyValue('--level') || 0));
      await new Promise((r) => setTimeout(r, 10));
    }
    return xs.sort((a, b) => a - b);
  }, ms);
}

/** Level ring on the source FAB, 0..1. */
async function meterLevel(page: Page): Promise<number> {
  return page
    .locator('#level-ring')
    .evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--level') || 0));
}

test('splash shows the title, a play button and a source select', async ({ page, browserName }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Audio Visualizer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  const trigger = page.locator('#start-source-trigger');
  await expect(trigger).toContainText(browserName === 'chromium' ? 'System audio' : 'Microphone');
  await expect(page.getByRole('listbox')).toBeHidden();
  await trigger.click();
  await expect(page.getByRole('option')).toHaveCount(3);
  await page.getByRole('option', { name: /Audio file/ }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(trigger).toContainText('Audio file');
  // Keyboard: arrows move, Enter picks.
  await trigger.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('System audio');
  await expect(trigger).toBeFocused();
});

test('file source drives the level meter and the panel controls', async ({ page }) => {
  await rawMeter(page);
  await startWithFile(page);
  await page.mouse.move(200, 200);
  await expect(page.locator('#panel')).toHaveClass(/visible/);
  await expect.poll(() => meterLevel(page), { timeout: 10_000 }).toBeGreaterThan(0.1);
  await expect(page.locator('#fab-source')).toHaveAttribute('data-tip', /Audio file/);
});

test('with denoise on, the meter ignores the steady tone but jumps on clicks', async ({ page }) => {
  await startWithFile(page); // the fixture is clicks over a steady 220 Hz tone
  await page.mouse.move(200, 200);
  await page.waitForTimeout(2500); // past the 1.5 s warm-up
  const xs = await ringSamples(page, 3000);
  expect(xs[Math.floor(xs.length / 2)]!).toBeLessThan(0.1); // between clicks: the tone is gone
  expect(xs.at(-1)!).toBeGreaterThan(0.3); // clicks still show
});

test('microphone source starts with fake devices', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit has no fake capture device in Playwright');
  // Fake devices play a steady tone, which Denoise (correctly) removes: meter the raw input.
  await rawMeter(page);
  await page.goto('./');
  await page.locator('#start-source-trigger').click();
  await page.getByRole('option', { name: /Microphone/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'running');
  await page.mouse.move(100, 100);
  await expect.poll(() => meterLevel(page), { timeout: 10_000 }).toBeGreaterThan(0.05);
});

test('lag controls stay in sync, respond to keys and persist', async ({ page }) => {
  await startWithFile(page);
  const number = page.locator('#lag-number');
  const slider = page.locator('#lag-slider');
  await page.mouse.move(300, 200);
  await page.locator('#fab-lag').click();
  await number.fill('120');
  await expect(slider).toHaveValue('120');
  await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('ArrowRight');
  await expect(number).toHaveValue('121');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(number).toHaveValue('111');
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('lag'))).toBe('111');
  await expect(page.locator('#lag-number')).toHaveValue('111');
});

test('number keys switch visualizers', async ({ page }) => {
  await startWithFile(page);
  await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  const checked = page.locator('input[name="visualizer"]:checked');
  await page.keyboard.press('2');
  await expect(checked).toHaveValue('ring');
  await page.keyboard.press('3');
  await expect(checked).toHaveValue('plasma');
  await page.keyboard.press('4');
  await expect(checked).toHaveValue('ember');
  await page.keyboard.press('1');
  await expect(checked).toHaveValue('bars');
});

test('tapping shows live calibration progress', async ({ page }) => {
  await startWithFile(page);
  await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('t');
    await page.waitForTimeout(500);
  }
  await expect(page.locator('#tap-status')).toContainText('3 / 8 taps');
});

test('floating controls hide after idle and become inert', async ({ page }) => {
  await startWithFile(page);
  const panel = page.locator('#panel');
  await page.mouse.move(300, 200);
  await expect(panel).toHaveClass(/visible/);
  await expect(panel).not.toHaveClass(/visible/, { timeout: 6_000 });
  await expect(panel).toHaveAttribute('inert', '');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Shift');
  await expect(panel).toHaveClass(/visible/);
});

test('fullscreen toggle follows the real state', async ({ page }) => {
  await startWithFile(page);
  const enabled = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!enabled, 'Fullscreen not available in this engine');
  const btn = page.locator('#fullscreen');
  await page.mouse.move(300, 200);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.exitFullscreen());
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
});

test('stop toggles to resume, and resume restarts the source', async ({ page }) => {
  await startWithFile(page);
  await page.mouse.move(300, 200);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('#start')).toBeHidden();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'running');
});

test('every FAB is an icon with a tooltip naming its current value', async ({ page }) => {
  await startWithFile(page);
  for (const id of ['fab-source', 'fab-lag', 'fab-visual', 'fab-stop']) {
    const fab = page.locator(`#${id}`);
    await expect(fab.locator('svg')).toHaveCount(1);
    await expect(fab).toHaveAttribute('data-tip', /\S/);
  }
  await expect(page.locator('#fab-source')).toHaveAttribute(
    'data-tip',
    'Source: Audio file (demo)',
  );
  await expect(page.locator('#fab-lag')).toHaveAttribute('data-tip', /^Lag: \d+ ms/);
  await expect(page.locator('#fab-visual')).toHaveAttribute('aria-label', /^Visual: /);
});

test('popovers open from their FAB, pick an option and close with Escape', async ({ page }) => {
  await startWithFile(page);
  await page.mouse.move(300, 200);
  const fab = page.locator('#fab-visual');
  await fab.click();
  await expect(page.locator('#pop-visual')).toBeVisible();
  await expect(fab).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('radio', { name: /Plasma shader/ }).check();
  await expect(fab).toHaveAttribute('data-tip', 'Visual: Plasma shader');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pop-visual')).toBeHidden();
  await expect(fab).toBeFocused();
});

test('lag popover keeps its size while tapping, and Clear resets the lag', async ({ page }) => {
  await startWithFile(page);
  await page.mouse.move(300, 200);
  await page.locator('#fab-lag').click();
  const pop = page.locator('#pop-lag');
  const before = (await pop.boundingBox())!.height;
  await page.getByRole('button', { name: /^Tap/ }).click();
  await expect(page.locator('#tap-status')).toContainText('1 / 8 taps');
  expect((await pop.boundingBox())!.height).toBe(before);
  await page.locator('#lag-number').fill('250');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#lag-number')).toHaveValue('0');
  await expect(page.locator('#lag-slider')).toHaveValue('0');
  await expect(page.locator('#tap-status')).toContainText('Tap at least 8 times');
});

test('denoise is on by default and the switch is remembered', async ({ page }) => {
  await startWithFile(page);
  await page.mouse.move(300, 200);
  await page.locator('#fab-source').click();
  const toggle = page.getByRole('checkbox', { name: /Denoise/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('denoise'))).toBe('false');
  await page.reload();
  await expect(page.locator('#denoise')).not.toBeChecked();
});

test('Ember (sleep) is dim deep red with no blue, and changes smoothly', async ({ page }) => {
  await startWithFile(page);
  await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('4');
  await page.waitForTimeout(3000);
  // Read the drawn frame right after the renderer draws it: a rAF callback registered inside
  // another runs after the renderer's own callback in the next frame.
  const frames = await page.evaluate(async () => {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const read = () =>
      new Promise<{ maxR: number; maxG: number; maxB: number; luma: number }>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const w = gl.drawingBufferWidth;
            const h = gl.drawingBufferHeight;
            const px = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let maxR = 0;
            let maxG = 0;
            let maxB = 0;
            let sum = 0;
            for (let i = 0; i < px.length; i += 4) {
              maxR = Math.max(maxR, px[i]!);
              maxG = Math.max(maxG, px[i + 1]!);
              maxB = Math.max(maxB, px[i + 2]!);
              sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
            }
            resolve({ maxR, maxG, maxB, luma: sum / (w * h) });
          }),
        ),
      );
    const out = [];
    for (let i = 0; i < 20; i++) out.push(await read());
    return out;
  });
  for (const f of frames) {
    expect(f.maxB).toBe(0); // no blue at all
    expect(f.maxR).toBeGreaterThan(20); // something is visible
    expect(f.maxR).toBeLessThanOrEqual(110); // capped: dim
    expect(f.maxG).toBeLessThanOrEqual(f.maxR * 0.2); // red, not orange or yellow
    expect(f.luma).toBeLessThan(12); // a dark screen overall (of 255)
  }
  // Smooth: average brightness barely changes between consecutive frames, clicks included.
  for (let i = 1; i < frames.length; i++)
    expect(Math.abs(frames[i]!.luma - frames[i - 1]!.luma)).toBeLessThan(0.5);
});

/** A WAV of digital silence, built in memory. */
function silentWav(seconds: number): Buffer {
  const sr = 22050;
  const n = sr * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

test('the silence warning shows on other visuals but never over Ember', async ({ page }) => {
  await page.goto('./');
  await page.locator('#start-source-trigger').click();
  await page.getByRole('option', { name: /Audio file/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await (await chooser).setFiles({
    name: 'silence.wav',
    mimeType: 'audio/wav',
    buffer: silentWav(20),
  });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'running');
  await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('1');
  await expect(page.locator('#toast')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('4');
  await expect(page.locator('#toast')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.locator('#toast')).toBeVisible();
});
