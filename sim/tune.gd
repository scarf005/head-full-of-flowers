class_name Tune
## Numbers that a person can change in the debug panel. Lengths in metres, times in seconds.
## A number without a unit in its comment multiplies a value of `Defs`.

## Name of a variable below -> [least, most, step]. The debug panel shows the numbers in this order.
const ITEMS := {
	&"game_speed": [0.4, 1.5, 0.01],
	&"move_speed": [0.5, 2.0, 0.05],
	&"unit_head": [0.0, 1.5, 0.05],
	&"hit_size": [0.5, 3.0, 0.05],
	&"shot_speed": [0.3, 2.0, 0.05],
	&"fire_rate": [0.3, 3.0, 0.05],
	&"damage": [0.2, 5.0, 0.1],
	&"spread": [0.0, 3.0, 0.05],
	&"reload_speed": [0.3, 4.0, 0.05],
	&"knockback": [0.0, 10.0, 0.1],
	&"hit_stop": [0.0, 3.0, 0.1],
	&"kill_hp": [0.0, 10.0, 1.0],
	&"box_interval": [0.2, 3.0, 0.05],
	&"box_hp": [1.0, 20.0, 1.0],
	&"shake": [0.0, 3.0, 0.1],
	&"camera_follow": [2.0, 30.0, 0.5],
	&"god": [0.0, 1.0, 1.0],
	&"endless_ammo": [0.0, 1.0, 1.0],
}

## Seconds of match time in each second.
static var game_speed := Defs.GAME_SPEED
static var move_speed := 1.0
## Metres from the feet of a unit to the north end of its hit line.
static var unit_head := Defs.UNIT_HEAD
## Multiplies the radius of a unit for shots.
static var hit_size := 1.0
static var shot_speed := 1.0
static var fire_rate := 1.0
static var damage := 1.0
static var spread := 1.0
static var reload_speed := 1.0
## Speed in m/s that a hit gives to its target.
static var knockback := 2.7
static var hit_stop := 1.0
## Hit points that a kill gives.
static var kill_hp := Defs.KILL_HP_BONUS
## Multiplies the seconds between two loot boxes.
static var box_interval := 1.0
## Hit points of a loot box.
static var box_hp := 8.0
static var shake := 1.0
## Share of the distance to the player that the camera moves in each second.
static var camera_follow := 8.0
## At 1, the player takes no damage.
static var god := 0.0
## At 1, the player spends no ammunition.
static var endless_ammo := 0.0

static var _defaults := {}


static func _static_init() -> void:
	for id: StringName in ITEMS:
		_defaults[id] = read(id)


static func read(id: StringName) -> float:
	return (Tune as Script).get(id)


## Sets a number to the nearest step in its range.
static func write(id: StringName, value: float) -> void:
	var item: Array = ITEMS[id]
	(Tune as Script).set(id, clampf(snappedf(value, item[2]), item[0], item[1]))


static func default_of(id: StringName) -> float:
	return _defaults[id]


static func reset() -> void:
	for id: StringName in ITEMS:
		(Tune as Script).set(id, _defaults[id])


## Sets each number to its default, then, with the debug mode on, to its value in the settings.
static func load_from(settings: ConfigFile) -> void:
	reset()
	if not settings.get_value("debug", "enabled", false):
		return
	for id: StringName in ITEMS:
		write(id, settings.get_value("tune", id, _defaults[id]))


## Puts each number that is not at its default into the settings.
static func store(settings: ConfigFile) -> void:
	if settings.has_section("tune"):
		settings.erase_section("tune")
	for id: StringName in ITEMS:
		if not is_equal_approx(read(id), _defaults[id]):
			settings.set_value("tune", id, read(id))
