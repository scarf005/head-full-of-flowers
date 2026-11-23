shader_type spatial;
render_mode cull_disabled, unshaded;

#include "wind.gdshaderinc"

// One flat flower seen from above: five round petals with an ink rim and a yellow centre.
// INSTANCE_CUSTOM.x is the match time at which it blooms.
global uniform float match_time;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = clamp((match_time - INSTANCE_CUSTOM.x) / 0.22, 0.0, 1.0);
	VERTEX *= t * (1.0 + 0.6 * sin(t * PI));
	vec2 sway = WIND_DIR * (gust(root.xz, TIME) - 0.5) * 0.3;
	VERTEX.xz += (inverse(MODEL_MATRIX) * vec4(sway.x, 0.0, sway.y, 0.0)).xz;
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float slice = TAU / 5.0;
	float a = mod(atan(p.y, p.x) + slice * 0.5, slice) - slice * 0.5;
	float petal = length(length(p) * vec2(cos(a), sin(a)) - vec2(0.5, 0.0)) - 0.42;
	if (petal > 0.0) {
		discard;
	}
	vec3 color = mix(COLOR.rgb, COLOR.rgb * 0.3, step(-0.1, petal));
	ALBEDO = mix(color, vec3(1.0, 0.82, 0.3), step(length(p), 0.2));
}
