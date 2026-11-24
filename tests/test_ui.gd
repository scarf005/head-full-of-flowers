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


func test_minimap_marks_each_loot_box_in_the_colour_of_its_tier() -> void:
	var w := SimWorld.new({seed = 1, size = 2}, TerrainMap.new())
	var plain := w.grid.cell_of(Vector2(3.5, 0.5))
	w.grid.set_cell(plain, Defs.Mat.BOX)
	w.grid.set_cell(w.grid.cell_of(Vector2(-3.5, 0.5)), Defs.Mat.BOX, true)
	w.grid.set_cell(w.grid.cell_of(Vector2(0.5, 5.5)), Defs.Mat.ROCK)
	var marks := [{at = Vector2(-3.5, 0.5), color = Hud.BOX_HIGH}, {at = Vector2(3.5, 0.5), color = Hud.BOX}]
	assert_eq(Hud.box_marks(w.grid), marks, "a high-tier box to the west, a plain box to the east and a rock")
	w.hit_cell(plain, 99.0, 0)
	assert_eq(Hud.box_marks(w.grid), marks.slice(0, 1), "after the plain box breaks")


func test_arrow_for_a_unit_out_of_view_is_on_the_screen_border_toward_the_unit() -> void:
	var area := Rect2(32.0, 32.0, 1216.0, 656.0)
	assert_eq(Hud.edge_point(Vector2(3000.0, 360.0), area), Vector2(1248.0, 360.0), "a unit to the right")
	assert_eq(Hud.edge_point(Vector2(640.0, -500.0), area), Vector2(640.0, 32.0), "a unit to the north")
	# The line to this unit leaves the border 2 pixels from the corner. The arrow stays 32 pixels from it.
	assert_eq(Hud.edge_point(Vector2(5000.0, 2700.0), area), Vector2(1248.0, 656.0), "a unit toward a corner")


func test_arrow_on_a_plate_of_the_hud_moves_beside_it_toward_the_middle_of_the_screen() -> void:
	# The map and the ammo plate.
	var plates: Array[Rect2] = [Rect2(16.0, 16.0, 150.0, 150.0), Rect2(980.0, 632.0, 292.0, 80.0)]
	assert_eq(Hud.beside(Vector2(1100.0, 688.0), plates, 1280.0), Vector2(956.0, 688.0), "on the ammo plate")
	assert_eq(Hud.beside(Vector2(32.0, 100.0), plates, 1280.0), Vector2(190.0, 100.0), "on the map")
	assert_eq(Hud.beside(Vector2(640.0, 688.0), plates, 1280.0), Vector2(640.0, 688.0), "on no plate")


func test_damage_number_adds_hits_and_shows_again_after_it_is_gone() -> void:
	var view: GameView = autofree(GameView.new())
	# A match of bots reads no input actions. Only main.gd adds those.
	view.autoplay = true
	add_child(view)
	view.setup({seed = 1, size = 2})
	view._number(1, Vector2.ZERO, 3.0, Color.WHITE)
	view._number(1, Vector2.ZERO, 4.0, Color.WHITE)
	assert_eq(view._numbers[1].text, "7")
	# The number goes away after 0.72 s. The next hit starts a new number.
	await wait_seconds(0.9)
	view._number(1, Vector2.ZERO, 5.0, Color.WHITE)
	assert_true(is_instance_valid(view._numbers[1]) and view._numbers[1].text == "5")


func test_kill_shows_its_hit_points_over_the_unit_that_made_it() -> void:
	var view: GameView = autofree(GameView.new())
	add_child(view)
	view.setup({seed = 1, size = 2})
	var hit := {
		type = &"hit",
		target = 1,
		source = 0,
		pos = Vector2.ZERO,
		dir = Vector2.RIGHT,
		damage = 3.0,
		kill = true,
		team = 0,
		weapon = &"pistol",
		target_pos = Vector2.ZERO
	}
	view._show(hit)
	view._show(hit)
	assert_eq(view._numbers["heal 0"].text, "+6 HP", "3 hit points for each of the two kills")
	assert_eq(view._numbers["heal 0"].position.x, view.world.units[0].pos.x)
	# The arena border makes a kill with the source -1. No unit gets hit points for it.
	hit.source = -1
	view._show(hit)
	assert_eq(view._numbers.size(), 2, "the hit points of unit 0 and the damage of unit 1")
