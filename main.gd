extends Control
## Root. Hosts the low-res 3D viewport and the dither pass.

const PIXEL_SCALE := 2

var container: SubViewportContainer
var viewport: SubViewport
var camera: CameraRig
var dither: ShaderMaterial
var frame := 0
var args := {}


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		var parts := arg.trim_prefix("--").split("=")
		args[parts[0]] = parts[1] if parts.size() > 1 else "1"
	container = SubViewportContainer.new()
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	container.stretch_shrink = PIXEL_SCALE
	container.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	dither = ShaderMaterial.new()
	dither.shader = preload("res://shaders/dither_post.gdshader")
	container.material = dither
	add_child(container)
	viewport = SubViewport.new()
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	container.add_child(viewport)
	_build_spike()


func _build_spike() -> void:
	var world := Node3D.new()
	viewport.add_child(world)
	camera = CameraRig.new()
	world.add_child(camera)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-50.0), deg_to_rad(-35.0), 0.0)
	sun.shadow_enabled = true
	world.add_child(sun)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0.1, 0.1, 0.14)
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(0.5, 0.55, 0.7)
	env.environment.ambient_light_energy = 0.6
	world.add_child(env)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(80.0, 80.0)
	ground.mesh = plane
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color(0.35, 0.5, 0.3)
	ground.material_override = ground_mat
	world.add_child(ground)
	for i in 12:
		var box := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(2.0, 1.0 + i % 3, 2.0)
		box.mesh = mesh
		box.position = Vector3(-12.0 + i * 3.0, mesh.size.y * 0.5, sin(i * 1.7) * 5.0)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color.from_hsv(i / 12.0, 0.6, 0.9)
		box.material_override = mat
		world.add_child(box)


func _process(_delta: float) -> void:
	frame += 1
	if args.has("pan"):
		camera.target = Vector2(float(args["pan"]), float(args["pan"]) * 0.5)
	camera.apply()
	dither.set_shader_parameter("pattern_offset", camera.pattern_offset)
	if args.has("capture") and frame == int(args.get("frames", "30")):
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(args["capture"])
		print("captured ", args["capture"], " ", RenderingServer.get_current_rendering_method())
		get_tree().quit()
