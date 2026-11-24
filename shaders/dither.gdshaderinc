// Threshold from 0 to 63/64 of an 8x8 ordered dither at a pixel.
float bayer2(vec2 a) {
	a = floor(a);
	return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer8(vec2 a) {
	float b4 = bayer2(0.25 * a) * 0.25 + bayer2(0.5 * a);
	return b4 * 0.25 + bayer2(a);
}
