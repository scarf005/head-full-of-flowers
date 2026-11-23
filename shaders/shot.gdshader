shader_type spatial;
render_mode unshaded;

// Arcade projectile: white core inside a rim of the instance colour. The ink outline pass adds the dark border.
void fragment() {
	float rim = 1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	ALBEDO = mix(vec3(1.6), COLOR.rgb * 1.5, step(0.3, rim));
}
