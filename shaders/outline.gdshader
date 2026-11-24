shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_draw_never;

#include "wind.gdshaderinc"

// Full-screen quad in front of the camera. Draws ink where the depth surface bends or breaks.
uniform sampler2D depth_texture : hint_depth_texture, repeat_disable, filter_nearest;
// The ink of the pixel art of units and props, at a level of the dither pass, so a line is one flat colour.
const vec3 INK = vec3(0.2, 0.14, 0.2);
uniform float threshold = 0.12;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float view_depth(vec2 uv, mat4 inv_projection) {
	float depth = texture(depth_texture, uv).r;
	vec3 ndc = CURRENT_RENDERER == RENDERER_COMPATIBILITY
			? vec3(uv, depth) * 2.0 - 1.0
			: vec3(uv * 2.0 - 1.0, depth);
	vec4 view = inv_projection * vec4(ndc, 1.0);
	return -view.z / view.w;
}

void fragment() {
	vec2 px = 1.0 / VIEWPORT_SIZE;
	float c = view_depth(SCREEN_UV, INV_PROJECTION_MATRIX);
	float l = view_depth(SCREEN_UV - vec2(px.x, 0.0), INV_PROJECTION_MATRIX);
	float r = view_depth(SCREEN_UV + vec2(px.x, 0.0), INV_PROJECTION_MATRIX);
	float u = view_depth(SCREEN_UV - vec2(0.0, px.y), INV_PROJECTION_MATRIX);
	float d = view_depth(SCREEN_UV + vec2(0.0, px.y), INV_PROJECTION_MATRIX);
	// Second difference: zero on a flat tilted surface, large at a crease or a silhouette.
	float bend = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
	ALBEDO = flat_color(INK);
	ALPHA = step(threshold, bend);
}
