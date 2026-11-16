# Manual system-audio checklist

Real system-audio capture needs a person at the share picker, so run this per OS before a release.
Use https://chriskuech.github.io/visualizer/ (or `npm run preview`) with music playing.

| Step                                                                         | macOS (Chrome 141+, macOS 14.2+) | Windows (Chrome/Edge) | Linux (Chromium) |
| ---------------------------------------------------------------------------- | -------------------------------- | --------------------- | ---------------- |
| Start shows "System audio (screen share)" and the setup hint                 |                                  |                       |                  |
| Picker: Entire Screen + "Share system audio" ticked → meter moves            |                                  |                       |                  |
| Picker with audio unticked → "No audio was shared" with Retry and microphone |                                  |                       |                  |
| Stop sharing from the browser bar → "Capture stopped."                       |                                  |                       |                  |
| Mute system audio for 5 s → silence hint appears, clears when sound returns  |                                  |                       |                  |
| Tab-only share captures that tab's audio                                     |                                  |                       |                  |
| Tap calibration on a steady track reaches ok and the beat dot lines up       |                                  |                       |                  |
| Fullscreen keeps the screen on 2 h; after Esc the screen and Mac sleep again |                                  |                       |                  |
| Fullscreen via F, button and double-click; Esc keeps the button state right  |                                  |                       |                  |

Record the Linux result here (currently unverified, assumed tab audio only).

Firefox and Safari: repeat the microphone rows (meter, calibration result near 0 ms, wake lock,
fullscreen). In Safari, check the dev-build console for any processing flag still on.
