shader_type spatial;
render_mode cull_disabled, depth_draw_always, unshaded, world_vertex_coords;

#include "wind.gdshaderinc"

// Grass tufts. UV.y is 0 at the root and 1 at the tip. Drawn in the transparent pass so the ink outline pass,
// which reads the opaque depth, does not ink each blade.
uniform vec3 pushers[12];
uniform vec3 sheen_color : source_color = vec3(0.9, 0.98, 0.62);
global uniform float arena_radius;
global uniform float rot;
global uniform float ground_calm;

varying float wave;
varying float shade;
// Metres from the arena border to the root. More than 0 is outside.
varying float past;
varying vec2 root_at;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float g = gust(root.xz, TIME);
	float h = UV.y * UV.y;
	vec2 bend = WIND_DIR * (0.3 + g * 1.1) + vec2(sin(TIME * 4.0 + root.x * 3.0), cos(TIME * 3.3 + root.z * 3.0)) * 0.05 * g;
	float flat_amount = 0.0;
	for (int i = 0; i < 12; i++) {
		vec2 away = root.xz - pushers[i].xz;
		float near = 1.0 - smoothstep(0.2, 1.1, length(away));
		bend += normalize(away + vec2(0.0001)) * near * 0.7;
		flat_amount = max(flat_amount, near);
	}
	past = length(root.xz) - arena_radius;
	// A dead tuft outside the arena is short and droops.
	float dead = step(0.0, past) * rot;
	bend += normalize(root.xz + vec2(0.0001)) * dead * 0.3;
	vec3 world = VERTEX;
	world.xz += bend * h * (world.y / max(UV.y, 0.01) + 0.2);
	world.y *= (1.0 - 0.45 * g * h - 0.6 * flat_amount * h) * (1.0 - 0.5 * dead);
	VERTEX = world;
	wave = smoothstep(0.3, 0.8, g);
	root_at = root.xz;
	shade = cloud(root.xz, TIME);
}

void fragment() {
	// One colour for each blade, so the field reads as a surface and the gusts read as bands of light.
	// Light a gust less when ground_calm is above 0.
	vec3 light = mix(vec3(0.5, 0.76, 0.3), vec3(0.34, 0.6, 0.26), min(ground_calm, 1.0));
	vec3 blade = mix(vec3(0.2, 0.47, 0.2), light, wave) * mix(0.85, 1.0, UV.y) * COLOR.rgb;
	float sheen = smoothstep(0.75, 1.0, wave) * UV.y * 0.6 * (1.0 - 0.4 * ground_calm);
	vec3 color = calm(mix(blade, sheen_color, sheen) * shade, ground_calm);
	// The same border line and rotten outside as the ground has. A dead tip is a little lighter.
	color = past > 0.0 ? mix(color, rotten(color, root_at) * mix(0.5, 1.6, UV.y), rot) : color;
	ALBEDO = screen(abs(past) < 0.12 ? vec3(0.95, 0.22, 0.25) : color);
	ALPHA = 1.0;
}
