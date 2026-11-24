extends GutTest
## Trails behind shots and thrown things. On an empty map unit 0 fires along +x at unit 1.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2.ZERO
	a.aim = Vector2.RIGHT
	b.pos = Vector2(6.0, 0.0)
	w.pickups.clear()
	w.bots_active = false


func after_each() -> void:
	Tune.reset()


func _events(type: StringName) -> Array[Dictionary]:
	return w.events.filter(func(e: Dictionary) -> bool: return e.type == type)


func _view() -> GameView:
	var view: GameView = autofree(GameView.new())
	view.autoplay = true
	add_child(view)
	view.setup({seed = 1, size = 2})
	view.world.bots_active = false
	return view


func test_bullet_leaves_a_streak_for_each_8_cm_of_its_flight() -> void:
	var trails: Trails = autofree(Trails.new())
	trails.follow(&"bullet", Vector3(10.0, 0.6, 0.0), Vector2(44.0, 0.0), 1.0, 0.0, 0.101)
	assert_eq(trails.added(), 55, "4.44 m of flight")
	var newest := trails.part(54)
	assert_almost_eq(newest.at, Vector3(9.956, 0.6, 0.0), Vector3.ONE * 0.001, "0.001 s behind the bullet")
	assert_almost_eq(newest.born, 0.1, 0.0001)


func test_trail_has_the_same_parts_at_each_frame_rate() -> void:
	var one: Trails = autofree(Trails.new())
	var many: Trails = autofree(Trails.new())
	var vel := Vector2(30.0, 0.0)
	var at := func(now: float) -> Vector3: return Vector3(vel.x * now, 0.6, 0.0)
	one.follow(&"bullet", at.call(0.213), vel, 1.0, 0.0, 0.213)
	var from := 0.0
	for n in 10:
		var now := 0.0213 * (n + 1)
		many.follow(&"bullet", at.call(now), vel, 1.0, from, now)
		from = now
	assert_eq(many.added(), one.added())
	for slot in one.added():
		assert_almost_eq(many.part(slot).born, one.part(slot).born, 0.0001)
		assert_almost_eq(many.part(slot).at, one.part(slot).at, Vector3.ONE * 0.0001)
	many.follow(&"bullet", at.call(from), vel, 1.0, from, from)
	assert_eq(many.added(), one.added(), "a second frame at the same match time adds no part")


func test_trail_starts_at_the_muzzle() -> void:
	var trails: Trails = autofree(Trails.new())
	trails.follow(&"bullet", Vector3(10.0, 0.6, 0.0), Vector2(44.0, 0.0), 0.01, 0.0, 0.101)
	assert_eq(trails.added(), 5, "0.44 m of flight")
	for slot in trails.added():
		assert_gt(trails.part(slot).at.x, 10.0 - 0.44)


func test_slow_thing_leaves_no_trail() -> void:
	var trails: Trails = autofree(Trails.new())
	trails.follow(&"grenade", Vector3.ZERO, Vector2(0.15, 0.0), 1.0, 0.0, 1.0)
	assert_eq(trails.added(), 0)


func test_debug_numbers_set_the_life_width_and_alpha_of_a_streak() -> void:
	var trails: Trails = autofree(Trails.new())
	trails.follow(&"bullet", Vector3.ZERO, Vector2(44.0, 0.0), 1.0, 0.0, 0.002)
	Tune.trail_length = 2.0
	Tune.trail_width = 3.0
	Tune.trail_alpha = 2.0
	trails.follow(&"bullet", Vector3.ZERO, Vector2(44.0, 0.0), 1.0, 0.002, 0.004)
	assert_eq(trails.added(), 2)
	# At 44 m/s: life 0.22 s, width 0.152 m, alpha 0.22.
	for slot in 2:
		var part := trails.part(slot)
		assert_almost_eq(part.life, 0.22 * (1.0 + slot), 0.001)
		assert_almost_eq(part.width, 0.152 * (1.0 + slot * 2.0), 0.001)
		assert_almost_eq(part.color.a, 0.22 * (1.0 + slot), 0.001)


func test_rocket_leaves_smoke_puffs_with_the_colours_of_the_original() -> void:
	var trails: Trails = autofree(Trails.new())
	trails.follow(&"rocket", Vector3.ZERO, Vector2(18.0, 0.0), 1.0, 0.0, 0.0051)
	assert_eq(trails.added(), 4, "4 puffs for each 0.09 m")
	for slot in 4:
		var part := trails.part(slot)
		assert_true(
			part.color.is_equal_approx(Color("30363d", 0.78)) or part.color.is_equal_approx(Color("1f252b", 0.66))
		)
		assert_true(part.puff)
		assert_lt(part.at.x, 0.0, "behind the rocket")
	Tune.smoke_puffs = 2.0
	trails.follow(&"rocket", Vector3.ZERO, Vector2(18.0, 0.0), 1.0, 0.0051, 0.0101)
	assert_eq(trails.added(), 6)


func test_shot_that_hits_a_unit_is_spent_where_it_meets_the_unit() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in 30:
		w.tick()
	var hits := _events(&"hit")
	var spent := _events(&"spent")
	assert_eq(hits.size(), 1)
	assert_eq(spent.size(), 1)
	assert_eq(spent[0].kind, &"ballistic")
	assert_eq(spent[0].pos, hits[0].pos)
	assert_lt(spent[0].pos.x, b.pos.x, "on the near side of the unit")


func test_thrown_grenade_lands_with_its_seconds_of_flight() -> void:
	b.pos = Vector2(0.0, 20.0)
	Shots.throw_secondary(w, a)
	var ticks := 0
	while _events(&"landed").is_empty() and ticks < 200:
		w.tick()
		ticks += 1
	var landed := _events(&"landed")
	assert_eq(landed.size(), 1)
	assert_false(landed[0].molotov)
	assert_almost_eq(landed[0].flown, w.step * ticks, 0.001)


func test_view_adds_trail_parts_for_the_match_time_of_each_frame_only() -> void:
	var view := _view()
	var u := view.world.units[0]
	Arsenal.equip(u, &"assault", 60.0)
	# The shot flies 2 m in the 3 ticks. The unit aims along a line with 4 m of free ground.
	var free := func(aim: Vector2) -> bool: return view.world.grid.ray_cell(u.pos, u.pos + aim * 4.0).x < 0
	u.aim = [Vector2.RIGHT, Vector2.DOWN, Vector2.LEFT, Vector2.UP].filter(free)[0]
	assert_true(Combat.fire(view.world, u))
	for n in 3:
		view.world.tick()
	view._process(0.01)
	var parts := view._trails.added()
	assert_gt(parts, 0)
	view._process(0.01)
	assert_eq(view._trails.added(), parts, "a second frame at the same match time adds no part")


func test_spent_shot_gets_its_last_streaks_at_the_place_where_it_stopped() -> void:
	var view := _view()
	var at := Vector2(3.0, 1.0)
	view.world.now = 0.1009
	view._drawn = 0.0905
	view._show({type = &"spent", pos = at, vel = Vector2(40.0, 0.0), kind = &"ballistic", travelled = 0.4})
	# 0.4 m of flight in the last 0.01 s gives 5 streaks, and the end adds 2.
	assert_eq(view._trails.added(), 7)
	assert_eq(view._trails.part(5).at, Vector3(at.x, GameView.SHOT_HEIGHT, at.y))


func test_view_keeps_its_drawn_time_when_the_lag_of_a_frame_puts_it_back() -> void:
	var view := _view()
	view.world.now = 1.0
	view._drawn = 1.2
	view._process(0.01)
	assert_eq(view._drawn, 1.2)
	view.world.now = 1.5
	view._process(0.01)
	assert_gt(view._drawn, 1.2)


func test_rocket_model_points_along_the_flight_with_the_debug_size() -> void:
	Tune.rocket_size = 2.0
	var place := Rockets.place(Vector3(1.0, 0.6, 2.0), Vector2(0.0, 30.0), 0.7)
	assert_eq(place.origin, Vector3(1.0, 0.6, 2.0))
	assert_almost_eq(place.basis.x, Vector3(0.0, 0.0, 2.0), Vector3.ONE * 0.001, "nose south, twice as long")
	assert_almost_eq(place.basis.y.length(), 2.0, 0.001)


func test_rocket_shows_as_one_model_and_no_teardrop() -> void:
	var view := _view()
	view.world.pickups.clear()
	Arsenal.equip(view.world.units[0], &"rocket-launcher", 10.0)
	assert_true(Combat.fire(view.world, view.world.units[0]))
	view._process(0.01)
	var model := view._rockets.multimesh
	assert_eq(model.visible_instance_count, 1)
	assert_eq(view._air.multimesh.visible_instance_count, 0, "no flat teardrop")
	view.world.projectiles.clear()
	view._process(0.01)
	assert_eq(model.visible_instance_count, 0)
