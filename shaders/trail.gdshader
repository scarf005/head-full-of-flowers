shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, blend_mix;

#include "wind.gdshaderinc"
#include "dither.gdshaderinc"

// Streaks and smoke puffs of Trails. One instance is one part, written one time at its start. The shader moves the
// part and fades it by its age, as the trails of the original do.
// Instance basis: x (dir x, dir y, length), y (width, growth, turbulence), z (drift, drag, start time).
// Origin: the head of a streak or the start of a puff. INSTANCE_CUSTOM: x life, y 1 for a puff.
const int DRIFT_STEPS = 6;

// Match time of the drawn frame.
uniform float now = 0.0;

varying vec2 uv;
varying float alpha;
varying float puff;

void vertex() {
	vec3 head = MODEL_MATRIX[3].xyz;
	vec3 a = MODEL_MATRIX[0].xyz;
	vec3 b = MODEL_MATRIX[1].xyz;
	vec3 c = MODEL_MATRIX[2].xyz;
	float life = INSTANCE_CUSTOM.x;
	float age = now - c.z;
	puff = INSTANCE_CUSTOM.y;
	uv = VERTEX.xy * 2.0;
	alpha = 0.0;
	if (age < 0.0 || age >= life) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else if (puff > 0.5) {
		// The puff turns on a swirl, drifts on and slows down, and grows.
		vec2 at = head.xz;
		vec2 dir = a.xy;
		float step_time = age / float(DRIFT_STEPS);
		for (int n = 0; n < DRIFT_STEPS; n++) {
			float t = (float(n) + 0.5) * step_time;
			float swirl = sin((at.x + at.y) * 2.2 + t / life * (9.0 + b.z * 2.6));
			float turn = swirl * b.z * step_time * 0.72;
			dir = vec2(dir.x * cos(turn) - dir.y * sin(turn), dir.x * sin(turn) + dir.y * cos(turn));
			at += dir * max(0.0, c.x - c.y * t) * step_time;
		}
		float radius = max(0.02, (b.x + b.y * age * 0.8) * 0.6 + b.y * 0.12);
		vec4 centre = VIEW_MATRIX * vec4(at.x, head.y, at.y, 1.0);
		centre.z += 0.9;
		POSITION = PROJECTION_MATRIX * (centre + vec4(VERTEX.xy * 2.0 * radius, 0.0, 0.0));
		float left = 1.0 - age / life;
		alpha = COLOR.a * left * left * (3.0 - 2.0 * left);
	} else {
		// The streak lies from its head back along its direction. It faces the camera.
		vec4 front = VIEW_MATRIX * vec4(head, 1.0);
		vec4 back = VIEW_MATRIX * vec4(head - vec3(a.x, 0.0, a.y) * a.z, 1.0);
		vec2 along = front.xy - back.xy;
		vec2 across = length(along) > 0.0001 ? normalize(vec2(-along.y, along.x)) : vec2(0.0, 1.0);
		vec4 point = mix(back, front, VERTEX.x + 0.5) + vec4(across * VERTEX.y * b.x, 0.0, 0.0);
		point.z += 0.9;
		POSITION = PROJECTION_MATRIX * point;
		uv.x = VERTEX.x + 0.5;
		float left = 1.0 - age / life;
		alpha = COLOR.a * left * left;
	}
}

void fragment() {
	float a = alpha;
	if (puff > 0.5) {
		// Smoke is a pattern of dots that gets thin, so a unit in the smoke stays in view.
		a = step(length(uv), 1.0) * step(bayer8(FRAGCOORD.xy) + 0.01, a);
	} else {
		float centred = abs(uv.y);
		float taper = smoothstep(0.0, 0.55, uv.x);
		float half_width = mix(0.18, 1.0, taper);
		a *= (1.0 - smoothstep(half_width * 0.72, half_width, centred)) * smoothstep(1.0, 0.9, uv.x);
		a *= smoothstep(0.0, 0.28, uv.x);
	}
	if (a <= 0.01) {
		discard;
	}
	ALBEDO = flat_color(COLOR.rgb);
	ALPHA = a;
}
