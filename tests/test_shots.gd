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


func after_each() -> void:
	Tune.reset()


## Fires the pistol of unit 0 along y = 0 at an enemy that stands at `feet`. Returns the damage that the enemy takes.
func _damage_at(feet: Vector2) -> float:
	b.pos = feet
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in 30:
		w.tick()
	return b.max_hp - b.hp


## Fires the pistol of unit 0 to the east along a line `south` metres south of the cell 5 m ahead, in which a thing
## of `mat` stands. The shot has no spread. Returns the hit points that the thing loses.
func _front_damage(mat: Defs.Mat, south: float) -> float:
	Tune.spread = 0.0
	var cell := w.grid.cell_of(Vector2(5.5, -0.5))
	w.grid.set_cell(cell, mat)
	a.pos = Vector2(0.0, south)
	b.pos = Vector2(-10.0, 0.0)
	a.want_fire = true
	w.tick()
	a.want_fire = false
	for n in 30:
		w.tick()
	return Defs.MAT_HP[mat] - w.grid.hp[cell.y * w.grid.size + cell.x]


func test_shot_across_the_drawn_front_of_a_loot_box_or_a_prop_hits_it() -> void:
	# The view draws a shot 7 px above its place on the ground, so a shot that flies up to 0.43 m south of a cell
	# shows on the front of the thing in that cell.
	assert_eq(_front_damage(Defs.Mat.BOX, 0.3), 2.0, "a pistol shot 0.3 m south of the box")
	assert_eq(_front_damage(Defs.Mat.PROP, 0.3), 2.0, "a pistol shot 0.3 m south of the prop")


func test_shot_south_of_the_drawn_front_of_a_loot_box_flies_on() -> void:
	assert_eq(_front_damage(Defs.Mat.BOX, 0.6), 0.0, "a pistol shot 0.6 m south of the box")
	Tune.box_front = 0.0
	assert_eq(_front_damage(Defs.Mat.BOX, 0.3), 0.0, "with a front of 0 m, a shot 0.3 m south of the box")


func test_front_of_a_loot_box_is_as_deep_as_the_view_lifts_a_shot() -> void:
	assert_almost_eq(Tune.box_front, GameView.SHOT_HEIGHT / tan(CameraRig.PITCH), 0.005)


func test_shot_past_the_south_side_of_a_rock_flies_on() -> void:
	assert_eq(_front_damage(Defs.Mat.ROCK, 0.3), 0.0, "a pistol shot 0.3 m south of the rock")


func test_shot_of_a_unit_that_stands_at_the_front_of_a_loot_box_flies_on() -> void:
	var cell := w.grid.cell_of(Vector2(0.5, -0.5))
	w.grid.set_cell(cell, Defs.Mat.BOX)
	Tune.spread = 0.0
	a.pos = Vector2(0.2, 0.2)
	assert_gt(_damage_at(Vector2(6.0, 0.4)), 0.0, "the enemy 5.8 m east of the unit")
	assert_eq(w.grid.hp[cell.y * w.grid.size + cell.x], Defs.MAT_HP[Defs.Mat.BOX])


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
