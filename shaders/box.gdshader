shader_type spatial;

// Walls, furniture and crates. The sides are darker than the top, so each box reads as a solid block.
varying float side;
varying float height;

void vertex() {
	height = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
	side = 1.0 - step(0.5, abs((MODEL_MATRIX * vec4(NORMAL, 0.0)).y) / length(MODEL_MATRIX[1].xyz));
}

void fragment() {
	// A side is darkest at the floor, so the box stands on the ground.
	ALBEDO = COLOR.rgb * mix(1.0, mix(0.5, 0.76, smoothstep(0.0, 0.5, height)), side);
	ROUGHNESS = 1.0;
}
