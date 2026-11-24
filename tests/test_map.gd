extends GutTest
## Checks the garden district generator on 20 seeds of the 112 m map.

const SEEDS := 20
const SIDES: Array[Vector2i] = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]

var _maps: Array[TerrainMap] = []
var _grids: Array[ObstacleGrid] = []


func before_all() -> void:
	for seed_value in SEEDS:
		_maps.append(_map(seed_value))
		_grids.append(_maps[-1].build_grid())


func _map(seed_value: int) -> TerrainMap:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	return MapGen.generate(rng)


## Distance in metres from the cell centre to the world origin.
func _radius(map: TerrainMap, cell: Vector2i) -> float:
	return (Vector2(cell) + Vector2(0.5, 0.5) - Vector2(map.size, map.size) / 2.0).length()


func _cells(r: Rect2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			out.append(Vector2i(x, y))
	return out


## True when a unit cannot walk into `cell`. A door opens for a unit.
func _blocks(grid: ObstacleGrid, cell: Vector2i) -> bool:
	return grid.is_solid(cell) and grid.material[cell.y * grid.size + cell.x] != Defs.Mat.DOOR


## Marks all cells that a unit can walk to from `start`.
func _flood(grid: ObstacleGrid, start: Vector2i, limit: float = INF) -> PackedByteArray:
	var seen := PackedByteArray()
	seen.resize(grid.size * grid.size)
	seen[start.y * grid.size + start.x] = 1
	var queue: Array[Vector2i] = [start]
	var i := 0
	while i < queue.size():
		for d in SIDES:
			var n := queue[i] + d
			if not grid.in_bounds(n) or _blocks(grid, n) or seen[n.y * grid.size + n.x]:
				continue
			if (Vector2(n) + Vector2(0.5, 0.5) - Vector2(grid.half, grid.half)).length() > limit:
				continue
			seen[n.y * grid.size + n.x] = 1
			queue.append(n)
		i += 1
	return seen


## A door is exterior when a side cell is open and lies in no room of its building. Returns the sides used.
func _exterior_sides(building: Dictionary, grid: ObstacleGrid) -> Dictionary:
	var sides := {}
	for door: Vector2i in building.doors:
		for d in SIDES:
			var n := door + d
			if grid.is_solid(n) or building.rooms.any(func(room: Dictionary) -> bool: return room.rect.has_point(n)):
				continue
			sides[d] = true
	return sides


func test_same_seed_gives_same_map_and_other_seed_differs() -> void:
	var again := _map(0)
	assert_eq(again.tiles, _maps[0].tiles)
	assert_eq(again.obstacles, _maps[0].obstacles)
	assert_eq(again.props, _maps[0].props)
	assert_eq(again.buildings, _maps[0].buildings)
	assert_eq(again.pickup_points, _maps[0].pickup_points)
	assert_ne(_maps[1].tiles, _maps[0].tiles)


func test_every_building_has_entrances_on_two_sides() -> void:
	for s in SEEDS:
		for b in _maps[s].buildings:
			assert_gte(_exterior_sides(b, _grids[s]).size(), 2, "seed %d: %s at %s" % [s, b.kind, b.rect])


func test_every_room_is_reachable_from_the_street() -> void:
	for s in SEEDS:
		var grid := _grids[s]
		var road := _maps[s].tiles.find(TerrainMap.Tile.DIRT_ROAD)
		var seen := _flood(grid, Vector2i(road % grid.size, road / grid.size))
		var shut: Array[String] = []
		for b in _maps[s].buildings:
			for room in b.rooms:
				for cell in _cells(room.rect):
					if not grid.is_solid(cell) and not seen[cell.y * grid.size + cell.x]:
						shut.append("%s %s %s" % [b.kind, room.kind, cell])
		assert_eq(shut, [] as Array[String], "seed %d" % s)


func test_props_never_cover_walls_or_doors() -> void:
	for s in SEEDS:
		var map := _maps[s]
		var blocked := {}
		for b in map.buildings:
			for door: Vector2i in b.doors:
				blocked[door] = &"door"
		for o in map.obstacles:
			if o.kind in [&"house", &"warehouse"]:
				var left := floori(o.x - o.width / 2.0) + map.size / 2
				var top := floori(o.y - o.height / 2.0) + map.size / 2
				for y in o.height:
					for x in o.width:
						if o.tiles.is_empty() or o.tiles[y][x]:
							blocked[Vector2i(left + x, top + y)] = o.kind
		for p in map.props:
			var left := floori(p.x - p.width / 2.0) + map.size / 2
			var top := floori(p.y - p.height / 2.0) + map.size / 2
			for y in p.height:
				for x in p.width:
					var cell := Vector2i(left + x, top + y)
					assert_false(blocked.has(cell), "seed %d: %s on %s at %s" % [s, p.kind, blocked.get(cell), cell])


func test_flowerbeds_and_pot_plants_stand_on_dry_ground() -> void:
	var wet := 0
	for map in _maps:
		for prop: Dictionary in map.props:
			if prop.kind not in [&"flowerbed", &"plant"]:
				continue
			# The 2 cell centres of a flowerbed are 0.5 m to each side of its middle on its long side.
			var long := Vector2(prop.width - 1, prop.height - 1) * 0.5
			for at: Vector2 in [Vector2(prop.x, prop.y) - long, Vector2(prop.x, prop.y) + long]:
				wet += int(map.tile_at(at) in MapGen.WET)
	assert_eq(wet, 0, "cells of flowerbeds and pot plants in water or marsh on 20 maps")


func test_pickup_points_lie_in_open_cells() -> void:
	for s in SEEDS:
		assert_between(_maps[s].pickup_points.size(), 4, Defs.PICKUP_CAPACITY)
		for p in _maps[s].pickup_points:
			assert_false(_grids[s].is_solid(_grids[s].cell_of(p)), "seed %d: pickup at %s" % [s, p])


func test_arena_holds_buildings_and_open_connected_ground() -> void:
	for s in SEEDS:
		var map := _maps[s]
		var grid := _grids[s]
		var near := map.buildings.filter(func(b: Dictionary) -> bool: return _radius(map, b.rect.get_center()) <= 40.0)
		assert_gte(near.size(), 4, "seed %d: buildings within 40 m" % s)
		var inside := _cells(Rect2i(0, 0, map.size, map.size)).filter(
			func(c: Vector2i) -> bool: return _radius(map, c) <= 40.0
		)
		var walkable := inside.filter(func(c: Vector2i) -> bool: return not grid.is_solid(c))
		assert_gte(float(walkable.size()) / inside.size(), 0.6, "seed %d: walkable share" % s)
		var roads := walkable.filter(
			func(c: Vector2i) -> bool: return map.tiles[c.y * map.size + c.x] == TerrainMap.Tile.DIRT_ROAD
		)
		var seen := _flood(grid, roads[roads.size() / 2], 38.0)
		var cut: Array[Vector2i] = []
		for cell in _cells(Rect2i(0, 0, map.size, map.size)):
			if _radius(map, cell) <= 38.0 and not grid.is_solid(cell) and not seen[cell.y * map.size + cell.x]:
				cut.append(cell)
		assert_eq(cut, [] as Array[Vector2i], "seed %d: cells cut off" % s)


## Counts rows and columns with no solid cell over the 80 m square around the origin. Expects 5 or more each.
func test_open_lanes_cross_the_arena() -> void:
	for s in SEEDS:
		var grid := _grids[s]
		var lanes := Vector2i.ZERO
		for i in range(grid.half - 40, grid.half + 40):
			var span := range(grid.half - 40, grid.half + 40)
			lanes.x += int(span.all(func(j: int) -> bool: return not grid.is_solid(Vector2i(i, j))))
			lanes.y += int(span.all(func(j: int) -> bool: return not grid.is_solid(Vector2i(j, i))))
		assert_true(lanes.x >= 5 and lanes.y >= 5, "seed %d: lanes %s" % [s, lanes])


## Casts 400 shots of 12 m from free points within 32 m of the origin on seeds 1 to 6. Expects 55 % or more to
## meet no cell that stops a shot over all seeds, and 45 % or more on each seed.
func test_most_12_m_shots_in_the_arena_meet_nothing() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	var shares := []
	for s in range(1, 7):
		var clear := 0
		for n in 400:
			var from := Vector2.from_angle(rng.randf() * TAU) * sqrt(rng.randf()) * 32.0
			while _grids[s].is_solid(_grids[s].cell_of(from)):
				from = Vector2.from_angle(rng.randf() * TAU) * sqrt(rng.randf()) * 32.0
			clear += int(_grids[s].ray_cell(from, from + Vector2.from_angle(rng.randf() * TAU) * 12.0).x < 0)
		shares.append(clear / 400.0)
	assert_gte(shares.reduce(func(a: float, b: float) -> float: return a + b) / 6.0, 0.55, str(shares))
	assert_gte(shares.min(), 0.45, str(shares))


func test_ascii_dump_draws_one_line_per_row() -> void:
	var lines := MapGen.ascii(_maps[0]).split("\n")
	assert_eq(lines.size(), _maps[0].size)
	assert_eq(lines[0].length(), _maps[0].size)
	assert_string_contains(MapGen.ascii(_maps[0]), "#")
	assert_string_contains(MapGen.ascii(_maps[0]), "+")
