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


func test_play_again_on_results_starts_a_match_with_the_last_settings() -> void:
	menu._size.value = 4
	menu._start()
	menu.show_results(SimWorld.new({seed = 7, size = 2}, TerrainMap.new()))
	# The title widgets are freed at the end of the frame.
	await wait_process_frames(2)
	watch_signals(menu)
	var named := func(b: Button) -> bool: return b.text == tr("Play again")
	var again: Button = menu.find_children("*", "Button", true, false).filter(named)[0]
	again.pressed.emit()
	assert_signal_emitted(menu, "start")
	assert_eq(get_signal_parameters(menu, "start")[0].size, 4)


func test_kill_feed_shows_the_weapon_of_the_hit_and_a_skull_without_one() -> void:
	var view: GameView = autofree(GameView.new())
	var w := SimWorld.new({seed = 1, size = 2})
	view.world = w
	var hud: Hud = autofree(Hud.new())
	hud.setup(view)
	# The killer holds a pistol. The feed shows the weapon of the hit event, not the weapon in the hands.
	Combat.damage(w, w.units[1], 99.0, 0, w.units[1].pos, Vector2.RIGHT, &"shot", &"shotgun")
	Combat.damage(w, w.units[0], 99.0, -1, w.units[0].pos, Vector2.RIGHT, &"arena")
	for e in w.events:
		view.event.emit(e)
	assert_eq(hud.feed.map(func(row: Dictionary) -> StringName: return row.icon), [&"shotgun", &"skull"])
