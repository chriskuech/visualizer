# Audio Visualizer

Real-time visualizer for the audio your computer is playing, with tap-to-beat lag calibration.
A static, client-side site hosted at https://chriskuech.github.io/visualizer/.

- Chrome / Edge: system audio through screen share (tick "Share system audio").
- Firefox / Safari: microphone.
- Any browser: drop an audio file on the page for a demo source.
- Denoise (on by default, in the Source menu) gates out steady hiss and hum so the visuals don't jitter.

## Layout

```
src/
  main.ts        composition root: builds every service and injects it
  core/          pure models and math (FFT, features, onsets, lag buffer, calibration, store)
  services/      system integrations (audio capture, analyzer + worklet, renderer, wake lock, settings)
  visualizers/   one spec per visual: a shader plus a features-to-uniforms function
  app/           controller (user intents), views (start, controls, messages, HUD), state, copy
```

`core/` has no DOM or Web Audio imports. Views call only `AppController`; the controller calls
services. Services receive their dependencies through constructors, so tests pass fakes
(see `tests/unit/session.test.ts`).

## Development

```bash
npm install
npm run dev          # http://localhost:5173/visualizer/
npm test             # Vitest unit tests (DSP, onsets, calibration, lag buffer)
npm run test:e2e     # Playwright on Chromium, Firefox, WebKit (npx playwright install first)
npm run lint
npm run build
```

Append `?analysis=main` to the URL to run the phase 1 main-thread `AnalyserNode` pipeline
instead of the AudioWorklet.

Keys: `T` or Space to tap, Left/Right to nudge the lag (Shift for 10 ms), `F` for fullscreen,
`1`–`3` to pick a visual.

Releases also need the [manual system-audio checklist](docs/manual-checklist.md).

## Publishing

Every push to `main` runs [.github/workflows/publish.yml](.github/workflows/publish.yml): lint,
unit tests and the browser tests, then `npm run build`, and commits `dist/` to the `release`
branch. GitHub Pages serves the root of `release`.
