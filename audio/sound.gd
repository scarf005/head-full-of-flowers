class_name Sound
extends Node3D
## Plays match sounds from game events. Sounds are placed in 3D around the player. The player's own sounds are flat.

const PLAYER := 0
const MASTER := &"Master"
const MUSIC := &"Music"
const SFX := &"Sfx"
const RATE := 22050
const SPATIAL_POOL := 24
const FLAT_POOL := 6
const MIN_GAP_MS := 30
const BOT_SHOT_CHANCE := 0.18
const FLAME_TAIL_MS := 150
const MUSIC_DB := -10.0
const OPEN_HZ := 20500.0
## As in the original game: one track for the demo behind the menu, one for a match that a person plays.
const MENU_TRACK := "res://assets/music/track2.ogg"
const MATCH_TRACK := "res://assets/music/track1.ogg"
## The menu track is quieter: 0.22 against 0.3 of the match track in the original game.
const MENU_DB := -2.7
const FILES: Array[StringName] = [
	&"pistol",
	&"assault",
	&"shotgun",
	&"flamethrower",
	&"auto_shotgun",
	&"battle_rifle",
	&"grenade_launcher",
	&"grenade_throw",
	&"explosion",
	&"reload",
	&"item_acquire",
	&"damage",
	&"kill_confirm",
	&"player_death",
]
const WEAPON_GAIN := {
	&"pistol": 0.1,
	&"assault": 0.25,
	&"shotgun": 0.8,
	&"flamethrower": 0.25,
	&"auto-shotgun": 0.52,
	&"battle-rifle": 0.5,
	&"grenade-launcher": 0.65,
	&"rocket-launcher": 0.65
}
const WEAPON_SOUNDS := {
	&"pistol": &"pistol",
	&"assault": &"assault",
	&"shotgun": &"shotgun",
	&"flamethrower": &"flamethrower",
	&"auto-shotgun": &"auto_shotgun",
	&"battle-rifle": &"battle_rifle",
	&"grenade-launcher": &"grenade_launcher",
	&"rocket-launcher": &"grenade_launcher",
}
## Sounds without a file. secs: length. f0, f1: tone sweep in Hz. tone, noise: mix. lp: noise filter 0..1.
## decay: envelope steepness. attack: fade-in in seconds. gain: peak level.
const SYNTH := {
	&"bounce": {secs = 0.09, f0 = 520.0, f1 = 300.0, tone = 1.0, noise = 0.15, lp = 0.5, decay = 7.0, gain = 0.3},
	&"wall_break": {secs = 0.38, f0 = 90.0, f1 = 45.0, tone = 0.8, noise = 1.0, lp = 0.12, decay = 5.0, gain = 0.6},
	&"box": {secs = 0.2, f0 = 150.0, f1 = 70.0, tone = 1.0, noise = 0.3, lp = 0.2, decay = 6.0, gain = 0.5},
	&"fire": {secs = 0.38, noise = 1.0, lp = 0.08, decay = 3.0, attack = 0.12, gain = 0.45},
	&"perk": {secs = 0.3, f0 = 660.0, f1 = 990.0, tone = 1.0, decay = 4.0, gain = 0.35},
	&"respawn": {secs = 0.34, f0 = 220.0, f1 = 620.0, tone = 1.0, noise = 0.1, lp = 0.1, decay = 4.0, gain = 0.35},
	&"finish": {secs = 0.39, f0 = 440.0, f1 = 220.0, tone = 1.0, decay = 4.0, gain = 0.4},
	&"empty": {secs = 0.05, f0 = 180.0, f1 = 140.0, tone = 0.6, noise = 0.8, lp = 0.6, decay = 8.0, gain = 0.3},
	&"hit": {secs = 0.11, f0 = 340.0, f1 = 100.0, tone = 1.0, decay = 6.0, gain = 0.52},
	&"die": {secs = 0.28, f0 = 420.0, f1 = 44.0, tone = 1.0, decay = 4.0, gain = 0.86},
	&"click": {secs = 0.04, f0 = 1100.0, f1 = 900.0, tone = 1.0, decay = 7.0, gain = 0.25},
	&"door": {secs = 0.12, f0 = 190.0, f1 = 110.0, tone = 0.9, noise = 0.4, lp = 0.25, decay = 7.0, gain = 0.3},
	&"roll": {secs = 0.2, noise = 1.0, lp = 0.25, decay = 4.0, attack = 0.05, gain = 0.3},
	&"glass": {secs = 0.3, f0 = 3100.0, f1 = 2300.0, tone = 0.45, noise = 1.0, lp = 0.9, decay = 6.0, gain = 0.42},
}

static var _streams: Dictionary = {}

var _game: GameView
var _listener := AudioListener3D.new()
var _spatial: Array[AudioStreamPlayer3D] = []
var _flat: Array[AudioStreamPlayer] = []
var _flame := AudioStreamPlayer3D.new()
var _music := AudioStreamPlayer.new()
var _last: Dictionary = {}
var _flame_until := 0
var _cut: Dictionary = {}


## All sounds by name: files and generated ones. Built once.
static func streams() -> Dictionary:
	if _streams.is_empty():
		for key in FILES:
			_streams[key] = load("res://assets/sfx/%s.ogg" % key)
		var flame: AudioStreamOggVorbis = _streams[&"flamethrower"].duplicate()
		flame.loop = true
		_streams[&"flamethrower"] = flame
		for key in SYNTH:
			_streams[key] = _synth(SYNTH[key])
	return _streams


static func _synth(o: Dictionary) -> AudioStreamWAV:
	var count := int(o.secs * RATE)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var samples := PackedFloat32Array()
	samples.resize(count)
	var phase := 0.0
	var low := 0.0
	var peak := 0.001
	for i in count:
		var t := float(i) / count
		phase += TAU * lerpf(o.get("f0", 0.0), o.get("f1", 0.0), t) / RATE
		low = lerpf(low, rng.randf_range(-1.0, 1.0), o.get("lp", 1.0))
		var fade := minf(1.0, i / (RATE * o.get("attack", 0.002)))
		samples[i] = (sin(phase) * o.get("tone", 0.0) + low * o.get("noise", 0.0)) * exp(-t * o.decay) * fade
		peak = maxf(peak, absf(samples[i]))
	var data := PackedByteArray()
	data.resize(count * 2)
	for i in count:
		data.encode_s16(i * 2, int(samples[i] / peak * o.gain * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.data = data
	return wav


## Creates the Music and Sfx buses and a limiter on Master when they are missing.
static func ensure_buses() -> void:
	for bus in [MUSIC, SFX]:
		if AudioServer.get_bus_index(bus) == -1:
			AudioServer.add_bus()
			AudioServer.set_bus_name(AudioServer.bus_count - 1, bus)
			AudioServer.set_bus_send(AudioServer.bus_count - 1, MASTER)
	if AudioServer.get_bus_effect_count(0) == 0:
		AudioServer.add_bus_effect(0, AudioEffectHardLimiter.new())
	if AudioServer.get_bus_effect_count(AudioServer.get_bus_index(MUSIC)) == 0:
		AudioServer.add_bus_effect(AudioServer.get_bus_index(MUSIC), AudioEffectLowPassFilter.new())


## Sets the level of a bus (Master, Music or Sfx) from a 0..1 slider.
static func set_volume(bus: StringName, linear: float) -> void:
	ensure_buses()
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(bus), linear_to_db(linear))


static func _music_filter(hz: float) -> void:
	var filter := AudioServer.get_bus_effect(AudioServer.get_bus_index(MUSIC), 0) as AudioEffectLowPassFilter
	filter.cutoff_hz = hz


func _ready() -> void:
	ensure_buses()
	_music_filter(OPEN_HZ)
	add_child(_listener)
	_listener.make_current()
	for i in SPATIAL_POOL:
		var p := AudioStreamPlayer3D.new()
		_tune(p)
		add_child(p)
		_spatial.append(p)
	for i in FLAT_POOL:
		var p := AudioStreamPlayer.new()
		p.bus = SFX
		add_child(p)
		_flat.append(p)
	_tune(_flame)
	_flame.stream = streams()[&"flamethrower"]
	add_child(_flame)
	_music.bus = MUSIC
	_music.volume_db = MUSIC_DB
	add_child(_music)


## Stops playback and drops the cache. The short wait lets the audio thread release the streams before exit.
func _exit_tree() -> void:
	for p in get_children():
		if p.has_method(&"stop"):
			p.stop()
			p.stream = null
	_streams.clear()


func setup(game: GameView) -> void:
	_game = game
	game.event.connect(handle)
	_music_filter(OPEN_HZ)
	_music.volume_db = MUSIC_DB + (MENU_DB if game.autoplay else 0.0)
	var track := MENU_TRACK if game.autoplay else MATCH_TRACK
	# The track starts again only when it changes. The import setting makes it loop.
	if not _music.playing or _music.stream.resource_path != track:
		_music.stream = load(track)
		_music.play()


func _process(_delta: float) -> void:
	if _game and _game.player:
		_listener.position = Vector3(_game.player.pos.x, 0.0, _game.player.pos.y)
	for p in _cut.keys():
		if Time.get_ticks_msec() >= _cut[p]:
			p.stop()
			_cut.erase(p)
	if _flame.playing and Time.get_ticks_msec() > _flame_until:
		_flame.stop()


## Plays the sound for one simulation event.
func handle(e: Dictionary) -> void:
	match e.type:
		&"shot":
			var gain: float = WEAPON_GAIN[e.weapon]
			# Other units are heard at the first shot of a burst, one time in five. The 3D player lowers their sound
			# by the distance.
			if e.unit != _me() and (not e.first or randf() > BOT_SHOT_CHANCE):
				return
			if e.weapon == &"flamethrower":
				_burn(_at(e.unit, e.pos), gain)
			else:
				_play(WEAPON_SOUNDS[e.weapon], _at(e.unit, e.pos), gain)
		&"hit":
			var mine: bool = e.target == _me() or e.source == _me()
			if e.kill:
				if e.target == _me():
					_play(&"player_death")
				elif mine:
					_play(&"kill_confirm", null, 0.8, 0.2)
				else:
					_play(&"die", e.pos)
			else:
				_play(&"damage", null if mine else e.pos, 0.72 if mine else 0.2)
		&"explosion":
			_play(&"explosion", e.pos, 0.25)
		&"throw":
			_play(&"grenade_throw", _at(e.unit, _unit_pos(e.unit)))
		&"roll":
			_play(&"roll", _at(e.unit, _unit_pos(e.unit)))
		&"reload":
			if e.unit == _me():
				_play(&"reload", null, 0.74, 1.1, 0.4)
		&"reloaded":
			if e.unit == _me():
				_play(&"reload", null, 0.8, 2.168, 0.532)
		&"pickup":
			_play(&"perk" if e.kind == &"perk" else &"item_acquire", _at(e.unit, e.pos))
		&"cell":
			_play(&"wall_break" if e.destroyed else &"hit", _cell_pos(e.cell))
		&"door", &"glass":
			_play(e.type, _cell_pos(e.cell))
		&"bounce":
			_play(&"bounce", e.pos)
		&"zone":
			# A flamethrower adds 16 flame patches each second and has its own sound.
			if not e.flame:
				_play(&"fire", e.pos)
		&"box":
			_play(&"box", _cell_pos(e.cell))
		&"respawn":
			_play(&"respawn", _at(e.unit, e.pos))
		&"finish":
			_play(&"finish")
			_music_filter(1500.0)
			_music.volume_db = MUSIC_DB - 6.0


## Plays a UI or empty-magazine sound (click, empty) without position.
func play_ui(key: StringName) -> void:
	_play(key)


## The unit that a person plays, or -1 in a match of bots only.
func _me() -> int:
	return -1 if _game and _game.autoplay else PLAYER


## The sound position, or null for the player's own sound.
func _at(unit: int, pos: Vector2) -> Variant:
	return null if unit == _me() else pos


func _unit_pos(unit: int) -> Vector2:
	return _game.world.units[unit].pos if _game else Vector2.ZERO


func _cell_pos(cell: Variant) -> Vector2:
	return _game.world.grid.center_of(cell) if _game else Vector2.ZERO


func _tune(p: AudioStreamPlayer3D) -> void:
	p.bus = SFX
	p.unit_size = 8.0
	p.max_distance = 45.0


## Starts the flame loop. It stops 0.15 s after the last flame shot. As in the original game, the flame of
## another unit does not change a loop that plays.
func _burn(at: Variant, gain: float) -> void:
	if at != null and _flame.playing:
		return
	_flame.volume_db = linear_to_db(gain)
	_flame_until = Time.get_ticks_msec() + FLAME_TAIL_MS
	_flame.position = _listener.position if at == null else Vector3(at.x, 0.0, at.y)
	if not _flame.playing:
		_flame.play()


## Plays a sound at a sim position, or flat when at is null. The same sound never starts twice within 30 ms.
## from and secs cut a slice of the sample. A secs of 0 plays to the end.
func _play(key: StringName, at: Variant = null, gain := 1.0, from := 0.0, secs := 0.0) -> void:
	var now := Time.get_ticks_msec()
	if now - _last.get(key, -MIN_GAP_MS) < MIN_GAP_MS:
		return
	_last[key] = now
	var pool: Array = _flat if at == null else _spatial
	var p: Variant = pool.pop_front()
	pool.push_back(p)
	if at != null:
		p.position = Vector3(at.x, 0.0, at.y)
	p.stream = streams()[key]
	p.pitch_scale = randf_range(0.94, 1.06)
	p.volume_db = linear_to_db(gain)
	p.play(from)
	_cut.erase(p)
	if secs > 0.0:
		_cut[p] = now + int(secs / p.pitch_scale * 1000.0)
