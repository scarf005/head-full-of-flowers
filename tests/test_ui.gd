extends GutTest
## Icons load for every game id, and the menu screens show them.

var menu: Menu


func before_each() -> void:
	menu = add_child_autofree(Menu.new())


func _textures() -> Array:
	return menu.find_children("*", "TextureRect", true, false).map(func(r: TextureRect) -> Texture2D: return r.texture)


func test_every_weapon_perk_and_secondary_has_an_icon() -> void:
	for id: StringName in Defs.WEAPON_IDS + Defs.PERKS.keys() + [&"grenade", &"molotov"]:
		assert_not_null(Icons.get_icon(id), "icon for %s" % id)


func test_title_and_pause_show_an_icon_on_every_button_and_row() -> void:
	for screen: Callable in [menu.show_title, menu.show_pause]:
		screen.call()
		for button: Button in menu.find_children("*", "Button", true, false):
			if not button is OptionButton and not button is CheckButton:
				assert_not_null(button.icon, "icon on %s" % button.text)
		assert_does_not_have(_textures(), null)
		assert_has(_textures(), Icons.get_icon(&"move"), "controls legend")


func test_results_show_trophy_on_victory_and_skull_on_defeat() -> void:
	var w := SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	Combat.damage(w, w.units[1], 2.0, 0, Vector2.ZERO, Vector2(40, 0), &"shot")
	menu.show_results(w)
	assert_has(_textures(), Icons.get_icon(&"trophy"))
	assert_has(_textures(), Icons.get_icon(&"tombstone"), "deaths stat")
	Combat.damage(w, w.units[0], 5.0, 1, Vector2.ZERO, Vector2(40, 0), &"shot")
	menu.show_results(w)
	assert_does_not_have(_textures(), Icons.get_icon(&"trophy"))
	assert_has(_textures(), Icons.get_icon(&"skull"))
