shader_type spatial;
render_mode cull_disabled, depth_draw_always;

#include "wind.gdshaderinc"

// One flower on a stem. INSTANCE_CUSTOM.x is the match time at which it blooms, .y is a random phase.
// UV.x is 1 on petals (team colour), 0 on the stem and the centre. UV.y is the brightness.
global uniform float match_time;

varying float tint;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = clamp((match_time - INSTANCE_CUSTOM.x) / 0.22, 0.0, 1.0);
	VERTEX *= t * (1.0 + 0.6 * sin(t * PI));
	float g = gust(root.xz, TIME);
	vec2 sway = WIND_DIR * (0.1 + g * 0.5) + vec2(sin(TIME * 2.3 + INSTANCE_CUSTOM.y * TAU)) * 0.06;
	VERTEX.xz += (inverse(MODEL_MATRIX) * vec4(sway.x, 0.0, sway.y, 0.0)).xz * VERTEX.y * 1.6 * length(MODEL_MATRIX[0].xyz);
	NORMAL = (inverse(MODEL_MATRIX) * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
	tint = mix(0.8, 1.15, fract(INSTANCE_CUSTOM.y * 7.31));
}

void fragment() {
	vec3 plain = mix(vec3(0.2, 0.42, 0.2), vec3(1.0, 0.82, 0.3), step(0.5, UV.y));
	ALBEDO = mix(plain, COLOR.rgb * UV.y * tint, UV.x);
	ROUGHNESS = 1.0;
	ALPHA = 1.0;
}
