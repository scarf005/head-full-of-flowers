extends GutTest
## Fire on obstacle cells and the marks of blasts and fires on an empty map. Units 0 and 1 are enemies.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(-10.0, 0.5)
	b.pos = Vector2(10.0, 0.5)
	w.pickups.clear()
	w.bots_active = false
	Tune.hit_stop = 0.0


func after_each() -> void:
	Tune.reset()


func _seconds(time: float) -> void:
	for n in ceili(time / (Defs.TICK * Tune.game_speed)):
		w.tick()


func _events(type: StringName) -> Array[Dictionary]:
	return w.events.filter(func(e: Dictionary) -> bool: return e.type == type)


## Adds a prop to the empty map and rebuilds the obstacle grid. Returns the cell under `at`.
func _prop(kind: StringName, at: Vector2, cells := Vector2i.ONE) -> Vector2i:
	w.map.props.append({kind = kind, x = at.x, y = at.y, width = cells.x, height = cells.y, solid = true})
	w.grid = w.map.build_grid()
	return w.grid.cell_of(at)


func _hedges(from: Vector2, count: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for n in count:
		cells.append(w.grid.cell_of(from + Vector2(n, 0.0)))
		w.grid.set_cell(cells[-1], Defs.Mat.HEDGE)
	return cells


func test_molotov_sets_a_table_on_fire_and_the_table_breaks_after_the_burn_time() -> void:
	Tune.burn_time = 2.0
	var table := _prop(&"table", Vector2(1.0, 0.5), Vector2i(2, 1))
	Shots.add_zone(w, Vector2(1.0, 2.5), 0, &"molotov")
	w.tick()
	assert_true(w.burning.has(table.y * w.grid.size + table.x))
	assert_eq(_events(&"ignite").size(), 2, "both cells of the table")
	_seconds(1.9)
	assert_true(w.grid.is_damageable(table))
	_seconds(0.2)
	assert_false(w.grid.is_damageable(table))
	assert_true(w.burning.is_empty())
	assert_eq(_events(&"burnt").size(), 2)


func test_wall_and_rocks_do_not_burn() -> void:
	var rocks := _prop(&"rocks", Vector2(3.5, 0.5))
	var wall := w.grid.cell_of(Vector2(0.5, 0.5))
	w.grid.set_cell(wall, Defs.Mat.WALL)
	Burn.ignite(w, wall, 0, &"flamethrower")
	Burn.ignite(w, rocks, 0, &"flamethrower")
	Shots.add_zone(w, Vector2(2.0, 1.5), 0, &"molotov")
	_seconds(1.0)
	assert_true(w.burning.is_empty())
	assert_eq(_events(&"ignite").size(), 0)


func test_blast_sets_on_fire_the_prop_that_it_does_not_break() -> void:
	var crate := _prop(&"crate", Vector2(2.5, 0.5))
	var table := _prop(&"table", Vector2(-1.5, 0.5))
	Combat.explode(w, Vector2(0.5, 0.5), Shots.BLAST_RADIUS, 0.0, 0, true, &"grenade")
	assert_true(w.burning.has(crate.y * w.grid.size + crate.x), "9 hit points of a crate stay after the blast")
	assert_false(w.grid.is_damageable(table))
	assert_false(w.burning.has(table.y * w.grid.size + table.x))


func test_fire_goes_along_a_hedge_row_at_spread_1_and_stays_at_spread_0() -> void:
	Tune.burn_time = 10.0
	Tune.burn_spread = 1.0
	var row := _hedges(Vector2(0.5, 0.5), 5)
	Burn.ignite(w, row[0], 0, &"flamethrower")
	_seconds(4.1)
	assert_eq(w.burning.size(), 5)
	w.burning.clear()
	Tune.burn_spread = 0.0
	Burn.ignite(w, row[0], 0, &"flamethrower")
	_seconds(2.1)
	assert_eq(w.burning.size(), 1)


func test_unit_next_to_a_burning_cell_loses_hp_and_its_death_counts_for_the_unit_that_lit_the_fire() -> void:
	Tune.knockback = 0.0
	var hedge := _hedges(Vector2(0.5, 0.5), 1)[0]
	b.pos = w.grid.center_of(hedge) + Vector2(0.0, 0.5 + Burn.REACH + b.radius - 0.05)
	b.hp = 1.5
	Burn.ignite(w, hedge, 0, &"flamethrower")
	w.tick()
	assert_almost_eq(b.hp, 0.5, 0.001)
	_seconds(Burn.EVERY + 0.02)
	assert_eq(b.deaths, 1)
	assert_eq(a.kills, 1)


func test_unit_out_of_reach_of_a_burning_cell_keeps_its_hp() -> void:
	var hedge := _hedges(Vector2(0.5, 0.5), 1)[0]
	b.pos = w.grid.center_of(hedge) + Vector2(0.0, 0.5 + Burn.REACH + b.radius + 0.05)
	var hp := b.hp
	Burn.ignite(w, hedge, 0, &"flamethrower")
	_seconds(1.0)
	assert_eq(b.hp, hp)


func test_burnt_loot_box_drops_a_weapon() -> void:
	Tune.burn_time = 1.0
	var box := w.grid.cell_of(Vector2(2.5, 0.5))
	w.grid.set_cell(box, Defs.Mat.BOX)
	Burn.ignite(w, box, 0, &"flamethrower")
	_seconds(1.1)
	assert_false(w.grid.is_damageable(box))
	var weapons := w.pickups.filter(func(p: Dictionary) -> bool: return p.kind == &"weapon")
	assert_eq(weapons.size(), 1)
	assert_eq(weapons[0].pos, w.grid.center_of(box))


func test_at_most_48_cells_burn() -> void:
	for y in 8:
		_hedges(Vector2(0.5, y + 0.5), 8)
	for y in 8:
		for x in 8:
			Burn.ignite(w, w.grid.cell_of(Vector2(x + 0.5, y + 0.5)), 0, &"flamethrower")
	assert_eq(w.burning.size(), Burn.MOST)
	assert_eq(_events(&"ignite").size(), Burn.MOST)


func _view() -> GameView:
	var view: GameView = autofree(GameView.new())
	view.autoplay = true
	add_child(view)
	view.setup({seed = 1, size = 2})
	view.world.bots_active = false
	return view


func test_blast_digs_a_crater_of_crater_size_times_its_radius() -> void:
	Tune.crater_size = 0.5
	var view := _view()
	var at := Vector2(20.25, -30.25)
	view._show({type = &"explosion", pos = at, radius = 4.0, source = -1, weapon = &"grenade"})
	assert_gt(view._scorch.at(at).x, 0.9)
	assert_gt(view._scorch.at(at + Vector2(1.8, 0.0)).x, 0.0)
	assert_eq(view._scorch.at(at + Vector2(2.2, 0.0)).x, 0.0)
	assert_gt(view._scorch.at(at + Vector2(2.2, 0.0)).y, 0.0, "char around the crater")


func test_fire_on_the_ground_leaves_char_of_0_8_under_it() -> void:
	var view := _view()
	var at := Vector2(20.25, -30.25)
	view._show({type = &"zone", pos = at, radius = 2.9})
	assert_almost_eq(view._scorch.at(at).y, 0.8, 0.01)
	assert_eq(view._scorch.at(at + Vector2(3.2, 0.0)).y, 0.0)


func test_burnt_cell_chars_the_ground_under_it() -> void:
	var view := _view()
	var at := view.world.grid.center_of(Vector2i(80, 30))
	view._show({type = &"burnt", cell = Vector2i(80, 30), pos = at})
	assert_eq(view._scorch.at(at), Vector2(0.0, 1.0))
	assert_eq(view._scorch.at(at + Vector2(2.0, 0.0)), Vector2.ZERO)
