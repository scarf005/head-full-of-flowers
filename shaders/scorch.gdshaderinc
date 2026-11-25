// Marks of blasts and fires from view/scorch.gd: 4 texels for each metre of the map, the depth of a crater in r and the
// char in g, each from 0 to 1.
global uniform sampler2D scorch : filter_linear, repeat_disable;

const float SCORCH_PER_M = 4.0;

// Depth of a crater in x and char in y at the point `p` of the ground. 0 outside the map.
vec2 scorch_at(vec2 p) {
	ivec2 size = textureSize(scorch, 0);
	ivec2 texel = ivec2(floor(p * SCORCH_PER_M + vec2(size) * 0.5));
	if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) {
		return vec2(0.0);
	}
	return texelFetch(scorch, texel, 0).rg;
}

// The same between the texels, so a mark has a round outline.
vec2 scorch_smooth(vec2 p) {
	vec2 size = vec2(textureSize(scorch, 0));
	vec2 uv = (p * SCORCH_PER_M + size * 0.5) / size;
	return uv == clamp(uv, 0.0, 1.0) ? texture(scorch, uv).rg : vec2(0.0);
}
