shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

#include "wind.gdshaderinc"

// One unit as pixel art: shadow and ammo rings on the ground, the body frame, the gun turned to the aim and a
// health bar. The mesh shows CANVAS pixels, one for each pixel of the low-res view. The unit stands at FEET.
const vec2 CANVAS = vec2(64.0);
const vec2 FEET = vec2(32.0, 20.0);
const vec3 INK = vec3(0.2, 0.14, 0.2);

uniform sampler2D sheet : filter_nearest, repeat_disable;
uniform sampler2D gun : filter_nearest, repeat_disable;
// Body frame in the sheet as a UV rectangle, and the frame size in pixels.
uniform vec4 frame = vec4(0.0, 0.0, 1.0, 1.0);
uniform vec2 frame_px = vec2(24.0, 28.0);
uniform vec2 gun_px = vec2(24.0);
// 1 when the unit looks to the left.
uniform float mirror = 0.0;
uniform vec3 team = vec3(1.0);
uniform vec3 bar_color = vec3(1.0);
// Health from 0 to 1. Below 0: no health bar.
uniform float hp = 1.0;
uniform float flash = 0.0;
// Centre of the gun in pixels from the feet, and its turn in radians.
uniform vec2 hand = vec2(8.0, 7.0);
uniform float angle = 0.0;
uniform float gun_front = 1.0;
// Pixel rows of the body that are under water.
uniform float sink = 0.0;
// Turn of the figure to the left in radians around its middle, and pixels from the ground up to its feet. A unit in
// a roll has both.
uniform vec2 tumble = vec2(0.0);
// Fill from 0 to 1 of the magazine ring and of the grenade ring, then 1 during a reload. x below 0: no rings.
uniform vec3 rings = vec3(-1.0, 1.0, 0.0);

float gun_alpha(vec2 p) {
	vec2 g = p - hand;
	vec2 q = vec2(cos(angle) * g.x + sin(angle) * g.y, cos(angle) * g.y - sin(angle) * g.x);
	vec2 uv = vec2(q.x, mix(-q.y, q.y, mirror)) / gun_px + 0.5;
	return uv == clamp(uv, 0.0, 1.0) ? texture(gun, uv).a : 0.0;
}

vec4 gun_at(vec2 p) {
	vec2 g = p - hand;
	vec2 q = vec2(cos(angle) * g.x + sin(angle) * g.y, cos(angle) * g.y - sin(angle) * g.x);
	vec2 uv = vec2(q.x, mix(-q.y, q.y, mirror)) / gun_px + 0.5;
	if (uv == clamp(uv, 0.0, 1.0) && texture(gun, uv).a > 0.5) {
		return vec4(texture(gun, uv).rgb, 1.0);
	}
	// Ink around the gun, so it shows on each ground.
	float near = gun_alpha(p + vec2(1.0, 0.0)) + gun_alpha(p - vec2(1.0, 0.0));
	near += gun_alpha(p + vec2(0.0, 1.0)) + gun_alpha(p - vec2(0.0, 1.0));
	return vec4(INK, step(0.5, near));
}

vec4 body_at(vec2 p) {
	vec2 b = vec2(mix(p.x, -p.x, mirror) + frame_px.x * 0.5, p.y + sink);
	if (p.y < 0.0 || b != clamp(b, vec2(0.0), frame_px)) {
		return vec4(0.0);
	}
	vec4 texel = texture(sheet, frame.xy + vec2(b.x, frame_px.y - b.y) / frame_px * frame.zw);
	// The 3 key colours of the sheet take the team colour: base, shade and light.
	if (texel.g < 0.55 && texel.r > 0.5 && abs(texel.r - texel.b) < 0.02) {
		vec3 shade = texel.r > 0.9 ? team : team * vec3(0.62, 0.6, 0.72);
		texel.rgb = texel.g > 0.25 ? mix(team, vec3(1.0), 0.6) : shade;
	}
	return vec4(texel.rgb, step(0.5, texel.a));
}

// The body and the gun as one figure.
vec4 figure_at(vec2 p) {
	vec4 body = body_at(p);
	vec4 held = gun_at(p);
	return gun_front > 0.5 ? mix(body, held, held.a) : mix(held, body, body.a);
}

void vertex() {
	// Toward the camera in depth only, so grass and flowers in front do not cover the unit. Walls still do.
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	view.z += 0.9;
	POSITION = PROJECTION_MATRIX * view;
}

void fragment() {
	vec2 p = floor(vec2(UV.x, 1.0 - UV.y) * CANVAS) + 0.5 - FEET;
	vec4 color = vec4(INK, 0.3 * step(length(p / vec2(8.0, 3.5)), 1.0));
	vec2 round_p = vec2(p.x, p.y / 0.82);
	float turn = fract(atan(round_p.x, round_p.y) / TAU);
	if (rings.x >= 0.0 && abs(length(round_p) - 16.0) < 0.75 && turn <= rings.x) {
		color = vec4(mix(vec3(1.0), vec3(0.76, 0.78, 0.81), rings.z), 1.0);
	}
	if (rings.x >= 0.0 && abs(length(round_p) - 13.5) < 0.75 && turn <= rings.y) {
		color = vec4(mix(vec3(1.0, 0.94, 0.85), vec3(1.0, 0.75, 0.4), step(1.0, rings.y)), 1.0);
	}
	vec2 middle = vec2(0.0, frame_px.y * 0.45);
	vec2 q = p - vec2(0.0, tumble.y) - middle;
	q = vec2(cos(tumble.x) * q.x + sin(tumble.x) * q.y, cos(tumble.x) * q.y - sin(tumble.x) * q.x) + middle;
	vec4 figure = figure_at(q);
	// A second ring of ink around the figure, so the unit shows on flowers of its own colour. The ring stays dark
	// in a hit flash.
	float near = figure_at(q + vec2(1.0, 0.0)).a + figure_at(q - vec2(1.0, 0.0)).a;
	near += figure_at(q + vec2(0.0, 1.0)).a + figure_at(q - vec2(0.0, 1.0)).a;
	color = mix(color, vec4(INK * 0.5, 1.0), step(0.5, near));
	figure.rgb = mix(figure.rgb, vec3(1.0), flash);
	color = mix(color, figure, figure.a);
	vec2 bar = p - vec2(0.0, frame_px.y + 2.0);
	if (hp >= 0.0 && abs(bar.x) < 9.0 && bar == clamp(bar, vec2(-9.0, 0.0), vec2(9.0, 4.0))) {
		bool filled = abs(bar.x) < 8.0 && abs(bar.y - 2.0) < 1.0 && bar.x + 8.0 < 16.0 * hp;
		color = vec4(filled ? bar_color : INK, 1.0);
	}
	if (color.a <= 0.0) {
		discard;
	}
	ALBEDO = flat_color(color.rgb);
	ALPHA = color.a;
}
