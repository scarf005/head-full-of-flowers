extends GutTest
## Perks and weapon slots on an empty map: unit 0 stands at the origin and aims along +x, unit 1 is its enemy.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 3}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2.ZERO
	a.aim = Vector2.RIGHT
	b.pos = Vector2(0.0, 20.0)
	w.units[2].pos = Vector2(0.0, -20.0)
	w.pickups.clear()
	w.bots_active = false


func after_each() -> void:
	Tune.reset()


func _cell(x: float, mat: int) -> void:
	w.grid.set_cell(w.grid.cell_of(Vector2(x, 0.0)), mat)


func test_laser_goes_its_length_past_the_muzzle_on_open_ground() -> void:
	assert_almost_eq(Combat.laser_end(w, a), Vector2(a.radius + 0.12 + 9.5, 0.0), Vector2.ONE * 0.001)
	Tune.laser_length = 20.0
	assert_almost_eq(Combat.laser_end(w, a).x, a.radius + 0.12 + 20.0, 0.001)


func test_laser_stops_at_a_wall_and_goes_through_a_hedge() -> void:
	_cell(6.5, Defs.Mat.HEDGE)
	assert_gt(Combat.laser_end(w, a).x, 9.0, "a bullet goes through a hedge")
	_cell(4.5, Defs.Mat.ROCK)
	assert_almost_eq(Combat.laser_end(w, a).x, 4.0, 0.05, "at the near face of the rock")


func test_laser_stops_at_the_drawn_front_of_a_loot_box() -> void:
	# The beam goes east along y = 0.3. The front of the box in the cell north of that line reaches to y = 0.43, and a
	# bullet on that line hits the box.
	w.grid.set_cell(w.grid.cell_of(Vector2(4.5, -0.5)), Defs.Mat.BOX)
	a.pos = Vector2(0.0, 0.3)
	assert_almost_eq(Combat.laser_end(w, a).x, 4.0, 0.001, "at the west side of the front")


func test_laser_stops_at_the_nearest_enemy_and_not_at_a_friend() -> void:
	b.pos = Vector2(6.0, 0.0)
	w.units[2].pos = Vector2(3.0, 0.0)
	assert_between(Combat.laser_end(w, a).x, 3.0 - w.units[2].radius - 0.01, 3.0)
	w.units[2].team = a.team
	assert_between(Combat.laser_end(w, a).x, 6.0 - b.radius - 0.01, 6.0)


func test_each_unit_with_the_laser_sight_has_a_beam() -> void:
	var lasers: Lasers = add_child_autofree(Lasers.new())
	lasers.draw(w)
	assert_eq(lasers.mesh.get_surface_count(), 0, "no beam without the perk")
	Arsenal.apply_perk(a, &"laser_sight")
	Arsenal.apply_perk(b, &"laser_sight")
	lasers.draw(w)
	var corners: PackedVector3Array = lasers.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	assert_eq(corners.size(), 12, "two quads")
	var far := 0.0
	for corner in corners.slice(0, 6):
		far = maxf(far, corner.x)
	assert_almost_eq(far, Combat.laser_end(w, a).x, 0.001, "the beam of the player ends where its laser ends")


func _ids(u: SimUnit) -> Array:
	return u.slots.map(func(s: Dictionary) -> StringName: return s.id)


func test_empty_weapon_leaves_the_other_weapon_and_a_pistol() -> void:
	Arsenal.equip(a, &"shotgun", 8.0)
	Arsenal.equip(a, &"assault", 1.0)
	assert_eq(_ids(a), [&"assault", &"shotgun"], "the rifle takes the slot of the pistol")
	Combat.fire(w, a)
	assert_eq(_ids(a), [&"shotgun", &"pistol"], "as in the original game, a pistol comes back")
	assert_eq(a.weapon_id(), &"shotgun")


func test_empty_weapon_next_to_the_pistol_leaves_one_pistol() -> void:
	Arsenal.equip(a, &"assault", 1.0)
	Combat.fire(w, a)
	assert_eq(_ids(a), [&"pistol"])


func _throw_at(enemy: Vector2, other: Vector2, perk: bool) -> Array[float]:
	if perk:
		Arsenal.apply_perk(a, &"proximity_grenades")
	var c: SimUnit = w.units[2]
	for u: SimUnit in [b, c]:
		u.max_hp = 100.0
		u.hp = 100.0
	b.pos = enemy
	c.pos = other
	Shots.throw_secondary(w, a)
	for n in 60:
		w.tick()
	return [100.0 - b.hp, 100.0 - c.hp]


func test_fused_hand_grenade_gives_the_contact_hit_to_the_enemy_that_sets_it_off() -> void:
	var hurt := _throw_at(Vector2(8.0, 0.0), Vector2(8.0, 2.0), true)
	assert_gte(hurt[0], 20.0, "the enemy on the line takes the contact hit and the blast")
	assert_lt(hurt[1], 20.0, "the enemy beside it takes the blast only")
