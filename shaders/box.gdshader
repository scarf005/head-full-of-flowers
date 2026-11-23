shader_type spatial;

// Walls, furniture and crates. The sides are darker than the top, so each box reads as a solid block.
varying float side;
varying float height;
varying vec2 ground;

void vertex() {
	height = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
	ground = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	side = 1.0 - step(0.5, abs((MODEL_MATRIX * vec4(NORMAL, 0.0)).y) / length(MODEL_MATRIX[1].xyz));
}

void fragment() {
	// A side is darkest at the floor, so the box stands on the ground.
	ALBEDO = COLOR.rgb * mix(1.0, mix(0.5, 0.76, smoothstep(0.0, 0.5, height)), side);
	// A green box is a hedge or a plant: leaves, 0.2 m each, in 3 tones.
	if (COLOR.g > COLOR.r * 1.3 && COLOR.g > COLOR.b * 1.15) {
		vec2 leaf = floor((ground + vec2(height * 0.7)) * 5.0);
		ALBEDO *= 0.76 + 0.2 * floor(fract(sin(dot(leaf, vec2(12.9898, 78.233))) * 43758.5453) * 3.0);
	}
	ROUGHNESS = 1.0;
}
