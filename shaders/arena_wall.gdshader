shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

// Arena border: a solid line on the ground.
uniform vec3 tint : source_color = vec3(0.95, 0.22, 0.25);

void fragment() {
	ALBEDO = tint;
	ALPHA = step(0.8, UV.y);
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
