shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, shadows_disabled;

// Arena border: a ring of rising bars.
uniform vec3 tint : source_color = vec3(1.0, 0.35, 0.3);

void fragment() {
	float bars = step(0.5, fract(UV.x * 160.0 + TIME * 0.2));
	float fade = pow(1.0 - UV.y, 2.0);
	ALBEDO = tint;
	ALPHA = bars * fade;
}
