#version 300 es
precision highp float;
in vec2 v_local;
in float v_index;
in float v_height;
in float v_reflect;
uniform float u_time;
out vec4 outColor;

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec3 col = palette(0.55 + v_index * 0.55 + u_time * 0.01);
  float shade = mix(0.45, 1.0, v_local.y) * (0.6 + 0.6 * v_height);
  float alpha = v_reflect > 0.5 ? 0.22 * (1.0 - v_local.y) : 1.0;
  outColor = vec4(col * shade * alpha, alpha);
}
