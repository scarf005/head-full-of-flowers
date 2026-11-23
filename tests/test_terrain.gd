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


func test_crate_breaks_on_the_third_rifle_hit() -> void:
	var cell := _prop(&"crate", Vector2(3.5, 0.5))
	for n in 2:
		w.hit_cell(cell, 3.0, 0)
	assert_true(w.grid.is_solid(cell))
	w.hit_cell(cell, 3.0, 0)
	assert_false(w.grid.is_solid(cell))
	assert_false(w.events.any(func(e: Dictionary) -> bool: return e.type == &"explosion"))
