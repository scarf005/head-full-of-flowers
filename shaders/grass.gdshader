shader_type spatial;
render_mode cull_disabled, depth_draw_always;

#include "wind.gdshaderinc"

// Grass tufts. UV.y is 0 at the root and 1 at the tip. Drawn in the transparent pass so the ink outline pass,
// which reads the opaque depth, does not ink each blade.
uniform vec3 pushers[12];
uniform vec3 sheen_color : source_color = vec3(0.9, 0.98, 0.62);

varying float sheen;
varying float shade;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float g = gust(root.xz, TIME);
	float h = UV.y * UV.y;
	vec2 bend = WIND_DIR * (0.12 + g * 0.55) + vec2(sin(TIME * 4.0 + root.x * 3.0), cos(TIME * 3.3 + root.z * 3.0)) * 0.05 * g;
	float flat_amount = 0.0;
	for (int i = 0; i < 12; i++) {
		vec2 away = root.xz - pushers[i].xz;
		float near = 1.0 - smoothstep(0.2, 1.1, length(away));
		bend += normalize(away + vec2(0.0001)) * near * 0.7;
		flat_amount = max(flat_amount, near);
	}
	vec3 world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world.xz += bend * h * (world.y / max(UV.y, 0.01) + 0.2);
	world.y *= 1.0 - 0.35 * g * h - 0.6 * flat_amount * h;
	VERTEX = (inverse(MODEL_MATRIX) * vec4(world, 1.0)).xyz;
	NORMAL = (inverse(MODEL_MATRIX) * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
	sheen = smoothstep(0.5, 0.85, g) * (0.35 + 0.65 * UV.y);
	shade = cloud(root.xz, TIME);
}

void fragment() {
	vec3 blade = COLOR.rgb * mix(0.6, 1.25, UV.y);
	ALBEDO = mix(blade, sheen_color, sheen * 0.8) * shade;
	ROUGHNESS = 1.0;
	ALPHA = 1.0;
}
