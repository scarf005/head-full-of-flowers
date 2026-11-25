extends GutTest
## Automatic vault on an empty map: unit 0 is the player at (0.5, 0.5), unit 1 is its enemy.

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


## Puts an obstacle on the cell from x to x + 1 in the row from y to y + 1.
func _block(mat: int, x := 2, solid := 1, y := 0) -> int:
	var cell := w.grid.cell_of(Vector2(x + 0.5, y + 0.5))
	var index := cell.y * w.grid.size + cell.x
	w.grid.set_cell(cell, mat)
	w.grid.solid[index] = solid
	return index


## Moves unit 0 with the move keys at `dir` for `ticks` ticks. Returns the number of vaults that started.
func _walk(dir: Vector2, ticks: int) -> int:
	a.move = dir
	var vaults := 0
	for n in ticks:
		w.tick()
		vaults += w.events.filter(func(e: Dictionary) -> bool: return e.type == &"vault").size()
		w.events.clear()
	return vaults


## Puts unit 0 0.05 m west of the fence from x 2 to 3 and walks it east until its vault ends. Returns the ticks
## of the vault.
func _vault_east() -> int:
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	a.move = Vector2.RIGHT
	var ticks := 0
	while ticks < 120 and (ticks == 0 or a.vaulting):
		w.tick()
		ticks += 1
	return ticks


func test_unit_that_walks_into_a_fence_a_hedge_a_window_or_a_low_prop_lands_east_of_it() -> void:
	for obstacle: Array in [
		[Defs.Mat.WALL, 1],
		[Defs.Mat.HEDGE, 1],
		[Defs.Mat.WAREHOUSE, ObstacleGrid.LOW],
		[Defs.Mat.PROP, ObstacleGrid.LOW]
	]:
		_block(obstacle[0], 2, obstacle[1])
		a.pos = Vector2(0.5, 0.5)
		assert_eq(_walk(Vector2.RIGHT, 20), 1, "material %d" % obstacle[0])
		while a.vaulting:
			w.tick()
		assert_almost_eq(a.pos, Vector2(3.0 + a.radius + 0.05, 0.5), Vector2.ONE * 0.001)


func test_unit_that_walks_along_a_fence_does_not_vault() -> void:
	for x in range(-3, 6):
		_block(Defs.Mat.WALL, x, 1, 1)
	a.pos = Vector2(0.5, 1.0 - a.radius - 0.01)
	assert_eq(_walk(Vector2.RIGHT, 30), 0)
	assert_lt(a.pos.y, 1.0)


func test_diagonal_move_vaults_along_its_larger_axis_and_keeps_the_other_coordinate() -> void:
	for y in range(-3, 6):
		_block(Defs.Mat.WALL, 2, 1, y)
	a.move = Vector2(0.8, 0.6)
	var start_y := 0.0
	for n in 30:
		w.tick()
		if a.vaulting and start_y == 0.0:
			start_y = a.pos.y
	assert_gt(start_y, 0.5, "the unit walks south-east to the fence")
	assert_gt(a.pos.x, 3.0 + a.radius)


func test_unit_that_moves_at_45_degrees_into_a_fence_slides_along_it() -> void:
	for y in range(-3, 9):
		_block(Defs.Mat.WALL, 2, 1, y)
	assert_eq(_walk(Vector2(1.0, 1.0).normalized(), 40), 0)
	assert_lt(a.pos.x, 2.0)
	assert_gt(a.pos.y, 1.5, "the unit slides south along the fence")


func test_unit_does_not_vault_a_high_wall_a_low_thing_with_a_wall_behind_it_or_4_low_cells() -> void:
	_block(Defs.Mat.WAREHOUSE)
	assert_eq(_walk(Vector2.RIGHT, 40), 0, "a house wall")
	_block(Defs.Mat.WALL)
	_block(Defs.Mat.ROCK, 3)
	a.pos = Vector2(0.5, 0.5)
	assert_eq(_walk(Vector2.RIGHT, 40), 0, "a fence with a rock behind it")
	for x in range(2, 6):
		_block(Defs.Mat.WALL, x)
	a.pos = Vector2(0.5, 0.5)
	assert_eq(_walk(Vector2.RIGHT, 40), 0, "4 fence cells")
	assert_lt(a.pos.x, 2.0)


func test_unit_vaults_3_low_cells_in_one_vault() -> void:
	for x in range(2, 5):
		_block(Defs.Mat.WALL, x)
	_vault_east()
	assert_almost_eq(a.pos.x, 5.0 + a.radius + 0.05, 0.001)


func test_unit_does_not_vault_to_a_landing_point_outside_the_arena() -> void:
	var x := ceili(w.arena_radius - 1.65)
	_block(Defs.Mat.WALL, x)
	a.pos = Vector2(x - a.radius - 0.05, 0.5)
	assert_eq(_walk(Vector2.RIGHT, 20), 0)


func test_vault_through_a_window_breaks_its_glass() -> void:
	var index := _block(Defs.Mat.WAREHOUSE, 2, ObstacleGrid.LOW)
	w.grid.glass[index] = true
	_vault_east()
	assert_false(w.grid.glass.has(index))
	assert_eq(w.events.filter(func(e: Dictionary) -> bool: return e.type == &"glass").size(), 1)


func test_shot_and_blast_hurt_a_unit_in_a_vault() -> void:
	_block(Defs.Mat.PROP, 2, ObstacleGrid.LOW)
	Tune.vault_speed = 0.5
	b.pos = Vector2(-2.5, 0.5)
	b.aim = Vector2.RIGHT
	b.want_fire = true
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	a.move = Vector2.RIGHT
	w.tick()
	b.want_fire = false
	while a.vaulting and a.hp == a.max_hp:
		w.tick()
	assert_true(a.vaulting, "the shot meets the unit before its vault ends")
	assert_lt(a.hp, a.max_hp)
	var hp := a.hp
	Combat.explode(w, a.pos, 3.0, 2.0, 1, false, &"grenade")
	assert_lt(a.hp, hp)


func test_unit_fires_and_throws_in_a_vault() -> void:
	_block(Defs.Mat.WALL)
	# The unit aims north, so its shot does not meet the fence.
	a.aim = Vector2.UP
	a.want_fire = true
	a.want_throw = true
	a.move = Vector2.RIGHT
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	w.tick()
	assert_true(a.vaulting)
	assert_eq(w.projectiles.size(), 1)
	assert_eq(w.throwables.size(), 1)


func test_unit_does_not_vault_with_auto_vault_off() -> void:
	_block(Defs.Mat.WALL)
	Tune.auto_vault = 0.0
	assert_eq(_walk(Vector2.RIGHT, 40), 0)
	assert_lt(a.pos.x, 2.0)


func test_vault_speed_of_2_halves_the_ticks_of_a_vault() -> void:
	_block(Defs.Mat.WALL)
	assert_eq(_vault_east(), 12, "1.7 m at 10 m/s in ticks of 0.0143 s")
	Tune.vault_speed = 2.0
	assert_eq(_vault_east(), 6)


func test_vault_delay_holds_the_start_until_the_unit_pushed_for_its_seconds() -> void:
	_block(Defs.Mat.WALL)
	Tune.vault_delay = 0.2
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	var ticks := ceili(0.2 / (Defs.TICK * Tune.game_speed))
	assert_eq(_walk(Vector2.RIGHT, ticks - 1), 0, "%d ticks are 0.2 s" % ticks)
	assert_eq(_walk(Vector2.RIGHT, 1), 1)


func test_vault_ends_0_25_s_after_the_time_that_its_distance_needs() -> void:
	_block(Defs.Mat.WALL)
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	_walk(Vector2.RIGHT, 1)
	a.vault_to = Vector2(20.0, 0.5)
	var ticks := 1
	while a.vaulting and ticks < 120:
		w.tick()
		ticks += 1
	assert_eq(ticks, ceili((1.7 / a.speed + 0.25) / (Defs.TICK * Tune.game_speed)))


func test_view_lifts_a_unit_in_a_vault_and_does_not_turn_it() -> void:
	_block(Defs.Mat.WALL)
	var view: UnitView = add_child_autofree(UnitView.new())
	var rig: CameraRig = add_child_autofree(CameraRig.new())
	rig.current = true
	view.setup(a, Color.WHITE)
	view._process(0.016)
	assert_eq(view._material.get_shader_parameter(&"tumble"), Vector2.ZERO)
	a.pos = Vector2(2.0 - a.radius - 0.05, 0.5)
	_walk(Vector2.RIGHT, 6)
	view._process(0.016)
	assert_eq(view._material.get_shader_parameter(&"tumble"), Vector2(0.0, UnitView.HOP))


func test_game_has_no_roll_action() -> void:
	var main: Control = add_child_autofree(load("res://main.tscn").instantiate())
	assert_false(main.ACTIONS.has(&"roll"))
	assert_false(InputMap.has_action(&"roll"))
