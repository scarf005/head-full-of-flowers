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


## Fires the pistol of unit 0 along y = 0 at an enemy that stands at `feet`. Returns the damage that the enemy takes.
func _damage_at(feet: Vector2) -> float:
	b.pos = feet
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in 30:
		w.tick()
	return b.max_hp - b.hp


func test_shot_across_the_head_of_an_enemy_hits_it() -> void:
	# The view draws a unit that stands up to the north of its feet. The middle of its head is 0.7 m north of them.
	assert_gt(_damage_at(Vector2(6.0, 0.8)), 0.0, "the shot flies 0.8 m north of the feet")


func test_shot_past_the_top_of_the_head_or_south_of_the_feet_of_an_enemy_misses_it() -> void:
	assert_eq(_damage_at(Vector2(6.0, 1.6)), 0.0, "the shot flies 1.6 m north of the feet")
	assert_eq(_damage_at(Vector2(6.0, -0.8)), 0.0, "the shot flies 0.8 m south of the feet")


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


func test_last_round_of_a_magazine_starts_a_reload_with_its_event() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	a.slot().ammo = 1.0
	a.want_fire = true
	w.tick()
	assert_gt(a.reload_cooldown, 0.0)
	assert_true(w.events.any(func(e: Dictionary) -> bool: return e.type == &"reload" and e.unit == 0))
