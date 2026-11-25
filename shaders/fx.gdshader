shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

#include "wind.gdshaderinc"
#include "dither.gdshaderinc"

// Flat pixel shapes that face the camera: shots, discs, rings, sparks, item art and blasts. One instance is one
// shape.
// The instance scale is the size in view pixels / 20. INSTANCE_CUSTOM: x shape, y turn in radians, z and w per shape.
const float PX_PER_M = 20.0;
const vec3 INK = vec3(0.2, 0.14, 0.2);
const vec2 CELL = vec2(36.0, 24.0);

uniform sampler2D atlas : filter_nearest, repeat_disable;
uniform float cells = 1.0;
// Metres away from the camera for each metre of the shape above its middle: x above the middle, y below it.
uniform vec2 lie = vec2(0.0);

varying flat vec4 shape;
varying flat vec2 size_px;

void vertex() {
	shape = INSTANCE_CUSTOM;
	size_px = vec2(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz)) * PX_PER_M;
	vec4 centre = MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0);
	// On the pixel grid of the view, and toward the camera in depth so grass in front does not cover the shape.
	centre.xy = round(centre.xy * PX_PER_M) / PX_PER_M;
	vec2 corner = VERTEX.xy * size_px / PX_PER_M;
	// A shape that faces the camera goes into the ground below its middle, and the ground cuts a large shape there.
	// So a ground shape lies on the ground, and an air shape leans toward the camera from its top to its bottom.
	centre.z += 0.9 - corner.y * (corner.y > 0.0 ? lie.x : lie.y);
	POSITION = PROJECTION_MATRIX * (centre + vec4(corner, 0.0, 0.0));
}

// Round head at the front and a straight taper to a point at the back. Below 0 inside.
float teardrop(vec2 q, float half_len, float r) {
	float neck = half_len - r;
	return q.x > neck ? length(q - vec2(neck, 0.0)) - r : abs(q.y) - r * (q.x + half_len) / (neck + half_len);
}

// Texel of art cell `cell` at `q` pixels from its centre.
vec4 art(vec2 q, float cell) {
	vec2 uv = vec2(q.x, -q.y) / CELL + 0.5;
	return uv == clamp(uv, 0.0, 1.0) ? texture(atlas, vec2((cell + uv.x) / cells, uv.y)) : vec4(0.0);
}

void fragment() {
	vec2 p = (floor(UV * size_px) + 0.5 - size_px * 0.5) * vec2(1.0, -1.0);
	vec2 q = vec2(cos(shape.y) * p.x + sin(shape.y) * p.y, cos(shape.y) * p.y - sin(shape.y) * p.x);
	vec4 color = vec4(0.0);
	if (shape.x < 0.5) {
		// Shot that glows: z is the width in pixels. Pale core, body in the instance colour, a rim in a deeper tone of
		// it, then dots of the colour that get thin over 3 pixels.
		float half_len = size_px.x * 0.5 - 4.0;
		float rim = teardrop(q, half_len, shape.z * 0.5);
		float core = teardrop(q - vec2(half_len * 0.2, 0.0), half_len * 0.6, shape.z * 0.5 - 1.0);
		float odd = dot(mod(floor(p), 2.0), vec2(1.0));
		float halo = rim < 2.4 ? step(odd, 0.5) + step(1.5, odd) : step(odd, 0.5);
		vec3 body = mix(COLOR.rgb, vec3(1.0), 0.85 * step(core, 0.0));
		vec3 deep = COLOR.rgb * vec3(1.0, 0.62, 0.5);
		color = rim < 0.0 ? vec4(body, 1.0) : rim < 1.0 ? vec4(deep, 1.0) : vec4(COLOR.rgb, halo * step(rim, 4.0));
	} else if (shape.x < 1.5) {
		// Disc: z is the radius of the hole from 0 to 1, w above 0.5 draws every second pixel only.
		float r = length(p / (size_px * 0.5));
		float dots = shape.w > 0.5 ? step(mod(floor(p.x) + floor(p.y), 2.0), 0.5) : 1.0;
		color = vec4(COLOR.rgb, step(r, 1.0) * step(shape.z, r) * dots);
	} else if (shape.x < 2.5) {
		// Spark with 4 points and a white middle.
		float reach = sqrt(abs(q.x)) + sqrt(abs(q.y));
		float edge = sqrt(size_px.x * 0.5);
		color = vec4(mix(COLOR.rgb, vec3(1.0), step(reach, edge * 0.7)), step(reach, edge));
	} else if (shape.x < 3.5) {
		// Item art: z is the cell of the atlas, w is 1 for an ink border, 2 for mirrored art, 3 for both.
		// A shape of 48 pixels shows the art at its drawn size, a smaller shape shows smaller art.
		vec2 at = vec2(shape.w > 1.5 ? -q.x : q.x, q.y) * 48.0 / size_px.x;
		vec4 texel = art(at, shape.z);
		float near = art(at + vec2(1.0, 0.0), shape.z).a + art(at - vec2(1.0, 0.0), shape.z).a;
		near += art(at + vec2(0.0, 1.0), shape.z).a + art(at - vec2(0.0, 1.0), shape.z).a;
		float border = step(0.5, mod(shape.w, 2.0)) * step(0.5, near);
		color = texel.a > 0.5 ? vec4(texel.rgb * COLOR.rgb, 1.0) : vec4(INK, border);
	} else if (shape.x < 4.5) {
		// Blast: a ball with a lumpy edge. y is a seed and z is the age from 0 to 1. The red of the instance colour is
		// the heat at the start: at 1 the ball is fire that cools from white to red and then to smoke, at 0 it is
		// smoke from the start. Old smoke breaks into dots from the edge inward. With w above 0.5 the shape is a glow:
		// dots in the instance colour that get thin toward the edge.
		vec2 u = p / (size_px * 0.5);
		float lump = blot(u * 2.4 + shape.y * 3.1) * 0.7 + blot(u * 5.5 - shape.y * 5.7 + shape.z * 2.0) * 0.3;
		float edge = 0.62 + 0.36 * lump - length(u);
		float grid = bayer8(FRAGCOORD.xy);
		if (shape.w > 0.5) {
			color = vec4(COLOR.rgb, step(grid + 0.02, edge * 1.5));
		} else {
			float heat = COLOR.r * (edge * 2.3 + 0.3) - shape.z * 2.0 + (grid - 0.5) * 0.18;
			float light = u.y + (blot(u * 4.0 + shape.y) - 0.5) * 0.9;
			vec3 smoke = light > 0.45 ? vec3(0.56, 0.52, 0.6) : light > -0.4 ? vec3(0.37, 0.35, 0.4) : vec3(0.18, 0.17, 0.2);
			vec3 fire = heat > 1.2 ? vec3(1.0) : heat > 0.85 ? vec3(1.0, 0.9, 0.5) : vec3(1.0, 0.6, 0.24);
			fire = heat > 0.5 ? fire : heat > 0.2 ? vec3(0.89, 0.33, 0.16) : vec3(0.5, 0.18, 0.15);
			// Smoke has holes from its start, so a unit in it stays in view.
			float gone = smoothstep(0.25, 1.0, shape.z);
			float thin = heat > 0.0 ? 1.0 : step(grid, 0.82 - gone * 0.8);
			color = vec4(heat > 0.0 ? fire : smoke, step(gone * 0.9, edge) * thin);
		}
	}
	if (color.a < 0.5) {
		discard;
	}
	ALBEDO = flat_color(color.rgb);
	// Alpha puts the shapes after the ink outline pass.
	ALPHA = 1.0;
}
