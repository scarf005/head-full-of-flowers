extends GutTest
## Input events go through the window to the match of a person, as they do in a real game.

var main: Control
var player: SimUnit


func before_each() -> void:
	main = add_child_autofree(load("res://main.tscn").instantiate())
	main.start_match({seed = 1, size = 2})
	main.game.world.bots_active = false
	player = main.game.player
	Arsenal.equip(player, &"assault", 30.0)
	player.slot_index = 0


func after_each() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## Sends an event as the window gets it. `at` is the place of the pointer in canvas units, not in window pixels.
func _send(event: InputEvent, at := Vector2(640, 300)) -> void:
	if event is InputEventMouse:
		event.position = get_window().get_final_transform() * at
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	await wait_physics_frames(2)


func _wheel(button: MouseButton) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.pressed = true
	return event


func test_match_clock_of_a_real_game_runs_10_to_20_percent_faster_than_the_original() -> void:
	var before: float = main.game.world.time_left
	await wait_physics_frames(60)
	# The original game runs 0.75 s of its match in 1 s.
	assert_between((before - main.game.world.time_left) / 0.75, 1.1, 1.2, "match time in 60 ticks")


func test_mouse_wheel_and_the_q_key_change_the_weapon_of_the_player() -> void:
	var key := InputEventKey.new()
	key.physical_keycode = KEY_Q
	key.pressed = true
	for step: Array in [[_wheel(MOUSE_BUTTON_WHEEL_DOWN), 1], [_wheel(MOUSE_BUTTON_WHEEL_UP), 0], [key, 1]]:
		await _send(step[0])
		assert_eq(player.slot_index, step[1], step[0].as_text())


func test_mouse_takes_the_aim_back_after_the_right_stick() -> void:
	var stick := InputEventJoypadMotion.new()
	stick.axis = JOY_AXIS_RIGHT_X
	stick.axis_value = 1.0
	await _send(stick)
	assert_gt(player.aim.x, 0.9, "stick aims right")
	stick = stick.duplicate()
	stick.axis_value = 0.0
	await _send(stick)
	await _send(InputEventMouseMotion.new(), Vector2(100, 360))
	assert_lt(player.aim.x, 0.0, "pointer left of the player")


func test_mouse_wheel_does_not_change_the_weapon_of_unit_0_in_the_match_of_bots_behind_the_title() -> void:
	main.show_title()
	# No await: the next tick takes the wish away.
	_send(_wheel(MOUSE_BUTTON_WHEEL_DOWN), Vector2(100, 100))
	assert_eq(main.game.player.want_swap, 0)


func test_mouse_wheel_down_and_up_before_one_tick_keep_the_weapon() -> void:
	# No await: the 2 events come before the same tick.
	_send(_wheel(MOUSE_BUTTON_WHEEL_DOWN))
	await _send(_wheel(MOUSE_BUTTON_WHEEL_UP))
	assert_eq(player.slot_index, 0)
