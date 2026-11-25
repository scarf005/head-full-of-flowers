shader_type spatial;
render_mode cull_disabled, depth_draw_always, unshaded;

#include "wind.gdshaderinc"

// One flat flower seen from above: five round petals with a thin dark rim and a yellow centre.
// INSTANCE_CUSTOM.x is the match time at which it blooms. INSTANCE_CUSTOM.y is a number from 0 to 1 of the flower.
// INSTANCE_CUSTOM.z is 1 for a flower on a marsh. INSTANCE_CUSTOM.w is the seconds that it takes to grow.
// Drawn in the transparent pass, so the ink outline pass does not ink the edge of a patch of flowers.

// Places of the units. Near a unit the flowers part: some do not show and the rest are small and dark, so a unit shows
// on flowers of its own colour. The body of a unit shows up to 2 m north of its feet, so the flowers part around the
// line from 0.2 m to 1.8 m north of the feet: all within 1.2 m of the line, none from 2 m.
uniform vec3 pushers[12];
global uniform float match_time;
global uniform float flower_tone;
global uniform float marsh_mark;

varying float sunk;
varying float pressed;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = clamp((match_time - INSTANCE_CUSTOM.x) / INSTANCE_CUSTOM.w, 0.0, 1.0);
	sunk = INSTANCE_CUSTOM.z * marsh_mark;
	pressed = 0.0;
	for (int i = 0; i < 12; i++) {
		vec2 away = root.xz - pushers[i].xz;
		away.y += clamp(-away.y, 0.2, 1.8);
		pressed = max(pressed, 1.0 - smoothstep(1.2, 2.0, length(away)));
	}
	float parted = INSTANCE_CUSTOM.y < pressed * 0.75 ? 0.0 : 1.0 - 0.3 * pressed;
	// Draw a flower on a marsh smaller, as if it sinks in the mud.
	VERTEX *= t * (1.0 + 0.6 * sin(t * PI)) * (1.0 - 0.3 * sunk) * parted;
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
	color = mix(color, color * 0.55 + vec3(0.02, 0.06, 0.05), sunk * 0.6) * (1.0 - 0.6 * pressed);
	ALBEDO = screen(color);
	ALPHA = 1.0;
}
