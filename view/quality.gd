class_name Quality
## Render tier. PC uses Forward+ with the full effect set. Web uses the Compatibility renderer.


static func high() -> bool:
	return RenderingServer.get_current_rendering_method() == "forward_plus"


static func environment() -> Environment:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.07, 0.08, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.6, 0.78)
	env.ambient_light_energy = 0.35 if high() else 0.3
	if high():
		env.ssao_enabled = true
		env.ssao_radius = 1.2
		env.ssao_intensity = 2.5
		env.glow_enabled = true
		env.glow_intensity = 0.6
		env.glow_bloom = 0.1
		env.glow_hdr_threshold = 1.1
	return env


static func sun() -> DirectionalLight3D:
	var light := DirectionalLight3D.new()
	light.rotation = Vector3(deg_to_rad(-48.0), deg_to_rad(-38.0), 0.0)
	light.light_color = Color(1.0, 0.94, 0.82)
	light.light_energy = 0.85 if high() else 0.75
	light.shadow_enabled = true
	light.directional_shadow_mode = (
		DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if high() else DirectionalLight3D.SHADOW_ORTHOGONAL
	)
	light.directional_shadow_max_distance = 120.0
	return light


## Lights that can be lit at one time for muzzle flashes, fires and blasts.
static func light_budget() -> int:
	return 24 if high() else 6
