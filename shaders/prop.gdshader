shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

#include "wind.gdshaderinc"

// Pixel art of a prop from the atlas of PropArt.
uniform sampler2D atlas : filter_nearest, repeat_disable;

void vertex() {
	vec4 at = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	// A small step toward the camera in depth: the floor under the art does not cut it, and a wall or tall grass
	// to the south still covers it.
	at.z += 0.25;
	POSITION = PROJECTION_MATRIX * at;
}

void fragment() {
	vec4 texel = texture(atlas, UV);
	if (texel.a < 0.5) {
		discard;
	}
	ALBEDO = flat_color(texel.rgb);
	// Alpha puts the art after the ink outline pass.
	ALPHA = 1.0;
}
