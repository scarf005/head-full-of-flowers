class_name Defs
## Tuning numbers. Lengths in metres, times in seconds.

enum Mat { NONE, WALL, WAREHOUSE, ROCK, BOX, HEDGE, PROP, GLASS }

const TICK := 1.0 / 60.0
const GAME_SPEED := 0.75
const MATCH_SECONDS := 90.0
const MAP_SIZE := 112
const UNIT_HP := 10.0
const UNIT_SPEED := 10.0
const PLAYER_RADIUS := 0.3
const BOT_RADIUS := 0.28
const ARENA_BORDER_DAMAGE := 1.0
const ARENA_BORDER_DAMAGE_COOLDOWN := 0.16
const KILL_HP_BONUS := 3.0
const KILLS_PER_PERK_DROP := 5
const PRIMARY_SLOT_CAP := 2
const RESERVE_PICKUP_CAP := 3
const FLOWER_CAPACITY := 20000
const PROJECTILE_CAPACITY := 480
const PICKUP_CAPACITY := 12
const PICKUP_RADIUS := 0.8
const BURNT := -1

const GRENADE_COOLDOWN := 2.8
const MOLOTOV_COOLDOWN := 4.4

const MAT_HP: Array[float] = [0.0, 3.0, 4.0, 8.0, 8.0, 2.0, 3.0, 1.0]
const MAT_ARMOR: Array[float] = [0.0, 2.0, 2.0, 0.0, 0.0, 1.0, 0.0, 0.0]
## Prop kinds with their own hit points. A barrel blows up at the first hit, a crate takes 3 rifle hits.
const PROP_HP := {&"barrel": 1.0, &"crate": 9.0}

const WEAPON_IDS: Array[StringName] = [
	&"pistol",
	&"assault",
	&"shotgun",
	&"flamethrower",
	&"auto-shotgun",
	&"battle-rifle",
	&"grenade-launcher",
	&"rocket-launcher",
]
const LOOTABLE: Array[StringName] = [&"assault", &"shotgun", &"flamethrower"]
const HIGH_TIER: Array[StringName] = [&"auto-shotgun", &"battle-rifle", &"grenade-launcher", &"rocket-launcher"]

## kind: weapons of one kind share a slot. bundle: magazines per pickup (INF = endless reserve).
const WEAPONS := {
	&"pistol":
	{
		name = "Pistol",
		kind = &"sidearm",
		tier = 0,
		cooldown = 0.22,
		damage = 2.0,
		speed = 42.0,
		reach = 28.0,
		spread = 0.045,
		pellets = 1,
		radius = 0.24,
		projectile = &"ballistic",
		bundle = INF,
		mag = 8.0,
		reload = 0.75,
	},
	&"assault":
	{
		name = "Assault Rifle",
		kind = &"rifle",
		tier = 1,
		cooldown = 0.1,
		damage = 3.0,
		speed = 50.0,
		reach = 30.0,
		spread = 0.085,
		pellets = 1,
		radius = 0.24,
		projectile = &"ballistic",
		bundle = 2.0,
		mag = 30.0,
		reload = 0.6,
	},
	&"shotgun":
	{
		name = "Shotgun",
		kind = &"shotgun",
		tier = 1,
		cooldown = 0.5,
		damage = 2.0,
		speed = 38.0,
		reach = 16.0,
		spread = 0.3,
		pellets = 8,
		radius = 0.26,
		projectile = &"ballistic",
		ricochets = 5,
		bundle = 2.0,
		mag = 6.0,
		reload = 0.8,
	},
	&"flamethrower":
	{
		name = "Flamethrower",
		kind = &"flame",
		tier = 1,
		cooldown = 0.06,
		damage = 4.0,
		speed = 24.0,
		reach = 11.0,
		spread = 0.33,
		pellets = 1,
		radius = 0.18,
		projectile = &"flame",
		bundle = 2.0,
		mag = 45.0,
		reload = 0.9,
	},
	&"auto-shotgun":
	{
		name = "Auto Shotgun",
		kind = &"shotgun",
		tier = 2,
		cooldown = 0.16,
		damage = 2.0,
		speed = 38.0,
		reach = 14.0,
		spread = 0.35,
		pellets = 8,
		radius = 0.25,
		projectile = &"ballistic",
		ricochets = 5,
		bundle = 2.0,
		mag = 6.0,
		reload = 0.78,
	},
	&"battle-rifle":
	{
		name = "Battle Rifle",
		kind = &"rifle",
		tier = 2,
		cooldown = 0.2,
		damage = 4.0,
		speed = 52.0,
		reach = 33.0,
		spread = 0.1,
		pellets = 1,
		radius = 0.24,
		projectile = &"ballistic",
		burst_shots = 3,
		burst_spread = 0.028,
		burst_interval = 0.06,
		bundle = 2.0,
		mag = 20.0,
		reload = 1.0,
	},
	&"grenade-launcher":
	{
		name = "Grenade Launcher",
		kind = &"grenade-launcher",
		tier = 2,
		cooldown = 0.7,
		damage = 20.0,
		speed = 40.0,
		reach = 21.0,
		spread = 0.015,
		pellets = 1,
		radius = 0.34,
		projectile = &"grenade",
		bundle = 1.0,
		mag = 6.0,
		reload = 1.5,
	},
	&"rocket-launcher":
	{
		name = "Rocket Launcher",
		kind = &"rocket-launcher",
		tier = 2,
		cooldown = 0.66,
		damage = 20.0,
		speed = 20.0,
		reach = 24.0,
		spread = 0.012,
		pellets = 1,
		radius = 0.38,
		projectile = &"rocket",
		accel = 150.0,
		bundle = 3.0,
		mag = 1.0,
		reload = 1.5,
	},
}

const PERKS := {
	&"laser_sight": {name = "Laser Sight", max = 1},
	&"ricochet_shells": {name = "Ricochet Shells", max = 1},
	&"proximity_grenades": {name = "Proximity Grenades", max = 1},
	&"rapid_reload": {name = "Rapid Reload", max = 1},
	&"kill_reload": {name = "Adrenal Reload", max = 1},
	&"heavy_pellets": {name = "Heavy Pellets", max = 1},
	&"extra_heart": {name = "Extra Heart", max = 4},
	&"extra_stamina": {name = "Extra Stamina", max = 1},
	&"kevlar_vest": {name = "Kevlar Vest", max = 1},
}

const PLAYER_COLOR := Color("f2ffe8")
const BOT_COLORS: Array[Color] = [
	Color("7aa6ff"),
	Color("ff9c8e"),
	Color("89d7b7"),
	Color("f7c276"),
	Color("c7a8ff"),
	Color("f3a7d8"),
	Color("9fd4ff"),
]
const TEAM_COLORS: Array[Color] = [
	Color("ff6f7b"),
	Color("68a8ff"),
	Color("84d8a4"),
	Color("f0bd6a"),
	Color("c9a5ff"),
	Color("ff9dd2"),
]
const BURNT_COLOR := Color("4a453d")


static func pickup_ammo(weapon_id: StringName) -> float:
	var weapon: Dictionary = WEAPONS[weapon_id]
	return weapon.mag * weapon.bundle


static func ammo_cap(weapon_id: StringName) -> float:
	var weapon: Dictionary = WEAPONS[weapon_id]
	var bundle: float = 1.0 if is_inf(weapon.bundle) else maxf(1.0, floorf(weapon.bundle))
	return bundle * RESERVE_PICKUP_CAP * weapon.mag


## Arena radius at match start and end for a player count.
static func arena_radii(players: int) -> Vector2:
	var scale := (clampf(players, 2.0, 8.0) - 2.0) / 6.0
	return Vector2(lerpf(30.0, 40.0, scale), lerpf(15.0, 20.0, scale))
