class_name Tune
## Numbers that a person can change in the debug panel. Lengths in metres, times in seconds.
## A number without a unit in its comment multiplies a value of `Defs`.

## Numbers that the shaders read as global parameters with the same name.
const LOOK: Array[StringName] = [&"rot", &"ground_calm", &"flower_tone", &"marsh_mark"]
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
	&"box_front": [0.0, 1.0, 0.01],
	&"yard_boxes": [0.0, 4.0, 0.5],
	&"bot_box_range": [0.0, 20.0, 0.5],
	&"burn_time": [0.5, 10.0, 0.5],
	&"burn_spread": [0.0, 1.0, 0.05],
	&"shake": [0.0, 3.0, 0.1],
	&"camera_follow": [2.0, 30.0, 0.5],
	&"auto_vault": [0.0, 1.0, 1.0],
	&"vault_speed": [0.5, 3.0, 0.1],
	&"vault_delay": [0.0, 0.5, 0.05],
	&"laser_length": [2.0, 30.0, 0.5],
	&"laser_width": [1.0, 6.0, 1.0],
	&"laser_alpha": [0.1, 1.0, 0.02],
	&"rot": [0.0, 1.0, 0.05],
	&"ground_calm": [0.0, 2.0, 0.05],
	&"flower_tone": [0.3, 1.2, 0.02],
	&"flower_speed": [0.2, 5.0, 0.1],
	&"marsh_mark": [0.0, 1.0, 0.05],
	&"trail_length": [0.0, 4.0, 0.05],
	&"trail_width": [0.25, 4.0, 0.05],
	&"trail_alpha": [0.0, 3.0, 0.05],
	&"smoke_puffs": [0.0, 12.0, 1.0],
	&"smoke_size": [0.25, 4.0, 0.05],
	&"smoke_life": [0.25, 4.0, 0.05],
	&"rocket_size": [0.5, 3.0, 0.05],
	&"crater_size": [0.0, 2.0, 0.1],
	&"ragdoll_reach": [0.0, 3.0, 0.05],
	&"ragdoll_time": [0.1, 2.0, 0.05],
	&"ragdoll_spin": [0.0, 40.0, 1.0],
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
## Hit points of a loot box. The original game has 8, which is 4 shots of the pistol.
static var box_hp := 4.0
## Metres south of a loot box or a prop in which a shot still hits it. The view draws a shot above its place on the
## ground, so such a shot shows on the front of the thing.
static var box_front := 0.43
## Mean number of loot boxes in the yard of each building of a new map.
static var yard_boxes := 2.5
## Metres within which a bot with no target walks to a loot box and opens it. At 0, a bot leaves loot boxes alone, as
## in the original game.
static var bot_box_range := 0.0
## Seconds that a hedge, a door, a loot box or a prop burns before it breaks.
static var burn_time := 3.0
## Chance in each second that a burning cell sets each burnable cell next to it on fire.
static var burn_spread := 0.35
static var shake := 1.0
## Share of the distance to the player that the camera moves in each second.
static var camera_follow := 8.0
## At 1, a unit that walks into a low thing goes over it.
static var auto_vault := 1.0
## Multiplies the speed of a unit in a vault.
static var vault_speed := 1.0
## Seconds that a unit pushes into a low thing before it goes over.
static var vault_delay := 0.0
## Metres of the laser sight beam past the muzzle.
static var laser_length := 9.5
## Width in view pixels of the laser sight beam of the player. The beam of a bot is 3/4 as wide.
static var laser_width := 2.0
## Opacity of the laser sight beam of the player, from 0 to 1. The beam of a bot has 2/3 of it.
static var laser_alpha := 0.72
## Share of the rotten look of the ground, grass, walls, props and doors outside the arena.
static var rot := 1.0
## Strength of the calm tones of the ground and the grass inside the arena. At 0, the tones are bright.
static var ground_calm := 1.0
## Brightness of flowers.
static var flower_tone := 0.72
## Multiplies the speed at which the flowers of a hit appear. At 2, each flower waits half as long and grows in half
## the time.
static var flower_speed := 1.0
## Share of the sunk look of a flower on a marsh.
static var marsh_mark := 1.0
## Multiplies the life of each streak behind a shot or a thrown thing, and so the length of the trail.
static var trail_length := 1.0
## Multiplies the width of each streak.
static var trail_width := 1.0
## Multiplies the alpha of each streak.
static var trail_alpha := 1.0
## Smoke puffs of a rocket for each 0.09 m of its flight.
static var smoke_puffs := 4.0
## Multiplies the width and the growth of each smoke puff.
static var smoke_size := 1.0
## Multiplies the life of each smoke puff.
static var smoke_life := 1.0
## Multiplies the size of the rocket model.
static var rocket_size := 1.0
## Radius of the crater of a blast, as a share of the radius of the blast.
static var crater_size := 0.6
## Multiplies the distance that the body of a killed unit flies.
static var ragdoll_reach := 1.0
## Seconds of flight of the body of a killed unit.
static var ragdoll_time := 0.35
## Most radians a second that the body of a killed unit turns.
static var ragdoll_spin := 14.0
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
