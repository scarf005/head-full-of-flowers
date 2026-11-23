shader_type spatial;

#include "wind.gdshaderinc"

// Ground under moving cloud shadows. The texture alpha is 1 on grass, which takes the grass root colour.
uniform sampler2D tiles : filter_linear;
varying vec2 ground;

void vertex() {
	ground = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec4 kind = texture(tiles, UV);
	ALBEDO = mix(kind.rgb, vec3(0.2, 0.47, 0.2), kind.a) * cloud(ground, TIME);
	ROUGHNESS = 1.0;
}
