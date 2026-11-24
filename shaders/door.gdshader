shader_type spatial;
render_mode unshaded;

#include "wind.gdshaderinc"

// The leaf of a door as pixel art: boards, a handle near the free end and a light top.
uniform vec3 wood = vec3(0.78, 0.39, 0.24);
// Pixels of a wide face: columns from the hinge and rows up from the floor.
const vec2 FACE = vec2(19.0, 13.0);

varying vec3 local;
varying vec3 facing;

void vertex() {
	local = VERTEX + 0.5;
	facing = NORMAL;
}

void fragment() {
	vec3 color = tone(wood, -1.0);
	if (abs(facing.z) > 0.5) {
		vec2 px = floor(local.xy * FACE);
		bool handle = px.x >= 14.0 && px.x <= 15.0 && px.y >= 5.0 && px.y <= 6.0;
		bool line = mod(px.x, 6.0) == 5.0 || px.y == 0.0 || (px.x >= 14.0 && px.x <= 15.0 && px.y == 4.0);
		color = handle ? vec3(1.0, 0.86, 0.35) : tone(wood, line ? 2.0 : px.y == 12.0 ? -1.0 : 0.0);
	} else if (abs(facing.x) > 0.5) {
		color = tone(wood, 1.0);
	}
	ALBEDO = flat_color(color);
}
