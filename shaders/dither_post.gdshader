shader_type canvas_item;

// Final pass. Quantizes the brightness of every pixel of the 3D view with an 8x8 ordered dither.
// pattern_offset moves the pattern with the camera, so the pattern stays fixed on the ground.
uniform vec2 pattern_offset = vec2(0.0);
uniform float levels = 6.0;
uniform float strength = 1.0;
// Colour laid over the view, strongest at the screen edge. Alpha is the strength.
uniform vec4 tint = vec4(0.0);

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
	color = mix(color, tint.rgb, tint.a * mix(0.05, 1.0, smoothstep(0.3, 0.8, distance(UV, vec2(0.5)))));
	vec2 pixel = floor(UV / TEXTURE_PIXEL_SIZE) + pattern_offset;
	float threshold = bayer8(pixel);
	float steps = max(levels - 1.0, 1.0);
	// Dither the brightness only, so the hue stays clean and no stray colour dots show.
	float value = max(color.r, max(color.g, color.b));
	vec3 dithered = color * (floor(value * steps + threshold) / steps / max(value, 0.001));
	COLOR = vec4(mix(color, dithered, strength), 1.0);
}
