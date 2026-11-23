shader_type spatial;

#include "wind.gdshaderinc"

// Ground tiles: vertex colour under moving cloud shadows.
varying vec2 ground;

void vertex() {
	ground = VERTEX.xz;
}

void fragment() {
	ALBEDO = COLOR.rgb * cloud(ground, TIME);
	ROUGHNESS = 1.0;
}
