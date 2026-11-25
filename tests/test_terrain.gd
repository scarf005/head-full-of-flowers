extends GutTest
## Terrain and props in a fight on an empty map: units 0 and 1 are enemies in a 2-unit free-for-all.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(0, 0.5)
	b.pos = Vector2(6, 0.5)
	a.aim = Vector2.RIGHT
	w.pickups.clear()
	w.bots_active = false


func after_each() -> void:
	Tune.reset()


func _tick(count: int) -> void:
	for n in count:
		w.tick()


## Adds a solid prop to the empty map and rebuilds the obstacle grid. Returns the cell under `at`.
func _prop(kind: StringName, at: Vector2, cells := Vector2i.ONE) -> Vector2i:
	w.map.props.append({kind = kind, x = at.x, y = at.y, width = cells.x, height = cells.y, solid = true})
	w.grid = w.map.build_grid()
	return w.grid.cell_of(at)


func test_shot_barrel_explodes_for_the_shooter_and_sets_off_the_barrel_next_to_it() -> void:
	# Shot hits barrel 1 at x 3.5. Its blast reaches barrel 2 at x 6.5, whose blast reaches b at x 8.
	var barrels := [_prop(&"barrel", Vector2(3.5, 0.5)), _prop(&"barrel", Vector2(6.5, 0.5))]
	a.pos = Vector2(-2, 0.5)
	b.pos = Vector2(8, 0.5)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(30)
	assert_true(barrels.all(func(c: Vector2i) -> bool: return not w.grid.is_solid(c)), "both barrels are gone")
	assert_eq(w.events.filter(func(e: Dictionary) -> bool: return e.type == &"explosion").size(), 2)
	assert_lt(b.hp, 10.0)
	assert_gt(w.flowers.score(0), 0, "the shooter's team scores the petals")


func test_fire_does_not_burn_on_water() -> void:
	w.map.tiles.fill(TerrainMap.Tile.WATER)
	Shots.add_zone(w, Vector2(3, 0), 0, &"molotov")
	assert_eq(w.zones.size(), 0)
	w.map.tiles.fill(TerrainMap.Tile.GRASS)
	Shots.add_zone(w, Vector2(3, 0), 0, &"molotov")
	assert_eq(w.zones.size(), 1)


## Checks that sight, a pistol shot and a grenade from a reach b over cover whose near face is at x `face`, and that
## a walks to the face and stops there with the automatic vault off.
func _assert_low_cover(face: float) -> void:
	Tune.auto_vault = 0.0
	assert_lt(w.grid.ray_cell(a.pos, b.pos).x, 0, "a bot sees over the cover")
	a.move = Vector2.RIGHT
	_tick(60)
	assert_lt(a.pos.x, face - a.radius + 0.01)
	a.move = Vector2.ZERO
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(20)
	assert_eq(b.hp, 8.0, "the pistol shot flies over the cover")
	a.want_throw = true
	_tick(1)
	a.want_throw = false
	_tick(40)
	assert_eq(b.deaths, 1, "the grenade flies over the cover")


func test_shots_grenades_and_sight_pass_over_a_table_that_stops_a_walk_with_the_vault_off() -> void:
	_prop(&"table", Vector2(3, 0.5), Vector2i(2, 1))
	_assert_low_cover(2.0)


## Adds a wall of `kind` that runs north-south at x 3 to 4, with a window on the line from a to b.
func _window(kind := &"house") -> void:
	var rows := [PackedByteArray([1]), PackedByteArray([ObstacleGrid.LOW]), PackedByteArray([1])]
	w.map.obstacles.append({kind = kind, x = 3.5, y = 0.5, width = 1, height = 3, tiles = rows})
	w.grid = w.map.build_grid()


func test_shots_grenades_and_sight_pass_a_window_that_stops_a_walk_with_the_vault_off() -> void:
	_window()
	_assert_low_cover(3.0)


func test_first_shot_through_a_window_breaks_its_glass() -> void:
	_window()
	for n in 2:
		a.want_fire = true
		_tick(1)
		a.want_fire = false
		_tick(30)
	assert_eq(_window_events(), [{type = &"glass", cell = w.grid.cell_of(Vector2(3.5, 0.5))}] as Array[Dictionary])
	assert_eq(b.hp, 6.0, "the 2 shots pass the window")


## Moves a pistol shot to 0.1 m west of the window. Its next step of 0.5 m ends in the cell of the window.
func _shot_at_the_window() -> Dictionary:
	_window()
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	var shot := w.projectiles[0]
	shot.pos = Vector2(2.9, 0.5)
	return shot


func test_shot_that_ends_its_flight_in_a_window_breaks_its_glass() -> void:
	_shot_at_the_window().ttl = 0.001
	_tick(1)
	assert_true(w.projectiles.is_empty(), "the shot is spent")
	assert_eq(_window_events().size(), 1)


func test_shot_that_meets_the_arena_border_in_a_window_breaks_its_glass() -> void:
	_shot_at_the_window()
	w.arena_start = 3.3
	w.arena_end = 3.3
	_tick(1)
	assert_eq(_window_events().size(), 1)


func test_grenade_that_flies_through_a_window_breaks_its_glass() -> void:
	_window()
	a.want_throw = true
	_tick(1)
	a.want_throw = false
	while not w.throwables.is_empty() and w.throwables[0].pos.x < 4.5:
		_tick(1)
	assert_eq(w.throwables.size(), 1, "the grenade is past the window and has not blown up")
	assert_eq(_window_events().size(), 1)


func test_blast_breaks_the_glass_of_a_window() -> void:
	_window()
	Combat.explode(w, Vector2(1.5, 0.5), Shots.BLAST_RADIUS, 0.0, 0, true, &"grenade")
	assert_eq(_window_events().size(), 1)


func test_gap_in_a_hedge_has_no_glass() -> void:
	_window(&"hedge")
	a.want_fire = true
	_tick(30)
	assert_eq(_window_events().size(), 0)


func _window_events() -> Array[Dictionary]:
	return w.events.filter(func(e: Dictionary) -> bool: return e.type == &"glass")


func test_bookshelf_blocks_shots_and_sight() -> void:
	_prop(&"bookshelf", Vector2(3, 0.5), Vector2i(2, 1))
	assert_gt(w.grid.ray_cell(a.pos, b.pos).x, 0)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(20)
	assert_eq(b.hp, 10.0)


func test_rifle_shot_passes_a_thick_hedge_at_half_damage_once() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	for x in [2.5, 3.5]:
		w.grid.set_cell(w.grid.cell_of(Vector2(x, 0.5)), Defs.Mat.HEDGE)
	assert_gt(w.grid.ray_cell(a.pos, b.pos).x, 0, "a bot does not see through the hedge")
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(20)
	assert_eq(b.hp, 8.5, "3 damage, halved once")


func test_crate_breaks_on_the_third_rifle_hit() -> void:
	var cell := _prop(&"crate", Vector2(3.5, 0.5))
	for n in 2:
		w.hit_cell(cell, 3.0, 0)
	assert_true(w.grid.is_solid(cell))
	w.hit_cell(cell, 3.0, 0)
	assert_false(w.grid.is_solid(cell))
	assert_false(w.events.any(func(e: Dictionary) -> bool: return e.type == &"explosion"))


func test_unit_that_shoots_a_barrel_3_m_away_is_hurt_but_does_not_die() -> void:
	_prop(&"barrel", Vector2(3.5, 0.5))
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(30)
	assert_lt(a.hp, 10.0, "the blast reaches 3.8 m")
	assert_eq(a.deaths, 0, "only the unit's own grenade, shell or rocket kills it at once")


func test_loot_box_does_not_land_on_a_rug() -> void:
	w.map.props.append({kind = &"rug", x = 0.0, y = 0.0, width = 12, height = 12, solid = false})
	w.grid = w.map.build_grid()
	for n in 40:
		Loot.spawn_box(w)
	var boxes := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"box")
	assert_gt(boxes.size(), 20)
	for e: Dictionary in boxes:
		var at := w.grid.center_of(e.cell)
		assert_gt(maxf(absf(at.x), absf(at.y)), 6.0, "box at %s" % at)


func test_blast_reaches_a_barrel_by_its_near_edge() -> void:
	# The middle of the barrel is 4.1 m from the blast and its near edge is 3.6 m from it. The blast reaches 3.8 m.
	var barrel := _prop(&"barrel", Vector2(4.5, 0.5))
	Combat.explode(w, Vector2(0.4, 0.5), Shots.BLAST_RADIUS, 0.0, -1, true, &"grenade")
	assert_false(w.grid.is_solid(barrel))


func test_rifle_shot_that_clips_the_corner_of_a_hedge_loses_half_its_damage() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	a.want_fire = true
	_tick(1)
	var hedge := w.grid.cell_of(Vector2(3.5, 3.5))
	w.grid.set_cell(hedge, Defs.Mat.HEDGE)
	# One step from (2.9, 3.3) to (3.3, 2.9): both ends are out of the hedge cell and the middle is in its corner.
	var p := w.projectiles[0]
	var damage: float = p.damage
	p.pos = Vector2(2.9, 3.3)
	p.vel = Vector2(40, -40)
	Shots._step_projectile(w, p, 0.01)
	assert_eq(p.damage, damage * 0.5)


func test_rifle_shot_hits_a_unit_in_front_of_a_hedge_or_a_wall_with_its_whole_damage() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	a.want_fire = true
	_tick(1)
	var cell := w.grid.cell_of(Vector2(3.5, 3.5))
	b.pos = Vector2(2.5, 3.5)
	for mat: int in [Defs.Mat.HEDGE, Defs.Mat.ROCK]:
		w.grid.set_cell(cell, mat)
		var cover: float = w.grid.hp[cell.y * w.grid.size + cell.x]
		var health := b.hp
		# One step from (1.9, 3.5) to (3.1, 3.5): through the unit and then 0.1 m into the cell behind it.
		var p := w.projectiles[0].duplicate()
		p.pos = Vector2(1.9, 3.5)
		p.vel = Vector2(60, 0)
		var damage: float = p.damage
		assert_false(Shots._step_projectile(w, p, 0.02), "the shot stops at the unit")
		assert_eq(health - b.hp, damage, "damage to the unit")
		assert_eq(w.grid.hp[cell.y * w.grid.size + cell.x], cover, "the shot does not reach the cell")


func test_rifle_shot_hits_the_nearer_of_2_units_on_one_step() -> void:
	var world := SimWorld.new({seed = 7, size = 3}, TerrainMap.new())
	world.bots_active = false
	Arsenal.equip(world.units[0], &"assault", 60.0)
	world.units[0].want_fire = true
	world.tick()
	# The far unit is the first one in the list of units.
	var far := world.units[1]
	var near := world.units[2]
	far.pos = Vector2(2.9, 3.5)
	near.pos = Vector2(2.3, 3.5)
	var health := [far.hp, near.hp]
	# One step from (1.5, 3.5) to (2.7, 3.5) goes through the near unit and 0.2 m into the far unit.
	var p := world.projectiles[0]
	p.pos = Vector2(1.5, 3.5)
	p.vel = Vector2(60, 0)
	Shots._step_projectile(world, p, 0.02)
	assert_eq([far.hp, near.hp], [health[0], health[1] - p.damage])


func test_fire_bottle_that_lands_stops_the_match_for_a_moment() -> void:
	a.secondary = &"molotov"
	a.want_throw = true
	# Out of the fire: a hit on a unit stops the match for longer.
	b.pos = Vector2(0, 20)
	var stop := 0.0
	for n in 80:
		w.tick()
		a.want_throw = false
		stop = maxf(stop, w.hit_stop)
	assert_eq(w.zones.size(), 1)
	assert_almost_eq(stop, 0.006, 0.001, "as in the original game")
