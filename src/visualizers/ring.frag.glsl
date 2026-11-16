#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_spec[64];
uniform float u_bands[8];
uniform float u_pulse;
uniform float u_time;
uniform float u_intensity;
out vec4 outColor;

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

float spec(float u) {
  float fi = clamp(u, 0.0, 1.0) * 63.0;
  int i0 = int(floor(fi));
  int i1 = min(i0 + 1, 63);
  return mix(u_spec[i0], u_spec[i1], fract(fi));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float r = length(p);
  float a = atan(p.y, p.x) + u_time * 0.05 * u_intensity;
  // Mirror so low frequencies sit at the bottom and the ring is symmetric.
  float u = abs(mod(a + 1.5708, 6.28318) - 3.14159) / 3.14159;
  float s = spec(1.0 - u);
  float bass = 0.5 * (u_bands[0] + u_bands[1]);
  float mids = 0.33 * (u_bands[3] + u_bands[4] + u_bands[5]);
  float base = 0.2 + 0.05 * bass * u_intensity + 0.025 * u_pulse;
  float outer = base + 0.2 * s * (0.5 + 0.5 * u_intensity);
  float d = abs(r - outer);
  float line = smoothstep(0.006, 0.0, d);
  float glow = 0.006 / (d + 0.006) * 0.45;
  float fill = smoothstep(base - 0.004, base, r) * smoothstep(outer + 0.004, outer, r) * 0.28;
  vec3 col = palette(0.6 + 0.35 * u + 0.2 * mids);
  float core = smoothstep(base, 0.0, r) * (0.05 + 0.22 * u_pulse * u_intensity + 0.08 * bass);
  vec3 coreCol = palette(0.9 + 0.1 * bass);
  float inner = smoothstep(base + 0.003, base, r) * smoothstep(base - 0.006, base - 0.002, r) * 0.5;
  vec3 c = col * (line + glow + fill) + coreCol * core + vec3(inner);
  float vignette = smoothstep(1.2, 0.2, r);
  outColor = vec4(c * vignette, 1.0);
}
