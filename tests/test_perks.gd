extends GutTest
## Perks on an empty map: unit 0 stands at the origin and aims along +x, unit 1 is its enemy.

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
