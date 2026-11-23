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
