shader_type spatial;
render_mode cull_disabled;

// One flower. INSTANCE_CUSTOM.x is the match time at which it blooms, .y is a random phase.
global uniform float match_time;

void vertex() {
	float t = clamp((match_time - INSTANCE_CUSTOM.x) / 0.18, 0.0, 1.0);
	VERTEX *= t * (1.0 + 0.5 * sin(t * PI));
	VERTEX.x += sin(TIME * 1.7 + INSTANCE_CUSTOM.y * TAU) * 0.6 * VERTEX.y;
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 1.0;
}
