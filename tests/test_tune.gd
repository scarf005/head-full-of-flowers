extends GutTest
## Numbers of the debug panel on an empty map: unit 0 is the player and fires along +x, unit 1 is its enemy.

var w: SimWorld
var a: SimUnit
var b: SimUnit
var main: Control


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2.ZERO
	a.aim = Vector2.RIGHT
	b.pos = Vector2(6.0, 0.0)
	w.pickups.clear()
	w.bots_active = false


func after_each() -> void:
	if is_instance_valid(main):
		main.set_debug(false)
	Tune.reset()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## Starts the game as a person does. The debug mode goes off again after the test.
func _start() -> void:
	main = add_child_autofree(load("res://main.tscn").instantiate())


## Fires the weapon of unit 0 one time, then runs `ticks` more ticks.
func _fire(ticks: int) -> void:
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in ticks:
		w.tick()


func _hit(target: SimUnit, amount: float) -> void:
	var by := 1 - target.index
	Combat.damage(w, target, amount, by, target.pos, Vector2.RIGHT, &"shot")


func test_reset_sets_each_number_to_its_default() -> void:
	for id: StringName in Tune.ITEMS:
		Tune.write(id, Tune.ITEMS[id][1])
	Tune.reset()
	assert_eq(Tune.game_speed, Defs.GAME_SPEED)
	for id: StringName in Tune.ITEMS:
		assert_eq(Tune.read(id), Tune.default_of(id), id)
		assert_between(Tune.default_of(id), Tune.ITEMS[id][0], Tune.ITEMS[id][1], "%s is in its range" % id)


func test_write_keeps_a_number_in_its_range_and_on_its_step() -> void:
	Tune.write(&"game_speed", 9.0)
	assert_eq(Tune.game_speed, 1.5)
	Tune.write(&"kill_hp", 2.4)
	assert_eq(Tune.kill_hp, 2.0)


func test_settings_keep_a_changed_number_for_the_debug_mode() -> void:
	var settings := ConfigFile.new()
	Tune.write(&"game_speed", 1.2)
	Tune.store(settings)
	Tune.load_from(settings)
	assert_eq(Tune.game_speed, Defs.GAME_SPEED, "the debug mode is off")
	settings.set_value("debug", "enabled", true)
	Tune.load_from(settings)
	assert_eq(Tune.game_speed, 1.2)
	Tune.reset()
	Tune.store(settings)
	assert_false(settings.has_section("tune"), "a number at its default is not in the settings")


func test_game_speed_and_hit_stop_set_the_match_time_of_a_tick() -> void:
	Tune.game_speed = 1.2
	w.tick()
	assert_almost_eq(w.step, Defs.TICK * 1.2, 0.00001)
	w.hit_stop = 0.1
	Tune.hit_stop = 2.0
	w.tick()
	assert_almost_eq(w.hit_stop, 0.1 - Defs.TICK * 1.2 / 2.0, 0.00001, "a hit stop of 0.1 s takes 0.2 s")
	Tune.hit_stop = 0.0
	w.tick()
	assert_almost_eq(w.step, Defs.TICK * 1.2, 0.00001, "no hit stop")


func test_move_speed_multiplies_the_speed_of_a_unit() -> void:
	Tune.move_speed = 2.0
	a.move = Vector2.DOWN
	for n in 30:
		w.tick()
	assert_almost_eq(a.vel.y, a.speed * 2.0, 0.1)


func test_unit_head_and_hit_size_set_where_a_shot_hits_a_unit() -> void:
	Tune.unit_head = 0.0
	b.pos = Vector2(6.0, 0.8)
	_fire(30)
	assert_eq(b.hp, b.max_hp, "the shot flies 0.8 m north of the feet of a unit without a head")
	Tune.hit_size = 3.0
	_fire(30)
	assert_lt(b.hp, b.max_hp, "the unit is 3 times as wide")


func test_shot_speed_fire_rate_and_spread_change_a_shot() -> void:
	Tune.shot_speed = 0.5
	Tune.fire_rate = 2.0
	Tune.spread = 0.0
	Arsenal.equip(a, &"shotgun", 6.0)
	a.slot_index = a.slots.size() - 1
	_fire(0)
	var weapon: Dictionary = Defs.WEAPONS[&"shotgun"]
	assert_almost_eq(a.shoot_cooldown, weapon.cooldown / 2.0, 0.0001)
	assert_eq(w.projectiles.size(), weapon.pellets)
	for p in w.projectiles:
		assert_almost_eq(p.vel.angle(), 0.0, 0.0001, "no spread")
		assert_between(p.vel.length() / weapon.speed, 0.5, 0.58)


func test_endless_ammo_keeps_the_rounds_of_the_player() -> void:
	Tune.endless_ammo = 1.0
	var rounds: float = a.slot().ammo
	_fire(0)
	assert_eq(w.projectiles.size(), 1)
	assert_eq(a.slot().ammo, rounds)


func test_reload_speed_divides_the_time_of_a_reload() -> void:
	Tune.reload_speed = 2.0
	a.slot().ammo = 1.0
	a.want_reload = true
	w.tick()
	assert_almost_eq(a.reload_cooldown_max, Defs.WEAPONS[&"pistol"].reload / 2.0, 0.0001)


func test_damage_and_knockback_change_a_hit() -> void:
	Tune.damage = 2.0
	Tune.knockback = 5.0
	_hit(b, 2.0)
	assert_eq(b.max_hp - b.hp, 4.0)
	assert_almost_eq(b.vel.x, 5.0, 0.0001)


func test_god_keeps_the_hit_points_of_the_player() -> void:
	Tune.god = 1.0
	_hit(a, 5.0)
	assert_eq(a.hp, a.max_hp)
	_hit(b, 5.0)
	assert_lt(b.hp, b.max_hp, "an enemy still takes damage")


func test_kill_hp_sets_the_hit_points_that_a_kill_gives() -> void:
	Tune.kill_hp = 1.0
	a.hp = 5.0
	b.hp = 1.0
	_hit(b, 5.0)
	assert_eq(a.hp, 6.0)


func test_box_numbers_set_the_hit_points_and_the_interval_of_loot_boxes() -> void:
	Tune.box_hp = 3.0
	Tune.box_interval = 2.0
	w.box_timer = 0.0
	Loot.update(w, 0.0)
	var boxes := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"box")
	assert_eq(boxes.size(), 1)
	var cell: Vector2i = boxes[0].cell
	assert_eq(w.grid.hp[cell.y * w.grid.size + cell.x], 3.0)
	assert_almost_eq(w.box_timer, Loot.BOX_INTERVAL.x * 2.0, 0.01, "at the start of a match")
	w.grid.set_cell(Vector2i(3, 3), Defs.Mat.BOX)
	assert_eq(w.grid.hp[3 * w.grid.size + 3], 3.0, "a box of the map")


func test_shake_and_camera_follow_change_the_view() -> void:
	var view: GameView = autofree(GameView.new())
	view.autoplay = true
	add_child(view)
	view.setup({seed = 1, size = 2})
	view.world.bots_active = false
	view.shake = 2.0
	Tune.shake = 0.0
	view._physics_process(0.0)
	assert_eq(view._jitter, Vector2.ZERO)
	view._focus = view.player.pos + Vector2(4.0, 0.0)
	Tune.camera_follow = 30.0
	view._process(1.0 / 60.0)
	assert_almost_eq(view._focus.distance_to(view.player.pos), 2.0, 0.2, "half of 4 m in a frame of 1/60 s")


func test_f3_and_the_debug_button_of_the_menu_show_and_hide_the_debug_panel() -> void:
	_start()
	assert_false(main.debug.visible)
	var key := InputEventKey.new()
	key.physical_keycode = KEY_F3
	key.pressed = true
	Input.parse_input_event(key)
	Input.flush_buffered_events()
	await wait_physics_frames(2)
	assert_true(main.debug.visible)
	var icon := Icons.get_icon(&"debug")
	var buttons: Array = main.menu.find_children("", "Button", true, false)
	buttons.filter(func(button: Button) -> bool: return button.icon == icon)[0].pressed.emit()
	assert_false(main.debug.visible)


func test_slider_of_the_debug_panel_changes_its_number_and_the_settings() -> void:
	_start()
	main.set_debug(true)
	assert_true(main.debug.visible)
	main.debug.sliders[&"game_speed"].value = 1.2
	assert_eq(Tune.game_speed, 1.2)
	assert_eq(main.menu.settings.get_value("tune", "game_speed"), 1.2)
	main.set_debug(false)
	assert_false(main.debug.visible)
	assert_eq(Tune.game_speed, Defs.GAME_SPEED, "without the panel, the number has its default")
	main.set_debug(true)
	assert_almost_eq(main.debug.sliders[&"game_speed"].value, 1.2, 0.0001, "the panel shows the stored number again")
	main.debug._reset()
	assert_false(main.menu.settings.has_section("tune"))


func test_buttons_of_the_debug_panel_give_a_weapon_and_a_perk_and_end_the_match() -> void:
	_start()
	main.start_match({seed = 1, size = 2})
	var player: SimUnit = main.game.player
	main.debug.give.emit(&"rocket-launcher")
	assert_eq(player.weapon_id(), &"rocket-launcher")
	main.debug.give.emit(&"laser_sight")
	assert_true(player.has_perk(&"laser_sight"))
	main.debug.finish.emit()
	await wait_physics_frames(2)
	assert_true(main.game.world.finished)


func test_player_does_not_fire_while_the_pointer_is_on_the_debug_panel() -> void:
	_start()
	main.start_match({seed = 1, size = 2})
	main.game.world.bots_active = false
	main.game.intro = 0.0
	main.set_debug(true)
	var player: SimUnit = main.game.player
	var rounds: float = player.slot().ammo
	GameView.mouse = main.debug.get_global_rect().get_center()
	Input.action_press(&"fire")
	await wait_physics_frames(4)
	assert_eq(player.slot().ammo, rounds)
	GameView.mouse = Vector2(200.0, 300.0)
	await wait_physics_frames(4)
	assert_lt(player.slot().ammo, rounds, "the pointer is on the match")
	Input.action_release(&"fire")
