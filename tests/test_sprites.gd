extends GutTest
## Pixel art of the units and the guns that they hold.


func test_each_art_row_has_the_width_of_its_grid_and_only_palette_letters() -> void:
	var grids := [SpriteArt.HEAD_FRONT, SpriteArt.HEAD_BACK, SpriteArt.BODY_FRONT, SpriteArt.BODY_BACK]
	grids.append(SpriteArt.TAIL)
	grids.append_array(SpriteArt.LEGS)
	for grid: Array in grids:
		for row: String in grid:
			assert_eq(row.length(), (grid[0] as String).length(), "row %s" % row)
			for letter in row:
				assert_true(letter == "." or SpriteArt.PALETTE.has(letter), "letter %s in row %s" % [letter, row])


func test_sheet_has_a_front_and_a_back_row_of_frames_with_art_in_each() -> void:
	var image := SpriteArt.sheet().get_image()
	assert_eq(image.get_size(), SpriteArt.FRAME * Vector2i(SpriteArt.FRAMES, 2))
	for row in 2:
		for n in SpriteArt.FRAMES:
			var frame := image.get_region(Rect2i(Vector2i(n, row) * SpriteArt.FRAME, SpriteArt.FRAME))
			# The feet are on the last pixel row, where the unit stands.
			assert_eq(frame.get_used_rect().end.y, SpriteArt.FRAME.y, "frame %d of row %d" % [n, row])


func test_each_weapon_has_gun_art_with_a_muzzle_in_front_of_its_centre() -> void:
	for id in Defs.WEAPON_IDS:
		assert_gt(UnitView.gun_art(id, false)[1], 0.0, "muzzle of %s" % id)
		assert_not_null(UnitView.gun_art(id, true)[0], "art of %s in a reload" % id)


func test_muzzle_of_a_rifle_is_farther_out_than_the_muzzle_of_a_pistol() -> void:
	var pistol := UnitView.muzzle(Vector2.RIGHT, &"pistol")
	var rifle := UnitView.muzzle(Vector2.RIGHT, &"battle-rifle")
	assert_almost_eq(pistol, Vector2(0.8, 0.0), Vector2(0.01, 0.01), "9 px to the gun and 7 px to its muzzle")
	assert_gt(rifle.x, pistol.x)
	# The view is shorter to the north, so the same gun length on screen is a longer way on the ground.
	assert_gt(UnitView.muzzle(Vector2.UP, &"pistol").length(), pistol.length())


func test_atlas_has_a_cell_with_art_for_each_weapon_thrown_thing_and_perk() -> void:
	var image := Fx.atlas().get_image()
	var ids: Array = Defs.WEAPON_IDS + Fx.SECONDARY_ART + Defs.PERKS.keys()
	assert_eq(image.get_width(), Fx.CELL.x * ids.size())
	for id: StringName in ids:
		var cell := image.get_region(Rect2i(Vector2i(int(Fx.cell(id)) * Fx.CELL.x, 0), Fx.CELL))
		assert_false(cell.is_invisible(), "art of %s" % id)


func test_timed_shape_is_gone_after_its_life() -> void:
	var fx := Fx.new(0)
	fx.spawn(Vector3.ZERO, 0.1, Fx.Shape.DISC, Vector2.ONE * 4.0, Vector2.ONE * 8.0, [Color.WHITE] as Array[Color])
	fx.step(0.05)
	assert_eq(fx.multimesh.visible_instance_count, 1, "half of its life is over")
	fx.step(0.06)
	assert_eq(fx.multimesh.visible_instance_count, 0)
	fx.free()


func test_each_prop_of_a_generated_map_has_art_no_wider_than_its_footprint() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	var image := PropArt.atlas().get_image()
	for prop in MapGen.generate(rng).props:
		var art := PropArt.rect(prop.kind, Vector2i(prop.width, prop.height))
		assert_false(image.get_region(art).is_invisible(), "art of %s" % prop.kind)
		assert_lte(art.size.x, prop.width * 20, "width of %s" % prop.kind)
		assert_eq(art.size.x % 2, 0, "an even width keeps the middle of %s on a pixel border" % prop.kind)


func test_art_of_a_crate_goes_away_when_a_hit_breaks_the_crate() -> void:
	var world := SimWorld.new({seed = 1})
	var view := TerrainView.new()
	add_child_autofree(view)
	view.setup(world)
	view._process(0.0)
	var shown := func() -> int:
		return view.get_children().filter(func(node: Node) -> bool: return not node.is_queued_for_deletion()).size()
	var before: int = shown.call()
	var crate: Variant = world.map.props.filter(func(prop: Variant) -> bool: return prop.kind == &"crate")[0]
	world.hit_cell(world.grid.cell_of(Vector2(crate.x, crate.y)), 100.0)
	view._process(0.0)
	assert_eq(shown.call(), before - 1)


func test_map_without_walls_keeps_one_art_of_a_rock_when_another_cell_changes() -> void:
	var world := SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	world.grid.set_cell(world.grid.cell_of(Vector2(3.5, 3.5)), Defs.Mat.ROCK)
	var view := TerrainView.new()
	add_child_autofree(view)
	view.setup(world)
	view._process(0.0)
	var before := view.get_child_count()
	# A loot box lands. The view draws it from the box event, not from the change of the grid.
	world.grid.set_cell(world.grid.cell_of(Vector2(8.5, 3.5)), Defs.Mat.BOX)
	view._process(0.0)
	assert_eq(view.get_child_count(), before, "no second art of the rock")


func test_tall_grass_stays_half_a_metre_away_from_a_flowerbed() -> void:
	var tufts: Array[int] = []
	for beds in 2:
		var map := TerrainMap.new()
		if beds == 1:
			map.props.append({kind = &"flowerbed", x = 4.0, y = 3.5, width = 2, height = 1, solid = false})
		var grass: GrassView = autofree(GrassView.new())
		grass.setup(SimWorld.new({seed = 7, size = 2}, map))
		tufts.append(grass.multimesh.instance_count)
	# A map without ponds and roads is all grass. The bed of 2 m by 1 m and the ring around it are 6 square metres.
	var per_metre := 14 if Quality.high() else 5
	assert_between(tufts[0] - tufts[1], 4 * per_metre, 8 * per_metre, "tufts that the flowerbed takes away")


func test_rocket_leaves_one_smoke_puff_for_2_frames_at_the_same_match_time() -> void:
	var view: GameView = autofree(GameView.new())
	view.autoplay = true
	add_child(view)
	view.setup({seed = 1, size = 2})
	var unit := view.world.units[0]
	Arsenal.equip(unit, &"rocket-launcher", 4.0)
	assert_true(Combat.fire(view.world, unit))
	view.world.now += 0.5
	view._process(0.01)
	view._process(0.01)
	assert_eq(view._air._parts.size(), 1)


## A view of an empty map with one door and one window in a wall of a house that runs north-south at x 2 to 3.
func _house_view(door: Vector2i, window: Vector2i) -> TerrainView:
	var map := TerrainMap.new()
	var rows := [PackedByteArray([ObstacleGrid.LOW]), PackedByteArray([1]), PackedByteArray([0])]
	var top := window.y - map.size / 2
	map.obstacles.append({kind = &"house", x = 2.5, y = top + 1.5, width = 1, height = 3, tiles = rows})
	map.buildings.append({kind = &"house", rect = Rect2i(window, Vector2i(1, 3)), rooms = [], doors = [door]})
	var view := TerrainView.new()
	add_child_autofree(view)
	view.setup(SimWorld.new({seed = 7, size = 2}, map))
	view._process(0.0)
	return view


func test_leaf_of_a_door_turns_away_from_the_unit_that_opens_it_and_closes_again() -> void:
	var map_half := TerrainMap.new().size / 2
	var door := Vector2i(map_half + 2, map_half + 2)
	var view := _house_view(door, door + Vector2i.UP * 2)
	var pivot: Node3D = view._doors[door.y * view.grid.size + door.x].pivot
	var at := view.grid.center_of(door)
	# The far end of the leaf from its hinge, as [east, south].
	var tip := func() -> Vector2:
		var end := pivot.transform * Vector3(1.0, 0.0, 0.0) - pivot.position
		return Vector2(end.x, end.z).snappedf(0.01)
	assert_eq(tip.call(), Vector2.DOWN, "a closed leaf fills its cell from north to south")
	for side: Vector2 in [Vector2.LEFT, Vector2.RIGHT]:
		view.door({cell = door, open = true, from = at + side * 1.2})
		view._process(1.0)
		assert_eq(tip.call(), -side, "opened from %s" % side)
	view.door({cell = door, open = false, from = at})
	view._process(1.0)
	assert_eq(tip.call(), Vector2.DOWN)


func test_view_keeps_one_pane_of_glass_for_a_window_until_it_breaks() -> void:
	var map_half := TerrainMap.new().size / 2
	var window := Vector2i(map_half + 2, map_half)
	var view := _house_view(window + Vector2i.DOWN * 2, window)
	# The headless renderer keeps no instance transforms, so the test reads the record of the view.
	assert_eq(view._panes.keys(), [window.y * view.grid.size + window.x], "no pane on the wall cell or the door")
	view.break_glass(window)
	assert_eq(view._panes.size(), 0)
