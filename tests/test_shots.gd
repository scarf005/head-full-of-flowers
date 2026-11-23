extends GutTest
## Shots on an empty map: unit 0 fires along +x, unit 1 is its enemy.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2.ZERO
	a.aim = Vector2.RIGHT
	w.pickups.clear()
	w.bots_active = false


func test_grenade_launcher_shell_bursts_beside_an_enemy() -> void:
	# The shell flies along y = 0. The enemy stands 1.6 m beside that line, so the shell passes at about 0.9 m.
	Arsenal.equip(a, &"grenade-launcher", 6.0)
	b.pos = Vector2(6, 1.6)
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in 30:
		w.tick()
	var bursts := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"explosion")
	assert_eq(bursts.size(), 1)
	assert_lt(bursts[0].pos.x, 8.0, "the shell bursts beside the enemy, not at the end of its reach")
	assert_eq(b.deaths, 1, "the blast kills the enemy")
