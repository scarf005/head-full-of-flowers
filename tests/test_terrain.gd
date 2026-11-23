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
## a walks to the face and stops there.
func _assert_low_cover(face: float) -> void:
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


func test_shots_grenades_and_sight_pass_over_a_table_that_units_walk_around() -> void:
	_prop(&"table", Vector2(3, 0.5), Vector2i(2, 1))
	_assert_low_cover(2.0)


func test_shots_grenades_and_sight_pass_a_window_that_units_do_not_walk_through() -> void:
	var rows := [PackedByteArray([1]), PackedByteArray([ObstacleGrid.LOW]), PackedByteArray([1])]
	w.map.obstacles.append({kind = &"house", x = 3.5, y = 0.5, width = 1, height = 3, tiles = rows})
	w.grid = w.map.build_grid()
	_assert_low_cover(3.0)


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
