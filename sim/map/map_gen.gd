class_name MapGen
## Builds a garden district. Four streets on each axis cut the map into blocks. The centre block is a plaza
## with a greenhouse full of high-tier loot. Two blocks become ponds. The other blocks hold one or two lots,
## each with a building from MapBuilding, a yard, an optional fence and loot.

enum { FREE, SOLID, CLEAR, COVERED }

const STREETS: Array[int] = [-33, -11, 11, 33]
## Obstacles lie inside INNER or outside OUTER metres, so the ring at the arena edge stays open.
const INNER := 37.0
const OUTER := 39.5
const ROADS: Array[TerrainMap.Tile] = [TerrainMap.Tile.DIRT_ROAD, TerrainMap.Tile.GRAVEL, TerrainMap.Tile.ROAD_EDGE]
const FLOORS: Array[TerrainMap.Tile] = [
	TerrainMap.Tile.WOOD_FLOOR, TerrainMap.Tile.TILE_FLOOR, TerrainMap.Tile.CONCRETE
]
const WET: Array[TerrainMap.Tile] = [TerrainMap.Tile.WATER, TerrainMap.Tile.MARSH]
## Prop kind -> [cells, solid]. Box kinds become obstacles.
const PROPS := {
	&"bed": [Vector2i(2, 2), true],
	&"table": [Vector2i(2, 1), true],
	&"chair": [Vector2i.ONE, true],
	&"bookshelf": [Vector2i(2, 1), true],
	&"shelf": [Vector2i(2, 1), true],
	&"counter": [Vector2i(2, 1), true],
	&"desk": [Vector2i(2, 1), true],
	&"workbench": [Vector2i(2, 1), true],
	&"crate": [Vector2i.ONE, true],
	&"barrel": [Vector2i.ONE, true],
	&"rug": [Vector2i(2, 2), false],
	&"plant": [Vector2i.ONE, false],
	&"planter": [Vector2i(2, 1), false],
	&"bench": [Vector2i(2, 1), true],
	&"flowerbed": [Vector2i(2, 1), false],
	&"wheelbarrow": [Vector2i(2, 1), true],
	&"rocks": [Vector2i.ONE, true],
	&"reeds": [Vector2i.ONE, false],
	&"lilies": [Vector2i.ONE, false],
	&"box": [Vector2i.ONE, true],
	&"high-tier-box": [Vector2i.ONE, true],
}
const YARD_PROPS: Array[StringName] = [&"bench", &"flowerbed", &"wheelbarrow", &"barrel", &"rocks", &"plant", &"crate"]

var rng: RandomNumberGenerator
var map: TerrainMap
var size: int
var half: int
## Per cell: FREE, SOLID, CLEAR (walkable and kept open) or COVERED (walkable prop).
var state := PackedByteArray()
var exits := []
var yards: Array[Dictionary] = []


static func generate(seed_rng: RandomNumberGenerator, map_size: int = Defs.MAP_SIZE) -> TerrainMap:
	var gen := MapGen.new()
	gen.rng = seed_rng
	gen.size = map_size
	gen.half = map_size / 2
	gen.map = TerrainMap.new(map_size)
	gen.state.resize(map_size * map_size)
	gen._ground()
	var blocks := gen._streets()
	var centre := Vector2i(gen.half, gen.half)
	var ponds := blocks.filter(
		func(b: Rect2i) -> bool: return not b.has_point(centre) and gen._far(b.grow(-1)) <= INNER
	)
	shuffle(seed_rng, ponds)
	for block in blocks:
		if block.has_point(centre):
			gen._lot(block.grow(-1), &"greenhouse", false)
		elif ponds.find(block) in [0, 1]:
			gen._pond(block, ponds.find(block) == 1)
		else:
			gen._lots(block.grow(-1))
	gen._paths()
	for yard in gen.yards:
		if yard.fence:
			gen._fence(yard.lot, &"hedge" if seed_rng.randf() < 0.5 else &"wall", 1)
		for i in seed_rng.randi_range(2, 4):
			gen.place(YARD_PROPS[seed_rng.randi_range(0, YARD_PROPS.size() - 1)], yard.lot.grow(-1), &"any")
		if seed_rng.randf() < 0.5:
			gen.place(&"box", yard.lot.grow(-1), &"any")
	gen._pickups()
	return gen.map


static func shuffle(shuffle_rng: RandomNumberGenerator, values: Array) -> void:
	for i in range(values.size() - 1, 0, -1):
		var j := shuffle_rng.randi_range(0, i)
		var swap: Variant = values[i]
		values[i] = values[j]
		values[j] = swap


## Debug view of `area` (whole map by default): # wall or hedge, = window, + door, o solid prop, $ loot box,
## ~ water, " marsh, . road, _ floor, space for grass.
static func ascii(terrain: TerrainMap, area := Rect2i()) -> String:
	if not area.has_area():
		area = Rect2i(0, 0, terrain.size, terrain.size)
	var grid := terrain.build_grid()
	var marks := {Defs.Mat.PROP: "o", Defs.Mat.BOX: "$", Defs.Mat.DOOR: "+"}
	var lines := PackedStringArray()
	for y in range(area.position.y, area.end.y):
		var line := ""
		for x in range(area.position.x, area.end.x):
			var i := y * terrain.size + x
			var tile := terrain.tiles[i]
			if grid.solid[i] == ObstacleGrid.LOW and grid.material[i] == Defs.Mat.WAREHOUSE:
				line += "="
			elif grid.solid[i]:
				line += marks.get(grid.material[i], "#")
			elif tile == TerrainMap.Tile.WATER:
				line += "~"
			elif tile == TerrainMap.Tile.MARSH:
				line += '"'
			else:
				line += "." if tile in ROADS else "_" if tile in FLOORS else " "
		lines.append(line)
	return "\n".join(lines)


func _tile(p: Vector2i) -> int:
	return map.tiles[p.y * size + p.x] if _inside(p) else TerrainMap.Tile.GRASS


func _set_tile(p: Vector2i, tile: TerrainMap.Tile) -> void:
	map.tiles[p.y * size + p.x] = tile


func _inside(p: Vector2i) -> bool:
	return p.x >= 0 and p.y >= 0 and p.x < size and p.y < size


func _cells(r: Rect2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			out.append(Vector2i(x, y))
	return out


## Warped blobs of grass, clover and wild grass, with one dirt blob in eight.
func _ground() -> void:
	var palette: Array[TerrainMap.Tile] = [
		TerrainMap.Tile.GRASS, TerrainMap.Tile.CLOVER, TerrainMap.Tile.WILD_GRASS, TerrainMap.Tile.DIRT
	]
	var blobs := []
	for i in 24:
		blobs.append(
			[
				Vector2(rng.randf(), rng.randf()) * size,
				size * rng.randf_range(0.08, 0.16),
				TerrainMap.Tile.GRASS if i % 8 == 3 else palette[i % 4]
			]
		)
	var phase := rng.randf() * TAU
	for y in size:
		for x in size:
			var p := Vector2(x + sin(y * 0.19 + phase) * 3.0, y + cos(x * 0.17 + phase) * 3.0)
			var best := 0.0
			var tile := TerrainMap.Tile.GRASS
			for blob in blobs:
				var strength: float = 1.0 - p.distance_to(blob[0]) / blob[1]
				if strength > best:
					best = strength
					tile = blob[2]
			_set_tile(Vector2i(x, y), tile)


## Paints footpaths, 1 to 3 cells wide, and returns the blocks between them.
func _streets() -> Array[Rect2i]:
	var lines: Array[PackedInt32Array] = []
	for axis in 2:
		var centres := PackedInt32Array()
		for offset in STREETS:
			centres.append(half + roundi(offset * size / 112.0) + rng.randi_range(-2, 2))
		lines.append(centres)
	for y in size:
		for x in size:
			var gaps := Vector2i(size, size)
			for c in lines[0]:
				gaps.x = mini(gaps.x, absi(x - c))
			for c in lines[1]:
				gaps.y = mini(gaps.y, absi(y - c))
			if gaps.x <= 1 and gaps.y <= 1:
				_set_tile(Vector2i(x, y), TerrainMap.Tile.GRAVEL)
			elif mini(gaps.x, gaps.y) == 0:
				_set_tile(Vector2i(x, y), TerrainMap.Tile.DIRT_ROAD)
			elif mini(gaps.x, gaps.y) == 1 and rng.randf() < 0.6:
				# A ragged side: the meadow comes up to the path.
				_set_tile(Vector2i(x, y), TerrainMap.Tile.ROAD_EDGE if rng.randf() < 0.5 else TerrainMap.Tile.DIRT_ROAD)
	var spans: Array[Array] = []
	for centres in lines:
		var span := [Vector2i(0, centres[0] - 2)]
		for i in range(1, centres.size()):
			span.append(Vector2i(centres[i - 1] + 2, centres[i] - 2))
		span.append(Vector2i(centres[-1] + 2, size - 1))
		spans.append(span)
	var blocks: Array[Rect2i] = []
	for sy: Vector2i in spans[1]:
		for sx: Vector2i in spans[0]:
			blocks.append(Rect2i(sx.x, sy.x, sx.y - sx.x + 1, sy.y - sy.x + 1))
	return blocks


## Splits a long lot in two with a 1-cell alley, then builds on each part.
## Farthest and nearest distance in metres from the origin to a cell rect.
func _far(r: Rect2i) -> float:
	var w := Rect2(r.position - Vector2i(half, half), r.size)
	return Vector2(maxf(absf(w.position.x), absf(w.end.x)), maxf(absf(w.position.y), absf(w.end.y))).length()


func _near(r: Rect2i) -> Vector2:
	var w := Rect2(r.position - Vector2i(half, half), r.size)
	return Vector2.ZERO.clamp(w.position, w.end)


## Trims a lot to lie inside INNER or outside OUTER. Keeps the larger result.
func _fit(lot: Rect2i) -> Rect2i:
	var inner := lot
	while inner.has_area() and _far(inner) > INNER:
		var w := Rect2(inner.position - Vector2i(half, half), inner.size)
		var on_x := maxf(absf(w.position.x), absf(w.end.x)) >= maxf(absf(w.position.y), absf(w.end.y))
		var low := absf(w.position.x if on_x else w.position.y) > absf(w.end.x if on_x else w.end.y)
		inner = inner.grow_individual(
			-int(on_x and low), -int(not on_x and low), -int(on_x and not low), -int(not on_x and not low)
		)
	var outer := lot
	while outer.has_area() and _near(outer).length() < OUTER:
		var n := _near(outer)
		var on_x := absf(n.x) >= absf(n.y)
		var low := (n.x if on_x else n.y) > 0.0 or (n.x if on_x else n.y) == 0.0 and rng.randf() < 0.5
		outer = outer.grow_individual(
			-int(on_x and low), -int(not on_x and low), -int(on_x and not low), -int(not on_x and not low)
		)
	return inner if inner.get_area() >= outer.get_area() else outer


func _lots(block_lot: Rect2i) -> void:
	var lot := _fit(block_lot)
	var along_x := lot.size.x < lot.size.y
	var long := maxi(lot.size.x, lot.size.y)
	if long < 18 or rng.randf() < 0.55:
		_lot(lot, &"", rng.randf() < 0.2)
		return
	var cut := long / 2 + rng.randi_range(-1, 1)
	_lot(MapBuilding.band(lot, along_x, 0, cut), &"", rng.randf() < 0.2)
	_lot(MapBuilding.band(lot, along_x, cut + 1, long - cut - 1), &"", rng.randf() < 0.2)


func _lot(lot: Rect2i, purpose: StringName, fenced: bool) -> void:
	var margin := 2 if fenced else rng.randi_range(1, 2)
	var room := lot.size - Vector2i(2, 2) * margin
	if room.x < 7 or room.y < 7:
		fenced = false
		margin = 1
		room = lot.size - Vector2i(2, 2)
	if room.x < 5 or room.y < 5:
		return
	var dims := Vector2i(rng.randi_range(maxi(5, room.x - 3), room.x), rng.randi_range(maxi(5, room.y - 3), room.y))
	dims = dims.min(Vector2i(18, 18))
	if purpose == &"":
		var choices: Array[StringName] = [&"house", &"house", &"shop", &"garage"]
		if dims.x * dims.y >= 120:
			choices = [&"house", &"office", &"office", &"shop", &"warehouse"]
		purpose = choices[rng.randi_range(0, choices.size() - 1)]
	var offset := Vector2i(rng.randi_range(0, room.x - dims.x), rng.randi_range(0, room.y - dims.y))
	var origin := lot.position + Vector2i(margin, margin) + offset
	_stamp(MapBuilding.plan(rng, purpose, dims), origin, purpose)
	yards.append({lot = lot, fence = fenced})


## Writes a plan into the map: wall obstacle, windows, floors, building record, furniture and loot.
func _stamp(plan: Dictionary, origin: Vector2i, purpose: StringName) -> void:
	var dims: Vector2i = plan.size
	var cells: PackedInt32Array = plan.cells
	var rooms: Array[Dictionary] = []
	for room in plan.rooms:
		rooms.append({rect = Rect2i(origin + room.rect.position, room.rect.size), kind = room.kind})
	var building := {kind = purpose, rect = Rect2i(origin, dims), rooms = rooms, doors = [] as Array[Vector2i]}
	var base := MapBuilding.floor_tile(rooms[0].kind)
	var mask: Array[PackedByteArray] = []
	for y in dims.y:
		var row := PackedByteArray()
		row.resize(dims.x)
		for x in dims.x:
			var p := origin + Vector2i(x, y)
			var code := cells[y * dims.x + x]
			if code == MapBuilding.OUT:
				continue
			_set_tile(p, MapBuilding.floor_tile(rooms[code].kind) if code >= 0 else base)
			if code in [MapBuilding.WALL, MapBuilding.WINDOW]:
				row[x] = 1 if code == MapBuilding.WALL else ObstacleGrid.LOW
				state[p.y * size + p.x] = SOLID
			elif code == MapBuilding.DOOR:
				building.doors.append(p)
				state[p.y * size + p.x] = CLEAR
		mask.append(row)
	var kind := &"warehouse" if purpose in [&"warehouse", &"garage"] else &"house"
	map.obstacles.append(_obstacle(kind, Rect2i(origin, dims), mask))
	map.buildings.append(building)
	for e in plan.exits:
		exits.append([origin + e[0], e[1]])
	for room in rooms:
		for item in MapBuilding.FURNITURE.get(room.kind, []):
			place(item[0], room.rect, item[1], building.rect)
	var loot := 3 if purpose == &"greenhouse" else 1 + int(rng.randf() < 0.5)
	var white := 1.0 if purpose == &"greenhouse" else 0.5 if purpose == &"warehouse" else 0.3
	for i in loot:
		var room: Dictionary = rooms[rng.randi_range(0, rooms.size() - 1)]
		place(&"high-tier-box" if rng.randf() < white else &"box", room.rect, &"wall", building.rect)


## Tries to put a prop in `area`. "wall" and "island" are indoor modes that keep the building in `guard`
## connected. "any" is outdoors and keeps a free ring around solid props.
func place(kind: StringName, area: Rect2i, mode: StringName, guard := Rect2i()) -> bool:
	var spec: Array = PROPS[kind]
	var shapes: Array[Vector2i] = [spec[0]]
	if spec[0].x != spec[0].y:
		shapes.append(Vector2i(spec[0].y, spec[0].x))
	var candidates: Array[Rect2i] = []
	for dims in shapes:
		for y in range(area.position.y, area.end.y - dims.y + 1):
			for x in range(area.position.x, area.end.x - dims.x + 1):
				var r := Rect2i(x, y, dims.x, dims.y)
				var on_x := x == area.position.x or r.end.x == area.end.x
				var on_y := y == area.position.y or r.end.y == area.end.y
				var ok := mode == &"any"
				if mode == &"wall":
					ok = on_y if dims.x > dims.y else on_x if dims.y > dims.x else on_x or on_y
				elif mode == &"island":
					ok = not on_x and not on_y
				if ok:
					candidates.append(r)
	if candidates.is_empty():
		return false
	var start := rng.randi_range(0, candidates.size() - 1)
	var tries := 0
	for i in candidates.size():
		var r := candidates[(start + i) % candidates.size()]
		if not _fits(r, spec[1], mode == &"any"):
			continue
		_mark(r, SOLID if spec[1] else COVERED)
		if not spec[1] or mode == &"any" or _connected(guard):
			if kind in [&"box", &"high-tier-box"]:
				map.obstacles.append(_obstacle(kind, r, []))
			else:
				var centre := Vector2(r.position - Vector2i(half, half)) + Vector2(r.size) / 2.0
				map.props.append(
					{kind = kind, x = centre.x, y = centre.y, width = r.size.x, height = r.size.y, solid = spec[1]}
				)
			return true
		_mark(r, FREE)
		tries += 1
		if tries >= 6:
			return false
	return false


func _fits(r: Rect2i, solid: bool, outdoor: bool) -> bool:
	for p in _cells(r):
		if not _inside(p) or state[p.y * size + p.x] != FREE:
			return false
		var tile := _tile(p)
		if outdoor and (tile in ROADS or tile in FLOORS or tile in WET):
			return false
		for d in MapBuilding.SIDES:
			if not outdoor and _inside(p + d) and state[(p + d).y * size + p.x + d.x] == CLEAR:
				return false
	if outdoor and solid:
		for p in _cells(r.grow(1)):
			if _inside(p) and state[p.y * size + p.x] in [SOLID, CLEAR]:
				return false
	return true


func _mark(r: Rect2i, value: int) -> void:
	for p in _cells(r):
		state[p.y * size + p.x] = value


## True when every open cell of `guard` links by open cells to the ring around it.
func _connected(guard: Rect2i) -> bool:
	var box := guard.grow(1).intersection(Rect2i(0, 0, size, size))
	var seen := {}
	var queue: Array[Vector2i] = []
	var open := 0
	for p in _cells(box):
		if state[p.y * size + p.x] == SOLID:
			continue
		open += 1
		if not guard.has_point(p):
			seen[p] = true
			queue.append(p)
	var i := 0
	while i < queue.size():
		for d in MapBuilding.SIDES:
			var n := queue[i] + d
			if box.has_point(n) and not seen.has(n) and state[n.y * size + n.x] != SOLID:
				seen[n] = true
				queue.append(n)
		i += 1
	return seen.size() == open


func _obstacle(kind: StringName, r: Rect2i, mask: Array) -> Dictionary:
	var centre := Vector2(r.position - Vector2i(half, half)) + Vector2(r.size) / 2.0
	return {kind = kind, x = centre.x, y = centre.y, width = r.size.x, height = r.size.y, tiles = mask}


func _add_obstacle(kind: StringName, r: Rect2i) -> void:
	var mask: Array[PackedByteArray] = []
	if kind == &"hedge":
		for y in r.size.y:
			var row := PackedByteArray()
			row.resize(r.size.x)
			row.fill(1)
			mask.append(row)
	map.obstacles.append(_obstacle(kind, r, mask))
	_mark(r, SOLID)


## Walks out of each entrance and lays a gravel path to the street.
func _paths() -> void:
	for e in exits:
		var p: Vector2i = e[0] + e[1]
		for i in 40:
			if not _inside(p) or state[p.y * size + p.x] == SOLID or _tile(p) == TerrainMap.Tile.DIRT_ROAD:
				break
			state[p.y * size + p.x] = CLEAR
			if _tile(p) not in FLOORS:
				_set_tile(p, TerrainMap.Tile.GRAVEL)
			p += e[1]


## Runs of hedge or fence along the ring of `r`. Paths make gates, and each side gets `gates` more 2-cell gaps.
func _fence(r: Rect2i, kind: StringName, gates: int) -> void:
	var sides: Array[Rect2i] = [
		MapBuilding.band(r, true, 0, 1),
		MapBuilding.band(r, true, r.size.y - 1, 1),
		MapBuilding.band(r.grow_individual(0, -1, 0, -1), false, 0, 1),
		MapBuilding.band(r.grow_individual(0, -1, 0, -1), false, r.size.x - 1, 1),
	]
	for side in sides:
		var cells := _cells(side)
		var open := {}
		for g in gates:
			var at := rng.randi_range(1, cells.size() - 3)
			open[at] = true
			open[at + 1] = true
		var run_start := -1
		for i in cells.size() + 1:
			var blocked := i < cells.size() and not open.has(i) and state[cells[i].y * size + cells[i].x] == FREE
			if blocked and run_start < 0:
				run_start = i
			elif not blocked and run_start >= 0:
				_add_obstacle(kind, Rect2i(cells[run_start], cells[i - 1] - cells[run_start] + Vector2i.ONE))
				run_start = -1


## An irregular pond: water with a sand rim, or a marsh with a small open pool.
func _pond(block: Rect2i, marsh: bool) -> void:
	var centre := Vector2(block.position) + Vector2(block.size) / 2.0
	var radius := Vector2(block.size) * Vector2(rng.randf_range(0.3, 0.38), rng.randf_range(0.3, 0.38))
	var phase := rng.randf() * TAU
	for p in _cells(block.grow(-2)):
		var d := (Vector2(p) + Vector2(0.5, 0.5) - centre) / radius
		var dist := d.length() / (1.0 + sin(d.angle() * 3.0 + phase) * 0.1)
		if dist < (0.35 if marsh else 0.75):
			_set_tile(p, TerrainMap.Tile.WATER)
		elif dist < (0.95 if marsh else 0.8):
			_set_tile(p, TerrainMap.Tile.MARSH)
		elif dist < 1.0 and not marsh:
			_set_tile(p, TerrainMap.Tile.SAND)
	for p in _cells(block.grow(-2)):
		var wet := 0
		for d in MapBuilding.SIDES:
			wet += int(_tile(p + d) in WET)
		var tile := _tile(p)
		if tile == TerrainMap.Tile.WATER and wet == 4 and rng.randf() < 0.12:
			_put_small(&"lilies", p)
		elif tile in WET and wet < 4 and rng.randf() < 0.35:
			_put_small(&"reeds", p)
	for kind in [&"bench", &"bench", &"flowerbed", &"flowerbed", &"rocks"]:
		place(kind, block.grow(-2), &"any")


func _put_small(kind: StringName, p: Vector2i) -> void:
	state[p.y * size + p.x] = COVERED
	map.props.append({kind = kind, x = p.x - half + 0.5, y = p.y - half + 0.5, width = 1, height = 1, solid = false})


## Up to 6 points in rooms, then road points, all within 38 m and 4.2 m apart.
func _pickups() -> void:
	var rooms: Array[Vector2i] = []
	for b in map.buildings:
		for room in b.rooms:
			rooms.append(room.rect.get_center())
	shuffle(rng, rooms)
	var roads: Array[Vector2i] = []
	for i in 400:
		roads.append(Vector2i(rng.randi_range(0, size - 1), rng.randi_range(0, size - 1)))
	var room_points := 0
	for p: Vector2i in rooms + roads:
		var in_room := room_points < 6 and rooms.has(p)
		if state[p.y * size + p.x] != FREE or not in_room and _tile(p) != TerrainMap.Tile.DIRT_ROAD:
			continue
		var world := Vector2(p - Vector2i(half, half)) + Vector2(0.5, 0.5)
		if (
			world.length() > 38.0
			or Array(map.pickup_points).any(func(q: Vector2) -> bool: return q.distance_to(world) < 4.2)
		):
			continue
		map.pickup_points.append(world)
		room_points += int(in_room)
		if map.pickup_points.size() >= Defs.PICKUP_CAPACITY:
			return
