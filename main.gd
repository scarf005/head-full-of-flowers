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
	&"swap_prev": [[], [MOUSE_BUTTON_WHEEL_UP], [JOY_BUTTON_LEFT_SHOULDER], []],
	&"pause": [[KEY_ESCAPE], [], [JOY_BUTTON_START], []],
	&"fullscreen": [[KEY_F11], [], [], []],
}

var viewport: SubViewport
var dither: ShaderMaterial
var game: GameView
var hud := Hud.new()
var banner := Banner.new()
var menu := Menu.new()
var sound := Sound.new()
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
	# The camera and its listener are in this viewport. Without this, each positional sound is silent.
	viewport.audio_listener_enable_3d = true
	container.add_child(viewport)
	viewport.add_child(sound)
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hud)
	banner.set_anchors_preset(Control.PRESET_FULL_RECT)
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(banner)
	add_child(menu)
	menu.process_mode = Node.PROCESS_MODE_ALWAYS
	process_mode = Node.PROCESS_MODE_ALWAYS
	menu.start.connect(start_match)
	menu.resume.connect(_set_paused.bind(false))
	menu.quit_to_title.connect(show_title)
	if args.has("autoplay") or args.has("match"):
		var config := {seed = int(args.get("seed", "1")), size = int(args.get("size", "8"))}
		config.mode = StringName(args.get("mode", "ffa"))
		config.hard = args.has("hard")
		start_match(config, args.has("autoplay"))
	else:
		show_title()


## The title screen shows a bot match behind the menu.
func show_title() -> void:
	start_match({seed = randi(), size = 8}, true)
	menu.show_title()
	hud.hide()


func start_match(config: Dictionary, demo := false) -> void:
	if game:
		game.queue_free()
	game = GameView.new()
	game.autoplay = demo
	game.intro = 0.0 if demo else 1.2
	game.process_mode = Node.PROCESS_MODE_PAUSABLE
	viewport.add_child(game)
	game.setup(config)
	game.event.connect(_on_event)
	hud.setup(game)
	banner.setup(game)
	sound.setup(game)
	hud.show()
	menu.hide()
	_set_paused(false)


func _on_event(e: Dictionary) -> void:
	if e.type != &"finish":
		return
	if game.autoplay:
		# Restart only the demo: a new title menu would erase what the player typed.
		var shown := menu.visible
		start_match({seed = randi(), size = 8}, true)
		menu.visible = shown
		hud.hide()
	elif not args.has("autoplay"):
		var ended := game
		await get_tree().create_timer(1.5).timeout
		if game == ended:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			menu.show_results(game.world)


func _input(event: InputEvent) -> void:
	if event is InputEventMouse:
		GameView.mouse = event.position


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"pause") and _live():
		_set_paused(not get_tree().paused)
	elif event.is_action_pressed(&"fullscreen"):
		var full := get_window().mode == Window.MODE_FULLSCREEN
		get_window().mode = Window.MODE_WINDOWED if full else Window.MODE_FULLSCREEN


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and game and _live() and not args.has("capture"):
		_set_paused(true)


## True while a person plays a match that has not ended.
func _live() -> bool:
	return not game.autoplay and not game.world.finished


func _set_paused(paused: bool) -> void:
	get_tree().paused = paused
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if paused or game.autoplay else Input.MOUSE_MODE_CONFINED_HIDDEN
	if paused:
		menu.show_pause()
	else:
		menu.hide()


func _process(_delta: float) -> void:
	frame += 1
	dither.set_shader_parameter("pattern_offset", game.camera.pattern_offset)
	var tint := game.tint
	if game.player.hp <= 3.0 and tint.a < 0.3 and not game.autoplay:
		tint = Color(0.85, 0.05, 0.12, 0.22 + 0.08 * sin(Time.get_ticks_msec() * 0.008))
	dither.set_shader_parameter("tint", tint)
	var first := int(args.get("frames", "30"))
	var shots := int(args.get("burst", "1"))
	if args.has("capture") and frame >= first and (frame - first) % 3 == 0:
		var index := (frame - first) / 3
		var path: String = args["capture"]
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(path if shots == 1 else path + ".%03d.png" % index)
		if index >= shots - 1:
			print("captured ", path, " ", RenderingServer.get_current_rendering_method())
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
