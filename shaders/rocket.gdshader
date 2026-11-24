shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;

#include "wind.gdshaderinc"

// Rocket models in flight: flat colours, darker on the sides and below, and a flame that flickers.
// Vertex colour alpha 0 marks the flame. The flame starts at the tail, TAIL metres from the middle.
const float TAIL = -1.25;

varying float up;
varying float flame;

void vertex() {
	flame = 1.0 - COLOR.a;
	// The flame gets longer and shorter 20 times a second. Each rocket has its own beat.
	float flicker = 0.75 + 0.35 * sin(TIME * 125.0 + float(INSTANCE_ID) * 2.1);
	VERTEX.x = mix(VERTEX.x, TAIL + (VERTEX.x - TAIL) * flicker, flame);
	up = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz).y;
	// Toward the camera in depth, more than the smoke, so the smoke behind the rocket does not cover it.
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	view.z += 1.2;
	POSITION = PROJECTION_MATRIX * view;
}

void fragment() {
	float drop = up > 0.4 ? 0.0 : up > -0.4 ? 1.0 : 2.0;
	ALBEDO = flat_color(flame > 0.5 ? COLOR.rgb : tone(COLOR.rgb, drop));
}
