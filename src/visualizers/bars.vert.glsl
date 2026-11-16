#version 300 es
precision highp float;
uniform float u_spec[64];
uniform float u_pulse;
uniform float u_intensity;
out vec2 v_local;
out float v_index;
out float v_height;
out float v_reflect;

const vec2 CORNERS[6] = vec2[6](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

void main() {
  int id = gl_InstanceID % 64;
  bool reflected = gl_InstanceID >= 64;
  vec2 c = CORNERS[gl_VertexID];
  float n = 64.0;
  float w = 2.0 / n;
  float gap = 0.28;
  float x = -1.0 + (float(id) + gap * 0.5 + c.x * (1.0 - gap)) * w;
  float h = max(0.006, u_spec[id]) * (1.0 + 0.08 * u_pulse * u_intensity);
  float base = -0.55;
  float y = reflected ? base - c.y * h * 0.35 : base + c.y * h * 1.4;
  v_local = c;
  v_index = float(id) / (n - 1.0);
  v_height = h;
  v_reflect = reflected ? 1.0 : 0.0;
  gl_Position = vec4(x * 0.94, y, 0.0, 1.0);
}
