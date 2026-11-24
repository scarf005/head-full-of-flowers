shader_type spatial;
render_mode cull_disabled, depth_draw_always, unshaded;

#include "wind.gdshaderinc"

// One flat flower seen from above: five round petals with a thin dark rim and a yellow centre.
// INSTANCE_CUSTOM.x is the match time at which it blooms. INSTANCE_CUSTOM.z is 1 for a flower on a marsh.
// Drawn in the transparent pass, so the ink outline pass does not ink the edge of a patch of flowers.
global uniform float match_time;
global uniform float flower_tone;
global uniform float marsh_mark;

varying float sunk;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = clamp((match_time - INSTANCE_CUSTOM.x) / 0.22, 0.0, 1.0);
	sunk = INSTANCE_CUSTOM.z * marsh_mark;
	// Draw a flower on a marsh smaller, as if it sinks in the mud.
	VERTEX *= t * (1.0 + 0.6 * sin(t * PI)) * (1.0 - 0.3 * sunk);
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
	// Skip every second pixel of a sunk flower, so the marsh shows through it.
	vec2 px = floor(FRAGCOORD.xy);
	if (fract(px.x * 0.5 + px.y * px.y * 0.75) < sunk * 0.5) {
		discard;
	}
	vec3 color = mix(COLOR.rgb, COLOR.rgb * 0.45, step(-0.07, petal));
	color = mix(color, vec3(1.0, 0.82, 0.3), step(length(p), 0.2)) * flower_tone;
	color = mix(color, color * 0.55 + vec3(0.02, 0.06, 0.05), sunk * 0.6);
	ALBEDO = screen(color);
	ALPHA = 1.0;
}
