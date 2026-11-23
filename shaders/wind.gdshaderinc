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

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Painted meadow colour: four flat green tones in soft patches. A gust lifts the tone as it passes.
vec3 meadow(vec2 p, float t) {
	float n = value_noise(p * 0.11) * 0.6 + value_noise(p * 0.31 + 7.0) * 0.3 + value_noise(p * 0.9) * 0.1;
	n += (gust(p, t) - 0.5) * 0.22;
	vec3 color = vec3(0.13, 0.33, 0.2);
	color = mix(color, vec3(0.25, 0.5, 0.22), smoothstep(0.36, 0.4, n));
	color = mix(color, vec3(0.44, 0.66, 0.26), smoothstep(0.5, 0.54, n));
	color = mix(color, vec3(0.68, 0.8, 0.33), smoothstep(0.66, 0.7, n));
	return color;
}
