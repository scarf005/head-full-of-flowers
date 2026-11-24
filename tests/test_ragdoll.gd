extends GutTest
## Bodies of killed units fly away from the hit and turn, as the ragdolls of the original do.

var grid: ObstacleGrid
var ragdolls: Ragdolls


func before_each() -> void:
	grid = ObstacleGrid.new(40)
	ragdolls = autofree(Ragdolls.new())


func after_each() -> void:
	Tune.reset()


func _fly(seconds: float) -> void:
	for n in roundi(seconds / 0.01):
		ragdolls.step(0.01, grid)


func test_kill_event_has_the_place_where_the_unit_died() -> void:
	var w := SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	var target := w.units[1]
	target.pos = Vector2(6.0, 0.0)
	Combat.damage(w, target, target.hp + 1.0, 0, target.pos, Vector2(3.0, 0.0), &"shot")
	var hits := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"hit")
	assert_true(hits[0].kill)
	assert_eq(hits[0].target_pos, Vector2(6.0, 0.0))


func test_body_flies_the_damage_in_metres_in_the_flight_time_then_is_gone() -> void:
	ragdolls.throw(Vector2.ZERO, Vector2.RIGHT, 4.0, 0.4, Color.RED)
	_fly(0.2)
	assert_almost_eq(ragdolls.bodies[0].pos.x, 4.0 * 0.2 / 0.35, 0.01)
	_fly(0.14)
	assert_almost_eq(ragdolls.bodies[0].pos.x, 4.0 * 0.34 / 0.35, 0.01)
	_fly(0.02)
	assert_eq(ragdolls.bodies.size(), 0)


func test_body_turns_at_most_14_radians_a_second_after_20_damage() -> void:
	for n in 20:
		ragdolls.throw(Vector2.ZERO, Vector2.RIGHT, 20.0, 0.4, Color.RED)
	for body in ragdolls.bodies:
		assert_lte(absf(body.spin), 14.0)
		assert_lte(absf(body.turn), 0.36)


func test_debug_numbers_set_the_reach_time_and_turn_of_a_body() -> void:
	Tune.ragdoll_reach = 0.5
	Tune.ragdoll_time = 0.7
	Tune.ragdoll_spin = 0.0
	ragdolls.throw(Vector2.ZERO, Vector2.UP, 100.0, 0.4, Color.RED)
	var body: Dictionary = ragdolls.bodies[0]
	assert_eq(body.life, 14.0, "28 m at most, then half")
	assert_almost_eq(body.vel, Vector2(0.0, -20.0), Vector2.ONE * 0.001)
	var turn: float = body.turn
	_fly(0.3)
	assert_eq(body.turn, turn, "no spin")


func test_body_bounces_back_off_a_house_wall() -> void:
	for y in range(-3, 3):
		grid.set_cell(grid.cell_of(Vector2(3.5, y + 0.5)), Defs.Mat.WAREHOUSE)
	ragdolls.throw(Vector2.ZERO, Vector2.RIGHT, 20.0, 0.4, Color.RED)
	var furthest := 0.0
	for n in 30:
		ragdolls.step(0.01, grid)
		furthest = maxf(furthest, ragdolls.bodies[0].pos.x)
	assert_between(furthest, 2.0, 2.6, "the body stops before it touches the wall")
	assert_lt(ragdolls.bodies[0].vel.x, -20.0, "72 % of the speed comes back")


func test_view_throws_a_body_for_a_kill_only() -> void:
	var view: GameView = autofree(GameView.new())
	add_child(view)
	view.setup({seed = 1, size = 2})
	var hit := {
		type = &"hit",
		target = 1,
		source = 0,
		pos = Vector2(1.0, 2.0),
		dir = Vector2.RIGHT,
		damage = 3.0,
		kill = false,
		team = 0,
		weapon = &"pistol",
		target_pos = Vector2(1.0, 2.0)
	}
	view._show(hit)
	assert_eq(view._ragdolls.bodies.size(), 0)
	hit.kill = true
	view._show(hit)
	assert_eq(view._ragdolls.bodies.size(), 1)
	assert_eq(view._ragdolls.bodies[0].pos, Vector2(1.0, 2.0))
