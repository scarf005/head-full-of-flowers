// Shared wind field. Bands of gusts travel across the map along WIND_DIR.
const vec2 WIND_DIR = vec2(0.94, 0.34);

// Gust strength from 0 to 1 at a ground position.
float gust(vec2 p, float t) {
	float a = sin(dot(p, WIND_DIR) * 0.21 - t * 1.5);
	float b = sin(dot(p, vec2(-0.34, 0.94)) * 0.33 + t * 0.6 + a * 1.7);
	float c = sin(dot(p, WIND_DIR) * 0.9 - t * 3.1 + b);
	return clamp(0.5 + a * 0.3 + b * 0.15 + c * 0.1, 0.0, 1.0);
}

// Slow cloud shadow from 0.78 to 1.
float cloud(vec2 p, float t) {
	float a = sin(p.x * 0.045 - t * 0.11) + sin(p.y * 0.06 + t * 0.07 + p.x * 0.02);
	return mix(0.78, 1.0, smoothstep(-0.6, 0.5, a));
}
