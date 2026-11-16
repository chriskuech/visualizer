#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_flow; // time that runs faster when louder
uniform float u_rms;
uniform float u_bright; // 0..1, normalised spectral centroid
uniform float u_pulse;
uniform float u_bass;
uniform float u_intensity;
out vec4 outColor;

// Deep blue -> violet -> warm highlights.
vec3 palette(float t) {
  return vec3(0.45, 0.35, 0.55) + vec3(0.45, 0.35, 0.45) * cos(6.28318 * (vec3(1.0, 0.9, 0.6) * t + vec3(0.55, 0.65, 0.85)));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_flow;
  vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t * 0.11)), fbm(p * 1.6 + vec2(5.2, -t * 0.09)));
  float warp = 1.2 + 2.2 * u_bass * u_intensity;
  float n = fbm(p * 1.8 + warp * q + vec2(t * 0.05, 0.0));
  vec3 col = palette(n * 0.9 + 0.35 + 0.45 * u_bright);
  float level = 0.45 + 0.6 * u_rms * (0.4 + 0.6 * u_intensity) + 0.3 * u_pulse * u_intensity;
  col *= level * (0.35 + 1.1 * n * n);
  col *= smoothstep(1.4, 0.3, length(p));
  outColor = vec4(col, 1.0);
}
