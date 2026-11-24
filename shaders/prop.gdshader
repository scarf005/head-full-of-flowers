shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

#include "wind.gdshaderinc"

// Pixel art of a prop from the atlas of PropArt.
uniform sampler2D atlas : filter_nearest, repeat_disable;
global uniform float arena_radius;
global uniform float rot;

varying vec3 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
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
	// Outside the arena the prop rots.
	vec3 color = length(world.xz) > arena_radius ? mix(texel.rgb, rotten(texel.rgb, world.xz + world.y), rot) : texel.rgb;
	ALBEDO = flat_color(color);
	// Alpha puts the art after the ink outline pass.
	ALPHA = 1.0;
}
