extends GutTest
## Doors on an empty map: one door at the cell that covers x 2 to 3 and y 0 to 1, in a wall that runs north-south.

var w: SimWorld
var a: SimUnit
var b: SimUnit
var door: Vector2i
var at: Vector2


func before_each() -> void:
	var map := TerrainMap.new()
	door = Vector2i(map.size / 2 + 2, map.size / 2)
	map.buildings.append({kind = &"house", rect = Rect2i(door, Vector2i.ONE), rooms = [], doors = [door]})
	w = SimWorld.new({seed = 7, size = 2}, map)
	at = w.grid.center_of(door)
	for dy in [-2, -1, 1, 2]:
		w.grid.set_cell(door + Vector2i(0, dy), Defs.Mat.WAREHOUSE)
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(-2.0, 0.5)
	b.pos = Vector2(8.0, 0.5)
	a.aim = Vector2.RIGHT
	w.pickups.clear()
	w.bots_active = false


func _tick(count: int) -> void:
	for n in count:
		w.tick()


func _fire() -> void:
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(30)


func _events(type: StringName) -> Array[Dictionary]:
	return w.events.filter(func(e: Dictionary) -> bool: return e.type == type)


func test_closed_door_stops_a_shot_and_the_line_of_sight() -> void:
	assert_eq(w.grid.ray_cell(a.pos, b.pos), door)
	_fire()
	assert_eq(b.hp, b.max_hp)


func test_door_opens_for_a_unit_that_comes_near_and_closes_behind_it() -> void:
	_tick(1)
	assert_true(w.grid.is_solid(door), "a unit 4.5 m away")
	a.pos = at + Vector2(-1.2, 0.0)
	_tick(1)
	assert_false(w.grid.is_solid(door), "a unit 1.2 m away")
	assert_eq(_events(&"door"), [{type = &"door", cell = door, open = true, from = a.pos}] as Array[Dictionary])
	a.pos = at + Vector2(3.0, 0.0)
	_tick(roundi(0.4 / (Defs.TICK * Defs.GAME_SPEED)))
	assert_false(w.grid.is_solid(door), "0.4 s after the unit left")
	_tick(roundi(0.2 / (Defs.TICK * Defs.GAME_SPEED)))
	assert_true(w.grid.is_solid(door), "0.6 s after the unit left")
	assert_eq(_events(&"door").size(), 2)
	assert_false(_events(&"door")[1].open)


func test_door_stays_open_while_a_grenade_lies_in_its_cell() -> void:
	a.pos = at + Vector2(-1.2, 0.0)
	_tick(1)
	var grenade := {owner = 0, team = a.team, molotov = false, pos = at, vel = Vector2.ZERO, ttl = 5.0}
	grenade.merge({bounces = 2, fuse = false, flown = 0.0})
	w.throwables.append(grenade)
	a.pos = Vector2(-8.0, 0.5)
	_tick(roundi(1.0 / (Defs.TICK * Defs.GAME_SPEED)))
	assert_eq(_events(&"door").size(), 1, "1 s after the unit left, the door did not close on the grenade")
	assert_eq(_events(&"cell").size(), 0, "the grenade does not hit the door")
	w.throwables.clear()
	_tick(roundi(0.6 / (Defs.TICK * Defs.GAME_SPEED)))
	assert_true(w.grid.is_solid(door), "0.6 s after the grenade is gone")


func test_unit_walks_through_a_door() -> void:
	assert_true(w.grid.is_solid(door), "the door is closed at the start")
	a.pos = Vector2(0.0, 0.5)
	a.move = Vector2.RIGHT
	_tick(60)
	assert_gt(a.pos.x, 4.0)


func test_shots_break_a_door_and_then_pass_its_cell() -> void:
	for n in 3:
		_fire()
	var broken := _events(&"cell").filter(func(e: Dictionary) -> bool: return e.destroyed)
	assert_eq(broken.size(), 1)
	assert_eq(broken[0].material, Defs.Mat.DOOR)
	assert_false(w.grid.is_solid(door))
	assert_lt(b.hp, b.max_hp, "the third shot hits the unit behind the broken door")
	a.pos = at + Vector2(8.0, 6.0)
	b.pos = a.pos
	_tick(60)
	assert_false(w.grid.is_solid(door), "a broken door does not close")


func test_path_of_a_bot_goes_through_a_closed_door() -> void:
	# The wall runs from the north border of the test to its south border, so the only way is the door.
	for dy in range(-12, 13):
		if dy != 0:
			w.grid.set_cell(door + Vector2i(0, dy), Defs.Mat.WAREHOUSE)
	assert_true(w.grid.is_solid(door), "the door is closed")
	var nav := NavGrid.new(w.grid)
	nav.sync(0.0)
	var path := nav.path(a.pos, b.pos)
	assert_true(Array(path).any(func(p: Vector2) -> bool: return w.grid.cell_of(p) == door), str(path))
