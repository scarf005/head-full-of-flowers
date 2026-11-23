shader_type spatial;
render_mode unshaded;

#include "wind.gdshaderinc"

// Arcade projectile: white core inside a rim of the instance colour. The ink outline pass adds the dark border.
// An instance with alpha 0 has no core: a puff of flame.
void fragment() {
	float rim = 1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	ALBEDO = screen(mix(vec3(1.6), COLOR.rgb * 1.5, max(step(0.3, rim), 1.0 - COLOR.a)));
}
