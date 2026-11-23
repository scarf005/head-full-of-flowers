shader_type spatial;

#include "wind.gdshaderinc"

// Ground. `tiles` holds one TerrainMap.Tile for each tile and `warp` the push that bends the borders between
// outdoor kinds, so the borders are sharp curves at any zoom. Each kind draws its own surface pattern.
uniform sampler2D tiles : filter_nearest;
uniform sampler2D warp : filter_linear;
uniform vec3 palette[13];
uniform float map_size = 112.0;
global uniform float arena_radius;
varying vec2 ground;

const float PUSH = 2.2;

void vertex() {
	ground = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

int raw_kind(vec2 p) {
	return int(texture(tiles, p / map_size + 0.5).r * 255.0 + 0.5);
}

bool is_floor(int kind) {
	return kind == 7 || kind >= 11;
}

int kind_at(vec2 p) {
	int raw = raw_kind(p);
	vec2 push = texture(warp, p / map_size + 0.5).rg * 2.0 - 1.0;
	int moved = raw_kind(p + push * PUSH);
	return is_floor(raw) || is_floor(moved) ? raw : moved;
}

// Rank of a kind at a border. The higher kind draws its rim on the lower one.
int rank(int kind) {
	return kind <= 2 ? 3 : kind == 8 ? 0 : kind == 9 ? 1 : 2;
}

void fragment() {
	// Snap to the pixel grid of the low-resolution view so that patterns do not shimmer.
	vec2 p = floor(ground * 16.0) / 16.0;
	int kind = kind_at(p);
	vec3 color = kind <= 2 ? vec3(0.17, 0.4, 0.18) : palette[kind];
	vec2 cell = floor(p * 5.0);
	float grain = hash(cell);
	float tone = hash(floor(p * 0.7)) * 0.5 + hash(floor(p * 1.9)) * 0.5;
	if (kind == 8) {
		float wave = sin(p.y * 5.0 + sin(p.x * 1.3 + TIME * 0.8) * 1.6 + TIME * 1.1);
		color *= 0.92 + 0.08 * tone;
		color = mix(color, vec3(0.75, 0.9, 0.95), step(0.94, wave) * step(0.35, hash(floor(p * vec2(0.8, 5.0)))));
	} else if (kind == 11) {
		vec2 plank = vec2(p.x * 0.5 + floor(p.y * 3.0) * 0.37, p.y * 3.0);
		color *= 0.94 + 0.1 * hash(floor(plank));
		color *= 1.0 - 0.22 * max(step(0.9, fract(plank.y)), step(0.96, fract(plank.x)));
	} else if (kind == 12) {
		vec2 slab = p * 2.0;
		color *= mod(floor(slab.x) + floor(slab.y), 2.0) < 0.5 ? 1.0 : 0.93;
		color *= 1.0 - 0.15 * max(step(0.9, fract(slab.x)), step(0.9, fract(slab.y)));
	} else if (kind == 7) {
		color *= 1.0 - 0.14 * max(step(0.96, fract(p.x * 0.5)), step(0.96, fract(p.y * 0.5)));
		color *= 1.0 - 0.08 * step(0.95, grain);
	} else if (kind == 6) {
		// Gravel: stones of mixed size on dirt, out of line, with gaps.
		vec2 id = floor(p * 2.5);
		vec2 centre = id + 0.5 + (vec2(hash(id), hash(id + 7.3)) - 0.5) * 0.6;
		bool stone = hash(id + 5.9) > 0.3 && length(p * 2.5 - centre) < 0.1 + 0.2 * hash(id + 3.1);
		color = stone ? color * (0.92 + 0.3 * hash(id + 1.7)) : mix(color, palette[3], 0.55) * 0.82;
	} else if (kind > 2) {
		color *= 0.95 + 0.08 * tone;
		color *= grain > 0.94 ? 0.8 : grain < 0.03 ? 1.12 : 1.0;
	}
	// Rim: where a higher kind is next to this point, draw its edge here.
	int best = rank(kind);
	for (int i = 0; i < 4; i++) {
		vec2 side = vec2(float(i == 0) - float(i == 1), float(i == 2) - float(i == 3));
		int near = kind_at(p + side * 0.14);
		if (near != kind && !is_floor(near) && !is_floor(kind)) {
			best = max(best, rank(near));
		}
	}
	if (best > rank(kind)) {
		color = kind == 8 ? vec3(0.8, 0.93, 0.95) : color * 0.7;
	}
	// Outside the arena: dark, with diagonal hatching.
	float past = length(p) - arena_radius;
	if (past > 0.0) {
		color = mix(color, vec3(0.25, 0.1, 0.14), fract((p.x + p.y) * 1.5) < 0.3 ? 0.75 : 0.5);
	}
	color *= cloud(ground, TIME);
	// A red line marks the border.
	if (abs(past) < 0.12) {
		color = vec3(0.95, 0.22, 0.25);
	}
	ALBEDO = lit_screen(color);
	ROUGHNESS = 1.0;
}
