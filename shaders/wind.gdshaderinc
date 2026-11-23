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
