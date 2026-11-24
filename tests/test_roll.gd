extends GutTest
## Dodge roll on an empty map: unit 0 is the player at (0.5, 0.5), unit 1 is its enemy.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(0.5, 0.5)
	a.aim = Vector2.RIGHT
	b.pos = Vector2(0.5, 16.5)
	w.pickups.clear()
	w.bots_active = false


func after_each() -> void:
	Tune.reset()


## Starts a roll of unit 0 with the move keys at `dir`.
func _start(dir: Vector2) -> void:
	a.move = dir
	a.want_roll = true
	w.tick()
	a.move = Vector2.ZERO


## Rolls unit 0 from (0.5, 0.5) to the east until the roll ends. Returns the x of the unit.
func _roll_east() -> float:
	a.pos = Vector2(0.5, 0.5)
	a.roll_cooldown = 0.0
	_start(Vector2.RIGHT)
	for n in 120:
		if a.rolling:
			w.tick()
	return a.pos.x


## Puts an obstacle on the cell from x 2 to 3 in the row of unit 0.
func _block(mat: int, solid := 1) -> int:
	var cell := w.grid.cell_of(Vector2(2.5, 0.5))
	var index := cell.y * w.grid.size + cell.x
	w.grid.set_cell(cell, mat)
	w.grid.solid[index] = solid
	return index


func test_roll_moves_a_unit_its_distance_along_the_move_keys() -> void:
	_start(Vector2.DOWN)
	assert_true(a.rolling)
	var ticks := 1
	while a.rolling and ticks < 120:
		w.tick()
		ticks += 1
	assert_almost_eq(a.pos.y - 0.5, Tune.roll_distance, 0.3)
	assert_almost_eq(a.pos.x, 0.5, 0.001)
	assert_almost_eq(ticks * Defs.TICK * Tune.game_speed, Tune.roll_time, 0.03)


func test_roll_without_a_move_key_goes_along_the_aim() -> void:
	a.aim = Vector2.UP
	_start(Vector2.ZERO)
	for n in 10:
		w.tick()
	assert_lt(a.pos.y, -0.5)
	assert_almost_eq(a.pos.x, 0.5, 0.001)


func test_unit_in_a_roll_keeps_its_direction_and_does_not_fire_or_throw() -> void:
	_start(Vector2.RIGHT)
	a.move = Vector2.LEFT
	a.want_fire = true
	a.want_throw = true
	for n in 8:
		w.tick()
	assert_gt(a.pos.x, 2.0)
	assert_eq(w.projectiles.size(), 0)
	assert_eq(w.throwables.size(), 0)


func test_unit_rolls_again_only_after_the_cooldown() -> void:
	_roll_east()
	a.want_roll = true
	w.tick()
	assert_false(a.rolling, "the cooldown of the roll runs")
	for n in ceili(Tune.roll_cooldown / (Defs.TICK * Tune.game_speed)):
		w.tick()
	a.want_roll = true
	w.tick()
	assert_true(a.rolling)


func test_shot_passes_a_unit_in_the_safe_part_of_its_roll() -> void:
	b.pos = Vector2(8.5, 0.5)
	b.aim = Vector2.LEFT
	for safe: float in [Tune.roll_safe, 0.0]:
		Tune.roll_safe = safe
		a.hp = a.max_hp
		a.pos = Vector2(0.5, 0.5)
		a.roll_cooldown = 0.0
		b.shoot_cooldown = 0.0
		b.want_fire = true
		_start(Vector2.RIGHT)
		b.want_fire = false
		for n in 12:
			w.tick()
		if safe > 0.0:
			assert_eq(a.hp, a.max_hp, "the shot meets the unit 0.1 s after the start of the roll")
		else:
			assert_lt(a.hp, a.max_hp, "no part of the roll is safe")


func test_blast_does_not_hurt_a_unit_in_the_safe_part_of_its_roll() -> void:
	_start(Vector2.RIGHT)
	Combat.explode(w, a.pos, 3.0, 5.0, 1, false, &"grenade")
	assert_eq(a.hp, a.max_hp)
	while a.rolling:
		w.tick()
	Combat.explode(w, a.pos, 3.0, 5.0, 1, false, &"grenade")
	assert_lt(a.hp, a.max_hp, "the roll is over")


func test_arena_border_hurts_a_unit_in_a_roll() -> void:
	a.pos = Vector2(w.arena_radius - 1.0, 0.0)
	_start(Vector2.RIGHT)
	for n in 6:
		w.tick()
	assert_lt(a.hp, a.max_hp)


func test_roll_takes_a_unit_over_a_fence_a_hedge_a_window_and_a_low_prop() -> void:
	for obstacle: Array in [
		[Defs.Mat.WALL, 1],
		[Defs.Mat.HEDGE, 1],
		[Defs.Mat.WAREHOUSE, ObstacleGrid.LOW],
		[Defs.Mat.PROP, ObstacleGrid.LOW]
	]:
		_block(obstacle[0], obstacle[1])
		a.pos = Vector2(0.5, 0.5)
		a.move = Vector2.RIGHT
		for n in 40:
			w.tick()
		assert_lt(a.pos.x, 2.0, "a walk stops at material %d" % obstacle[0])
		assert_gt(_roll_east(), 3.0 + a.radius, "a roll goes over material %d" % obstacle[0])


func test_roll_through_a_window_breaks_its_glass() -> void:
	var index := _block(Defs.Mat.WAREHOUSE, ObstacleGrid.LOW)
	w.grid.glass[index] = true
	_roll_east()
	assert_false(w.grid.glass.has(index))
	assert_eq(w.events.filter(func(e: Dictionary) -> bool: return e.type == &"glass").size(), 1)


func test_roll_does_not_take_a_unit_through_a_house_wall_a_rock_or_a_loot_box() -> void:
	for mat: int in [Defs.Mat.WAREHOUSE, Defs.Mat.ROCK, Defs.Mat.BOX, Defs.Mat.PROP]:
		_block(mat)
		assert_lt(_roll_east(), 2.0, "material %d" % mat)


func test_roll_that_ends_on_a_fence_goes_on_to_its_far_side() -> void:
	_block(Defs.Mat.WALL)
	# A roll of 2 m from x 0.5 ends in the middle of the fence cell from x 2 to 3.
	Tune.roll_distance = 2.0
	assert_gt(_roll_east(), 3.0 + a.radius - 0.01)


func test_view_turns_and_lifts_a_unit_in_a_roll() -> void:
	var view: UnitView = add_child_autofree(UnitView.new())
	var rig: CameraRig = add_child_autofree(CameraRig.new())
	rig.current = true
	view.setup(a, Color.WHITE)
	view._process(0.016)
	assert_eq(view._material.get_shader_parameter(&"tumble"), Vector2.ZERO)
	_start(Vector2.RIGHT)
	for n in 8:
		w.tick()
	view._process(0.016)
	var tumble: Vector2 = view._material.get_shader_parameter(&"tumble")
	assert_lt(tumble.x, -1.0, "a roll to the east turns the body clockwise")
	assert_gt(tumble.y, 2.0, "pixels above the ground")


func test_shift_key_and_b_button_start_a_roll_of_the_player() -> void:
	var main: Control = add_child_autofree(load("res://main.tscn").instantiate())
	main.start_match({seed = 1, size = 2})
	main.game.world.bots_active = false
	var key := InputEventKey.new()
	key.physical_keycode = KEY_SHIFT
	var button := InputEventJoypadButton.new()
	button.button_index = JOY_BUTTON_B
	for event: InputEvent in [key, button]:
		event.pressed = true
		Input.parse_input_event(event)
		Input.flush_buffered_events()
		await wait_physics_frames(3)
		assert_true(main.game.player.rolling, event.as_text())
		event = event.duplicate()
		event.pressed = false
		Input.parse_input_event(event)
		await wait_physics_frames(60)
		assert_false(main.game.player.rolling, "the roll ends while the key is up")
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
