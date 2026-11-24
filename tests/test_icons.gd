extends GutTest
## Item icons come from the item sprites. The HUD draws them at a whole scale.


func _sprite(id: StringName) -> Image:
	var image := (load("res://assets/sprites/%s.png" % id) as Texture2D).get_image()
	image.convert(Image.FORMAT_RGBA8)
	return image.get_region(image.get_used_rect())


func test_each_item_icon_is_its_sprite_with_a_light_rim() -> void:
	for id: StringName in Defs.WEAPON_IDS + Icons.SECONDARIES + Defs.PERKS.keys():
		assert_true(Icons.is_art(id), id)
		var sprite := _sprite(id)
		var icon := Icons.get_icon(id).get_image()
		assert_eq(icon.get_size(), sprite.get_size() + Vector2i(2, 2), "%s: 1 px of rim on each side" % id)
		var kept := true
		var rimmed := true
		for y in sprite.get_height():
			for x in sprite.get_width():
				var art := sprite.get_pixel(x, y)
				kept = kept and (art.a < 0.5 or icon.get_pixel(x + 1, y + 1).is_equal_approx(art))
			# The left column of the icon is rim next to each pixel of art in the first column of the sprite.
			if sprite.get_pixel(0, y).a >= 0.5:
				rimmed = rimmed and icon.get_pixel(0, y + 1).is_equal_approx(Icons.RIM)
		assert_true(kept, "%s: each pixel of art is in the icon" % id)
		assert_true(rimmed, "%s: rim on the left" % id)


func test_menu_icons_stay_silhouettes() -> void:
	for id: StringName in [&"skull", &"clock", &"move", &"fire"]:
		assert_false(Icons.is_art(id), id)
		assert_eq(Icons.get_icon(id).get_size(), Vector2(32.0, 32.0), id)


func test_fit_keeps_square_pixels_in_the_middle_of_the_box() -> void:
	var pistol := Icons.get_icon(&"pistol")
	assert_eq(pistol.get_size(), Vector2(14.0, 10.0))
	assert_eq(Icons.fit(pistol, Rect2(0.0, 0.0, 84.0, 48.0), 3), Rect2(21.0, 9.0, 42.0, 30.0), "3x, the most")
	assert_eq(Icons.fit(pistol, Rect2(0.0, 0.0, 84.0, 48.0)), Rect2(14.0, 4.0, 56.0, 40.0), "4x fits 48 px")
	var rocket := Icons.get_icon(&"rocket-launcher")
	assert_eq(Icons.fit(rocket, Rect2(0.0, 0.0, 84.0, 48.0), 3).size, Vector2(74.0, 30.0), "2x fits 84 px")
	assert_almost_eq(Icons.fit(rocket, Rect2(0.0, 0.0, 24.0, 24.0)).size.x, 24.0, 0.001, "shrinks to fit")
