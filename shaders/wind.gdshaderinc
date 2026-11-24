// Shared wind field. Bands of gusts travel across the map along WIND_DIR.
const vec2 WIND_DIR = vec2(0.94, 0.34);

// Gust strength from 0 to 1 at a ground position.
float gust(vec2 p, float t) {
	float along = dot(p, WIND_DIR);
	float across = dot(p, vec2(-WIND_DIR.y, WIND_DIR.x));
	float front = along + sin(across * 0.13 + t * 0.4) * 4.0 + sin(across * 0.41) * 1.5;
	float a = sin(front * 0.42 - t * 2.6);
	float b = sin(front * 0.17 - t * 1.1 + 1.3);
	float c = sin(front * 1.3 - t * 5.0 + across * 0.3);
	return clamp(0.5 + a * 0.3 + b * 0.2 + c * 0.06, 0.0, 1.0);
}

// Slow cloud shadow from 0.78 to 1.
float cloud(vec2 p, float t) {
	float a = sin(p.x * 0.045 - t * 0.11) + sin(p.y * 0.06 + t * 0.07 + p.x * 0.02);
	return mix(0.78, 1.0, smoothstep(-0.6, 0.5, a));
}

// Colour as the PC renderer shows a raw value. The web renderer does not convert the output, so convert it here.
vec3 screen(vec3 c) {
	return CURRENT_RENDERER == RENDERER_COMPATIBILITY ? pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)) : c;
}

// The same for a lit surface: the web renderer lights it brighter, so go half the way.
vec3 lit_screen(vec3 c) {
	return mix(c, screen(c), 0.5);
}

// Output for pixel art. The screen shows `c` with its brightest channel moved to the nearest level of the dither
// pass, so a flat colour stays flat.
vec3 flat_color(vec3 c) {
	float top = max(c.r, max(c.g, c.b));
	c *= round(top * 5.0) / 5.0 / max(top, 0.001);
	vec3 decoded = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
	return CURRENT_RENDERER == RENDERER_COMPATIBILITY ? c : decoded;
}

// `base` at the level of the dither pass that is `drop` levels below its own, a little bluer for each level, as a
// surface in the shade. The result is a colour for flat_color().
vec3 tone(vec3 base, float drop) {
	float top = max(base.r, max(base.g, base.b));
	float level = clamp(round(top * 5.0) - drop, 1.0, 5.0);
	vec3 hue = mix(base / max(top, 0.001), vec3(0.72, 0.76, 1.0), clamp(drop, 0.0, 3.0) * 0.1);
	return hue / max(max(hue.r, max(hue.g, hue.b)), 0.001) * level / 5.0;
}

float speck(vec2 p) {
	return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743);
}

// Smooth noise from 0 to 1 with blobs of about 1 unit.
float blot(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = mix(speck(i), speck(i + vec2(1.0, 0.0)), f.x);
	float b = mix(speck(i + vec2(0.0, 1.0)), speck(i + vec2(1.0)), f.x);
	return mix(a, b, f.y);
}

// 1 on a crack of dry ground at `p` metres, else 0. The cracks are the borders of cells of about 1.4 m.
float crack(vec2 p) {
	vec2 q = p / 1.4;
	vec2 cell = floor(q);
	float near = 9.0;
	float next = 9.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 o = cell + vec2(float(x), float(y));
			float d = length(q - o - vec2(speck(o), speck(o + 3.7)));
			next = d < near ? near : min(next, d);
			near = min(near, d);
		}
	}
	return step(next - near, 0.07);
}

// Colour of a surface outside the arena at `p` metres: near black in rotten tones, with blotches and cracks.
// A bright `c` stays a little brighter, so shapes still show.
vec3 rotten(vec3 c, vec2 p) {
	float mottle = blot(p * 0.9) * 0.6 + blot(p * 2.7 + 5.0) * 0.4;
	vec3 dark = mix(vec3(0.015, 0.012, 0.018), vec3(0.12, 0.075, 0.06), smoothstep(0.35, 0.8, mottle));
	dark = mix(dark, vec3(0.08, 0.08, 0.035), step(0.75, blot(p * 1.6 - 9.0)));
	vec2 bent = p + vec2(blot(p * 0.7), blot(p * 0.7 + 3.0)) * 0.8;
	return dark * (0.4 + 0.7 * max(c.r, max(c.g, c.b))) * (1.0 - crack(bent));
}

// A calmer `c`: less saturation and less brightness. `amount` 0 keeps `c`.
vec3 calm(vec3 c, float amount) {
	float grey = dot(c, vec3(0.3, 0.59, 0.11));
	return mix(c, vec3(grey), 0.25 * amount) * (1.0 - 0.24 * amount);
}
