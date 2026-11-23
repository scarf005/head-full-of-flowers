shader_type spatial;

// Walls, furniture and crates. The sides are darker than the top, so each box reads as a solid block.
varying float side;

void vertex() {
	side = 1.0 - step(0.5, abs((MODEL_MATRIX * vec4(NORMAL, 0.0)).y) / length(MODEL_MATRIX[1].xyz));
}

void fragment() {
	ALBEDO = COLOR.rgb * mix(1.0, 0.7, side);
	ROUGHNESS = 1.0;
}
