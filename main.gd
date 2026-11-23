extends Control
## Root. Hosts the low-res 3D viewport, the dither pass and the screens.

const PIXEL_SCALE := 2
## Action -> [keys, mouse buttons, joypad buttons, [joypad axis, sign]].
const ACTIONS := {
	&"move_left": [[KEY_A, KEY_LEFT], [], [], [JOY_AXIS_LEFT_X, -1]],
	&"move_right": [[KEY_D, KEY_RIGHT], [], [], [JOY_AXIS_LEFT_X, 1]],
	&"move_up": [[KEY_W, KEY_UP], [], [], [JOY_AXIS_LEFT_Y, -1]],
	&"move_down": [[KEY_S, KEY_DOWN], [], [], [JOY_AXIS_LEFT_Y, 1]],
	&"aim_left": [[], [], [], [JOY_AXIS_RIGHT_X, -1]],
	&"aim_right": [[], [], [], [JOY_AXIS_RIGHT_X, 1]],
	&"aim_up": [[], [], [], [JOY_AXIS_RIGHT_Y, -1]],
	&"aim_down": [[], [], [], [JOY_AXIS_RIGHT_Y, 1]],
	&"fire": [[], [MOUSE_BUTTON_LEFT], [], [JOY_AXIS_TRIGGER_RIGHT, 1]],
	&"throw": [[KEY_G], [MOUSE_BUTTON_RIGHT], [], [JOY_AXIS_TRIGGER_LEFT, 1]],
	&"reload": [[KEY_R], [], [JOY_BUTTON_X], []],
	&"swap_next": [[KEY_Q], [MOUSE_BUTTON_WHEEL_DOWN], [JOY_BUTTON_Y], []],
	&"swap_prev": [[], [MOUSE_BUTTON_WHEEL_UP], [], []],
	&"pause": [[KEY_ESCAPE], [], [JOY_BUTTON_START], []],
}

var viewport: SubViewport
var dither: ShaderMaterial
var game: GameView
var frame := 0
var args := {}


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		var parts := arg.trim_prefix("--").split("=")
		args[parts[0]] = parts[1] if parts.size() > 1 else "1"
	_add_actions()
	var container := SubViewportContainer.new()
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.stretch = true
	container.stretch_shrink = PIXEL_SCALE
	container.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dither = ShaderMaterial.new()
	dither.shader = preload("res://shaders/dither_post.gdshader")
	container.material = dither
	add_child(container)
	viewport = SubViewport.new()
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	container.add_child(viewport)
	start_match({seed = int(args.get("seed", str(randi()))), size = int(args.get("size", "8"))})


func start_match(config: Dictionary) -> void:
	if game:
		game.queue_free()
	game = GameView.new()
	game.autoplay = args.has("autoplay")
	viewport.add_child(game)
	game.setup(config)


func _process(_delta: float) -> void:
	frame += 1
	dither.set_shader_parameter("pattern_offset", game.camera.pattern_offset)
	if args.has("capture") and frame == int(args.get("frames", "30")):
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(args["capture"])
		print("captured ", args["capture"], " ", RenderingServer.get_current_rendering_method())
		get_tree().quit()


func _add_actions() -> void:
	for action: StringName in ACTIONS:
		var spec: Array = ACTIONS[action]
		InputMap.add_action(action, 0.3)
		for key: Key in spec[0]:
			var e := InputEventKey.new()
			e.physical_keycode = key
			InputMap.action_add_event(action, e)
		for button: MouseButton in spec[1]:
			var e := InputEventMouseButton.new()
			e.button_index = button
			InputMap.action_add_event(action, e)
		for button: JoyButton in spec[2]:
			var e := InputEventJoypadButton.new()
			e.button_index = button
			InputMap.action_add_event(action, e)
		if spec[3]:
			var e := InputEventJoypadMotion.new()
			e.axis = spec[3][0]
			e.axis_value = spec[3][1]
			InputMap.action_add_event(action, e)
