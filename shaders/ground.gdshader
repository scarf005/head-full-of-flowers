shader_type spatial;

#include "wind.gdshaderinc"

// Ground tiles under moving cloud shadows. COLOR.a is 1 on grass tiles, which take the grass root colour.
varying vec2 ground;

void vertex() {
	ground = VERTEX.xz;
}

void fragment() {
	vec3 grass = vec3(0.27, 0.54, 0.23);
	ALBEDO = mix(COLOR.rgb, grass, COLOR.a) * cloud(ground, TIME);
	ROUGHNESS = 1.0;
}
