shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

#include "wind.gdshaderinc"

// Flat pixel shapes that face the camera: shots, discs, rings, sparks and item art. One instance is one shape.
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
		// Shot: z is the width in pixels. Pale core, rim in the instance colour, ink border.
		float half_len = size_px.x * 0.5 - 2.0;
		float rim = teardrop(q, half_len, shape.z * 0.5);
		float core = teardrop(q - vec2(half_len * 0.2, 0.0), half_len * 0.6, shape.z * 0.5 - 1.0);
		color = vec4(rim < 0.0 ? mix(COLOR.rgb, vec3(1.0), 0.85 * step(core, 0.0)) : INK, step(rim, 1.0));
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
	} else {
		// Item art: z is the cell of the atlas, w is 1 for an ink border, 2 for mirrored art, 3 for both.
		// A shape of 48 pixels shows the art at its drawn size, a smaller shape shows smaller art.
		vec2 at = vec2(shape.w > 1.5 ? -q.x : q.x, q.y) * 48.0 / size_px.x;
		vec4 texel = art(at, shape.z);
		float near = art(at + vec2(1.0, 0.0), shape.z).a + art(at - vec2(1.0, 0.0), shape.z).a;
		near += art(at + vec2(0.0, 1.0), shape.z).a + art(at - vec2(0.0, 1.0), shape.z).a;
		float border = step(0.5, mod(shape.w, 2.0)) * step(0.5, near);
		color = texel.a > 0.5 ? vec4(texel.rgb * COLOR.rgb, 1.0) : vec4(INK, border);
	}
	if (color.a < 0.5) {
		discard;
	}
	ALBEDO = flat_color(color.rgb);
	// Alpha puts the shapes after the ink outline pass.
	ALPHA = 1.0;
}
