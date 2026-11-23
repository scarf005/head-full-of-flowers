shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

// Arena border: a solid line on the ground under a row of rising dashes.
uniform vec3 tint : source_color = vec3(0.95, 0.22, 0.25);

void fragment() {
	float column = floor(UV.x * 240.0);
	float rise = fract(sin(column * 12.9898) * 43758.5453 - TIME * 0.6);
	float dash = step(0.5, fract(UV.x * 240.0)) * step(abs(1.0 - UV.y - rise * 0.9), 0.08);
	ALBEDO = tint;
	ALPHA = max(step(0.8, UV.y), dash);
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
