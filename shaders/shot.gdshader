shader_type spatial;
render_mode unshaded;

#include "wind.gdshaderinc"

// Arcade projectile: white core inside a rim of the instance colour. The ink outline pass adds the dark border.
// The instance alpha sets the core from the rim colour (0) to white (1). Flames use a core between the two.
void fragment() {
	float rim = 1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	vec3 edge = COLOR.rgb * 1.5;
	ALBEDO = screen(mix(mix(edge, vec3(1.6), COLOR.a), edge, step(0.3, rim)));
}
