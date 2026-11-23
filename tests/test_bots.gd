extends GutTest
## Bot brain on an empty map with hand-placed cells. Unit 0 thinks as a bot. Unit 1 is a still enemy.

const DT := Defs.TICK * Defs.GAME_SPEED

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(-2, 0)
	b.pos = Vector2(2, 0)
	w.pickups.clear()
	w.bots_active = false


## Runs `count` ticks in which only unit 0 thinks. Returns how many ticks end with its centre in a solid cell.
func _run(count: int) -> int:
	var inside := 0
	for n in count:
		Bots.think(w, a, DT)
		w.tick()
		inside += 1 if w.grid.is_solid(w.grid.cell_of(a.pos)) else 0
	return inside


## A wall of ROCK cells at world column x from row y0 to row y1, both included.
func _wall(x: int, y0: int, y1: int) -> void:
	for y in range(y0, y1 + 1):
		w.grid.set_cell(w.grid.cell_of(Vector2(x + 0.5, y + 0.5)), Defs.Mat.ROCK)


func test_bot_walks_around_wall_and_hits_enemy() -> void:
	_wall(0, -4, 4)
	assert_eq(_run(300), 0, "the bot centre never enters a wall cell")
	assert_gt(w.flowers.score(0), 0, "the bot finds a line of sight around the 9-cell wall and hits")


func test_bot_does_not_fire_without_line_of_sight() -> void:
	_wall(0, -30, 30)
	_run(120)
	assert_eq(a.shots_fired, 0)


func test_bot_outside_arena_walks_inward() -> void:
	a.pos = Vector2(w.arena_radius + 1.0, 0)
	Bots.think(w, a, DT)
	assert_gt(a.move.normalized().dot(Vector2.LEFT), 0.9, "the first move points at the centre")
	_run(60)
	assert_lt(a.pos.length(), w.arena_radius - 3.0)


func test_bot_reloads_empty_magazine() -> void:
	a.slot().ammo = 0.0
	_run(1)
	assert_gt(a.reload_cooldown, 0.0)


func test_bot_collects_nearby_weapon() -> void:
	b.pos = Vector2(-22, 0)
	Loot.spawn_weapon(w, Vector2(6, 4), 0.0)
	_run(240)
	assert_eq(a.slots.size(), 2, "the bot now holds a second weapon")
	assert_eq(w.pickups.size(), 0)


func test_bot_does_not_throw_at_enemy_2m_away() -> void:
	w.hard = true
	for n in 300:
		b.pos = a.pos + Vector2(2, 0)
		_run(1)
	assert_eq(a.secondary_cooldown_max, 0.0, "a grenade at 2 m kills the thrower")


func test_bot_throws_at_enemy_10m_away() -> void:
	w.hard = true
	for n in 300:
		b.pos = a.pos + Vector2(10, 0)
		_run(1)
	assert_gt(a.secondary_cooldown_max, 0.0)


func test_full_match_plants_flowers_for_every_team() -> void:
	var world := _walled_world(5)
	while not world.finished:
		world.tick()
	for team in world.team_count:
		assert_gt(world.flowers.score(team), 0, "team %d planted flowers" % team)
	for u in world.units:
		assert_false(world.grid.is_solid(world.grid.cell_of(u.pos)), "unit %d is not in a wall" % u.index)


func test_same_seed_gives_same_bot_match() -> void:
	var runs := []
	for run in 2:
		var world := _walled_world(9)
		for n in 900:
			world.tick()
		runs.append([world.standings(), world.units.map(func(u: SimUnit) -> Vector2: return u.pos)])
	assert_eq(runs[0], runs[1])


func test_eleven_bots_think_under_budget() -> void:
	var world := _walled_world(4, 12)
	world.units[0].is_player = true
	world.bots_active = false
	var spent := 0
	for n in 1800:
		var start := Time.get_ticks_usec()
		for u in world.units:
			if not u.is_player:
				Bots.think(world, u, DT)
		spent += Time.get_ticks_usec() - start
		world.tick()
	var per_tick := spent / 1800.0 / 1000.0
	gut.p("11 bots: %.3f ms per tick" % per_tick)
	assert_lt(per_tick, 1.5)


## A free-for-all with six short walls and six boxes in which all units are bots.
func _walled_world(seed: int, size := 8) -> SimWorld:
	var world := SimWorld.new({seed = seed, size = size}, TerrainMap.new())
	world.units[0].is_player = false
	for i in 6:
		var at := Vector2.from_angle(i * TAU / 6.0) * 14.0
		for k in 7:
			world.grid.set_cell(
				world.grid.cell_of(at + Vector2.from_angle(i * 1.1).orthogonal() * (k - 3)), Defs.Mat.ROCK
			)
		world.grid.set_cell(world.grid.cell_of(at * 0.5), Defs.Mat.BOX)
	return world


func test_border_escape_starts_at_1_5_m_and_ends_at_3_m() -> void:
	b.pos = Vector2(-w.arena_radius + 6.0, 0)
	var flags := []
	for from_border: float in [1.0, 2.5, 3.5, 2.5]:
		a.pos = Vector2(w.arena_radius - from_border, 0)
		Bots.think(w, a, DT)
		flags.append(a.ai_edge)
	assert_eq(flags, [true, true, false, false], "at 1.0, 2.5, 3.5 and again 2.5 m from the border")


func test_bot_takes_a_weapon_5_m_from_the_border_but_not_1_m_from_it() -> void:
	b.pos = Vector2(-w.arena_radius + 6.0, 0)
	a.pos = Vector2(w.arena_radius - 8.0, 0)
	Loot.spawn_weapon(w, Vector2(w.arena_radius - 1.0, 0), 1.0, true)
	Bots.think(w, a, DT)
	assert_ne(a.ai_state, &"loot", "weapon in the border margin")
	w.pickups[0].pos = Vector2(w.arena_radius - 5.0, 0)
	a.ai_sense_timer = 0.0
	Bots.think(w, a, DT)
	assert_eq(a.ai_state, &"loot")


func test_hunter_keeps_its_goal_while_the_enemy_moves_behind_a_wall() -> void:
	_wall(0, -12, 12)
	Bots.think(w, a, DT)
	assert_eq(a.ai_state, &"hunt")
	assert_eq(a.ai_goal, Vector2(2, 0))
	b.pos = Vector2(2, 5)
	for n in 20:
		Bots.think(w, a, DT)
	assert_eq(a.ai_goal, Vector2(2, 0), "no new goal before the next decision")


func test_hunt_goal_for_an_enemy_at_the_border_is_free_and_near_the_margin() -> void:
	b.pos = Vector2(w.arena_radius - 1.0, 0)
	var clamped := Vector2(w.arena_radius - Bots.EDGE_MARGIN, 0)
	w.grid.set_cell(w.grid.cell_of(clamped), Defs.Mat.ROCK)
	var goal := Bots._hunt_goal(w, b)
	assert_false(w.grid.circle_hits(goal, 0.9), "goal is free")
	assert_lt(goal.distance_to(clamped), 2.5)
