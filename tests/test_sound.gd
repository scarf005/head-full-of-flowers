extends GutTest
## Sound maps every weapon to a stream and takes every event type without error.

var sound: Sound


func before_each() -> void:
	sound = add_child_autofree(Sound.new())


func test_every_weapon_has_a_stream() -> void:
	for id in Defs.WEAPON_IDS:
		assert_true(Sound.WEAPON_SOUNDS.has(id), "weapon %s has no sound" % id)
		assert_not_null(Sound.streams().get(Sound.WEAPON_SOUNDS[id]), "stream for %s" % id)


func test_generated_sounds_are_short_and_not_empty() -> void:
	for key in Sound.SYNTH:
		var wav: AudioStreamWAV = Sound.streams()[key]
		assert_gt(wav.data.size(), 0, "%s has no frames" % key)
		assert_lt(wav.get_length(), 0.4, "%s is too long" % key)


func test_every_event_type_plays_without_error() -> void:
	var events: Array[Dictionary] = [
		{type = &"shot", unit = 0, pos = Vector2.ZERO, dir = Vector2.RIGHT, weapon = &"assault", first = true},
		{type = &"shot", unit = 1, pos = Vector2(5, 0), dir = Vector2.RIGHT, weapon = &"flamethrower", first = true},
		{type = &"hit", target = 0, source = 1, pos = Vector2.ZERO, damage = 1.0, kill = false, team = 1},
		{type = &"hit", target = 0, source = 1, pos = Vector2.ZERO, damage = 1.0, kill = true, team = 1},
		{type = &"hit", target = 1, source = 0, pos = Vector2.ZERO, damage = 1.0, kill = true, team = 0},
		{type = &"explosion", pos = Vector2(3, 3), radius = 4.0, source = 1},
		{type = &"throw", unit = 0, molotov = true},
		{type = &"reload", unit = 1},
		{type = &"reload", unit = 0},
		{type = &"pickup", unit = 0, kind = &"perk", id = &"x", pos = Vector2.ZERO},
		{type = &"pickup", unit = 1, kind = &"weapon", id = &"pistol", pos = Vector2.ZERO},
		{type = &"cell", cell = Vector2i(1, 1), destroyed = true, material = 1, cells = []},
		{type = &"cell", cell = Vector2i(1, 1), destroyed = false, material = 1, cells = []},
		{type = &"door", cell = Vector2i(1, 1), open = true, from = Vector2.ZERO},
		{type = &"glass", cell = Vector2i(1, 1)},
		{type = &"bounce", pos = Vector2(2, 2)},
		{type = &"zone", pos = Vector2(2, 2), flame = false, radius = 2.9},
		{type = &"box", cell = Vector2i(2, 2)},
		{type = &"respawn", unit = 1, pos = Vector2(9, 9)},
		{type = &"finish"},
	]
	for e in events:
		sound.handle(e)
	sound.play_ui(&"click")
	sound.play_ui(&"empty")
	assert_true(true)


func test_door_and_breaking_glass_each_play_their_own_sound() -> void:
	for type: StringName in [&"door", &"glass"]:
		sound.handle({type = type, cell = Vector2i(1, 1), open = true, from = Vector2.ZERO})
		var p := sound._spatial.back() as AudioStreamPlayer3D
		assert_true(p.playing, type)
		assert_eq(p.stream, Sound.streams()[type], type)


func test_same_sound_does_not_restart_within_30_ms() -> void:
	sound.handle({type = &"explosion", pos = Vector2(3, 3), radius = 4.0, source = 1})
	var first := sound._spatial.back() as AudioStreamPlayer3D
	sound.handle({type = &"explosion", pos = Vector2(8, 8), radius = 4.0, source = 1})
	assert_eq(sound._spatial.back(), first, "second start was not dropped")


func test_ensure_buses_creates_music_and_sfx() -> void:
	assert_ne(AudioServer.get_bus_index(Sound.MUSIC), -1)
	assert_ne(AudioServer.get_bus_index(Sound.SFX), -1)


func test_pistol_shot_is_quieter_than_shotgun_shot() -> void:
	var shot := {type = &"shot", unit = 0, pos = Vector2.ZERO, dir = Vector2.RIGHT, first = true}
	sound.handle(shot.merged({weapon = &"pistol"}))
	var pistol_db := (sound._flat.back() as AudioStreamPlayer).volume_db
	sound._last.clear()
	sound.handle(shot.merged({weapon = &"shotgun"}))
	assert_lt(pistol_db, (sound._flat.back() as AudioStreamPlayer).volume_db)


func test_second_burst_shot_of_a_bot_makes_no_sound() -> void:
	# 200 shots: without the rule, about 36 of them pass the 1 in 5 chance.
	for n in 200:
		sound.handle({type = &"shot", unit = 1, pos = Vector2.ZERO, weapon = &"assault", first = false})
	for p in sound._spatial:
		assert_false(p.playing)


func test_shot_of_a_bot_20_m_away_gets_quieter_by_its_distance_one_time() -> void:
	for n in 200:
		sound.handle({type = &"shot", unit = 1, pos = Vector2(20, 0), weapon = &"shotgun", first = true})
	var p := sound._spatial.back() as AudioStreamPlayer3D
	assert_true(p.playing)
	# The 3D player lowers the sound by the distance. The level that the shot sets has no distance in it.
	assert_almost_eq(p.volume_db, linear_to_db(Sound.WEAPON_GAIN[&"shotgun"]), 0.01)


func test_flame_of_a_bot_does_not_move_the_flame_sound_of_the_player() -> void:
	sound.handle({type = &"shot", unit = 0, pos = Vector2.ZERO, weapon = &"flamethrower", first = true})
	var level := sound._flame.volume_db
	sound._burn(Vector2(30, 0), 0.01)
	assert_eq(sound._flame.position, sound._listener.position)
	assert_eq(sound._flame.volume_db, level)


func test_reload_end_plays_the_end_slice() -> void:
	sound.handle({type = &"reloaded", unit = 0})
	var p := sound._flat.back() as AudioStreamPlayer
	assert_true(p.playing)
	assert_almost_eq(p.get_playback_position(), 2.168, 0.1)


func test_match_of_a_person_starts_the_match_track_after_the_menu_track_of_the_title() -> void:
	var title: GameView = autofree(GameView.new())
	title.autoplay = true
	sound.setup(title)
	# As in the original game: "linear & gestalt" in the menu, "MY DIVINE PERVERSIONS" in a match.
	assert_eq(sound._music.stream.resource_path, "res://assets/music/track2.ogg", "title")
	var game: GameView = autofree(GameView.new())
	sound.setup(game)
	assert_eq(sound._music.stream.resource_path, "res://assets/music/track1.ogg", "match")
	assert_true(sound._music.playing)
	sound.setup(autofree(GameView.new()))
	assert_eq(sound._music.stream.resource_path, "res://assets/music/track1.ogg", "next match keeps the track")
