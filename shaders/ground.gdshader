shader_type spatial;

#include "wind.gdshaderinc"

// Ground. `tiles` holds one TerrainMap.Tile for each tile and `warp` the push that bends the borders between
// outdoor kinds, so the borders are sharp curves at any zoom. Each kind draws its own surface pattern.
uniform sampler2D tiles : filter_nearest;
uniform sampler2D warp : filter_linear;
uniform vec3 palette[13];
uniform float map_size = 112.0;
global uniform float arena_radius;
global uniform float rot;
global uniform float ground_calm;
varying vec2 ground;

const float PUSH = 2.2;
// Pixels of the view for each metre to the east and for each metre to the south.
const vec2 PIXELS = vec2(20.0, 16.383);

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

// Floor of a building as pixel art in flat tones. `px` is the pixel of the view on the ground.
vec3 floor_color(int kind, vec2 px) {
	if (kind == 11) {
		// Boards of 2 m x 6 pixels. Each row starts 17 pixels after the row to its north.
		float row = floor(px.y / 6.0);
		float along = px.x + row * 17.0;
		float pick = hash(vec2(floor(along / 40.0), row));
		vec3 board = pick < 0.33 ? vec3(0.6, 0.42, 0.27) : pick < 0.66 ? vec3(0.6, 0.45, 0.31) : vec3(0.6, 0.4, 0.24);
		return mod(px.y, 6.0) == 0.0 || mod(along, 40.0) == 0.0 ? vec3(0.4, 0.26, 0.16) : board;
	}
	if (kind == 12) {
		// Tiles of 0.5 m in 2 tones.
		vec2 slab = floor(px / vec2(10.0, 8.0));
		vec3 tile = mod(slab.x + slab.y, 2.0) < 0.5 ? vec3(0.72, 0.78, 0.8) : vec3(0.65, 0.74, 0.8);
		return mod(px.x, 10.0) == 0.0 || mod(px.y, 8.0) == 0.0 ? vec3(0.48, 0.54, 0.6) : tile;
	}
	// Concrete: slabs of 2 m.
	return mod(px.x, 40.0) == 0.0 || mod(px.y, 33.0) == 0.0 ? vec3(0.4, 0.4, 0.38) : vec3(0.6, 0.59, 0.56);
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
	} else if (is_floor(kind)) {
		color = floor_color(kind, floor(ground * PIXELS + 0.001));
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
	// Outside the arena the ground rots. Inside, the outdoor kinds have calm tones.
	float past = length(p) - arena_radius;
	color = past > 0.0 ? mix(color, rotten(color, p), rot) : is_floor(kind) ? color : calm(color, ground_calm);
	// A red line marks the border.
	bool border = abs(past) < 0.12;
	ROUGHNESS = 1.0;
	if (is_floor(kind) && !border) {
		// A floor shows its own colour: no light, no shadow and no cloud, so its tones stay flat.
		ALBEDO = vec3(0.0);
		SPECULAR = 0.0;
		EMISSION = flat_color(color);
	} else {
		ALBEDO = lit_screen(border ? vec3(0.95, 0.22, 0.25) : color * cloud(ground, TIME));
	}
}
