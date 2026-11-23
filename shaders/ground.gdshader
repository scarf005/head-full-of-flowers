shader_type spatial;

#include "wind.gdshaderinc"

// Ground tiles under moving cloud shadows. COLOR.a is 1 on grass tiles, which take the painted meadow colour
// and small clusters of wild flower dots. Other tiles keep their vertex colour.
varying vec2 ground;

void vertex() {
	ground = VERTEX.xz;
}

void fragment() {
	vec3 grass = meadow(ground, TIME);
	vec2 cell = floor(ground * 4.0);
	float patch_amount = value_noise(ground * 0.23 + 31.0);
	float dot_here = step(0.72, patch_amount) * step(0.86, hash(cell));
	vec3 petal = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.62, 0.25), step(0.5, hash(cell + 3.0)));
	grass = mix(grass, petal, dot_here * step(length(fract(ground * 4.0) - 0.5), 0.36));
	ALBEDO = mix(COLOR.rgb, grass, COLOR.a) * cloud(ground, TIME);
	ROUGHNESS = 1.0;
}
