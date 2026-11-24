shader_type spatial;
render_mode unshaded;

#include "wind.gdshaderinc"

// Walls, fences, hedges and window glass as pixel art in flat tones: a light top and a south face with the lines
// of its material. `INSTANCE_CUSTOM.r` is the style of the box, as TerrainView.Style.
const int HOUSE = 1;
const int OFFICE = 2;
const int SHOP = 3;
const int WAREHOUSE = 4;
const int GARAGE = 5;
const int GREENHOUSE = 6;
const int HEDGE = 7;
const int GLASS = 8;
// Pixels of the view for each metre across and for each metre of height.
const vec2 PIXELS = vec2(20.0, 11.4715);

varying vec3 world;
varying float side;
varying float style;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	side = 1.0 - step(0.5, abs(NORMAL.y));
	style = INSTANCE_CUSTOM.r;
}

// True on a line of the material of a south face. `px` counts columns to the east and rows up from the ground.
bool seam(int kind, vec2 px) {
	if (kind == HOUSE) {
		// Boards that lie.
		return mod(px.y, 4.0) == 3.0;
	}
	if (kind == OFFICE) {
		// Panels of 0.5 m.
		return mod(px.x, 10.0) == 0.0;
	}
	if (kind == WAREHOUSE || kind == GARAGE) {
		// Bricks of 8 x 3 pixels, or blocks of 10 x 5 pixels. Each row starts half a brick after the row below.
		vec2 brick = kind == WAREHOUSE ? vec2(8.0, 3.0) : vec2(10.0, 5.0);
		float row = floor(px.y / brick.y);
		return mod(px.y, brick.y) == brick.y - 1.0 || mod(px.x + mod(row, 2.0) * brick.x * 0.5, brick.x) == 0.0;
	}
	// Boards that stand: a shop, a greenhouse frame and a fence.
	return mod(px.x, kind == GREENHOUSE ? 5.0 : 4.0) == 0.0;
}

void fragment() {
	int kind = int(style + 0.5);
	vec2 px = floor(vec2(world.x, world.y) * PIXELS + 0.001);
	float drop = 0.0;
	if (kind == HEDGE) {
		// Leaves of 0.2 m in 3 tones.
		vec2 leaf = floor((world.xz + vec2(world.y * 0.7)) * 5.0);
		drop = side - 1.0 + floor(fract(sin(dot(leaf, vec2(12.9898, 78.233))) * 43758.5453) * 3.0);
	} else if (kind == GLASS) {
		// A pane with 2 glints.
		drop = side > 0.5 && mod(px.x + px.y, 11.0) > 2.0 ? 1.0 : 0.0;
	} else if (side > 0.5) {
		// The 2 rows at the ground are the base of the wall.
		drop = px.y < 2.0 ? 3.0 : seam(kind, px) ? 2.0 : 1.0;
	}
	ALBEDO = flat_color(tone(COLOR.rgb, drop));
}
