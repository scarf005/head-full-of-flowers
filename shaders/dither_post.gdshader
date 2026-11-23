shader_type canvas_item;

// Final pass. Quantizes every pixel of the 3D view with an 8x8 ordered dither.
// pattern_offset moves the pattern with the camera, so the pattern stays fixed on the ground.
uniform vec2 pattern_offset = vec2(0.0);
uniform float levels = 4.0;
uniform float strength = 1.0;

float bayer2(vec2 a) {
	a = floor(a);
	return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer8(vec2 a) {
	float b4 = bayer2(0.25 * a) * 0.25 + bayer2(0.5 * a);
	return b4 * 0.25 + bayer2(a);
}

void fragment() {
	vec3 color = texture(TEXTURE, UV).rgb;
	vec2 pixel = floor(UV / TEXTURE_PIXEL_SIZE) + pattern_offset;
	float threshold = bayer8(pixel);
	float steps = max(levels - 1.0, 1.0);
	vec3 dithered = floor(color * steps + threshold) / steps;
	COLOR = vec4(mix(color, dithered, strength), 1.0);
}
