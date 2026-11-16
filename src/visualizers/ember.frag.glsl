#version 300 es
precision highp float;
// Ember: for sleeping. Deep red only (blue is exactly 0), dim, slow, no flashes.
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_drift;  // slow time, nudged a little faster by loudness
uniform float u_time;   // wall-clock seconds, for the very slow wander
uniform float u_level;  // loudness, smoothed over seconds, 0..1
uniform float u_low;    // bass, smoothed over seconds
uniform float u_mid;    // mids, smoothed over seconds
uniform float u_intensity;
out vec4 outColor;

// Ember palette: R dominant, a touch of G for warmth, never B.
const vec3 EMBER = vec3(1.0, 0.13, 0.0);
const vec3 COAL = vec3(0.22, 0.015, 0.0);
const float MAX_BRIGHTNESS = 0.42;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = u_drift;
  // Very slow wander (cycles of ~15-25 min) so no area of an OLED stays lit for hours.
  float band = 0.09 * sin(u_time * 0.0042) + 0.04 * sin(u_time * 0.0071 + 1.3);
  float bedX = 0.5 + 0.28 * sin(u_time * 0.0053 + 0.7);

  // Five soft ribbons in the lower half, each undulating at its own slow pace.
  float glow = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float freq = 1.4 + fi * 0.55;
    float amp = (0.035 + 0.05 * u_low) * (1.0 - fi * 0.12);
    float y = 0.2 + band + fi * 0.065
      + amp * sin(uv.x * freq * 3.14159 + t * (0.10 + 0.035 * fi) + fi * 1.9)
      + 0.018 * sin(uv.x * 5.3 - t * (0.07 + 0.02 * fi) + fi * 4.1);
    float d = uv.y - y;
    float width = 0.0016 + 0.0028 * u_mid + 0.0008 * fi;
    glow += exp(-(d * d) / width) * (0.55 - 0.08 * fi);
  }

  // A faint coal bed glowing from the bottom centre.
  float bed = smoothstep(0.85, 0.0, length((uv - vec2(bedX, -0.05)) * vec2(0.9, 1.6)));

  float brightness = (0.16 + 0.26 * u_level) * mix(0.6, 1.0, u_intensity);
  vec3 col = EMBER * glow * brightness + COAL * bed * (0.35 + 0.4 * u_level);
  col = min(col, vec3(MAX_BRIGHTNESS));

  // Dither so the dark gradients do not band on TVs; kept off the blue channel.
  float n = (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  col.rg = max(col.rg + n, 0.0);
  outColor = vec4(col.r, col.g, 0.0, 1.0);
}
