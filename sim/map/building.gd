class_name MapBuilding
## Floor plans. A footprint is a union of rectangular wings. Each wing interior gets an optional corridor
## spine and a recursive split into rooms. Doors follow a random spanning tree of the room graph plus some
## loops. Cell codes: OUT is open ground, WALL is wall, DOOR and WINDOW are wall gaps, 0 or more is a room id.

const OUT := -2
const WALL := -1
const DOOR := -3
const WINDOW := -4
const MAX_ROOM := 8
const SIDES: Array[Vector2i] = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]

## Room kinds by room size rank, largest first. The last kind repeats for more rooms.
const ROOM_KINDS := {
	&"house": [&"living", &"kitchen", &"bedroom", &"bath", &"bedroom", &"storage"],
	&"office": [&"meeting", &"office", &"office", &"storage", &"office"],
	&"shop": [&"shop", &"storage", &"office", &"bath", &"storage"],
	&"warehouse": [&"hall", &"hall", &"office", &"storage"],
	&"garage": [&"bay", &"workshop", &"storage"],
	&"greenhouse": [&"growing", &"growing", &"storage", &"growing"],
}
const SHAPES := {
	&"house": [&"rect", &"l", &"t"],
	&"office": [&"rect", &"l", &"u", &"court"],
	&"shop": [&"rect", &"l", &"t"],
	&"warehouse": [&"rect", &"l"],
	&"garage": [&"rect"],
	&"greenhouse": [&"rect", &"t", &"u"],
}
const WINDOW_CHANCE := {
	&"house": 0.3, &"office": 0.45, &"shop": 0.35, &"warehouse": 0.1, &"garage": 0.1, &"greenhouse": 0.9
}
const TILE_FLOOR_ROOMS: Array[StringName] = [&"kitchen", &"bath", &"shop", &"growing", &"meeting"]
const CONCRETE_ROOMS: Array[StringName] = [&"hall", &"storage", &"bay", &"workshop"]
## Furniture per room kind: [prop kind, placement]. "wall" puts the long side on a wall, "island" keeps a
## free cell all around.
const FURNITURE := {
	&"living": [[&"rug", &"island"], [&"table", &"island"], [&"bookshelf", &"wall"], [&"plant", &"wall"]],
	&"kitchen": [[&"counter", &"wall"], [&"counter", &"wall"], [&"table", &"island"], [&"chair", &"wall"]],
	&"bedroom": [[&"bed", &"wall"], [&"shelf", &"wall"], [&"plant", &"wall"]],
	&"bath": [[&"counter", &"wall"]],
	&"office": [[&"desk", &"wall"], [&"chair", &"wall"], [&"bookshelf", &"wall"], [&"plant", &"wall"]],
	&"meeting": [[&"table", &"island"], [&"chair", &"wall"], [&"chair", &"wall"], [&"bookshelf", &"wall"]],
	&"shop": [[&"counter", &"wall"], [&"shelf", &"island"], [&"shelf", &"island"], [&"plant", &"wall"]],
	&"storage": [[&"shelf", &"wall"], [&"crate", &"wall"], [&"barrel", &"wall"], [&"crate", &"wall"]],
	&"hall": [[&"crate", &"island"], [&"crate", &"island"], [&"shelf", &"wall"], [&"barrel", &"wall"]],
	&"bay": [[&"workbench", &"wall"], [&"barrel", &"wall"], [&"crate", &"wall"]],
	&"workshop": [[&"workbench", &"wall"], [&"shelf", &"wall"], [&"barrel", &"wall"]],
	&"growing": [[&"planter", &"island"], [&"planter", &"island"], [&"plant", &"wall"], [&"barrel", &"wall"]],
	&"corridor": [[&"plant", &"wall"]],
	&"courtyard": [[&"flowerbed", &"island"], [&"bench", &"wall"], [&"plant", &"wall"]],
}


## Returns {size, cells, rooms: [{rect, kind}], exits: [[cell, outward side]]}. Coordinates are local.
static func plan(rng: RandomNumberGenerator, purpose: StringName, size: Vector2i) -> Dictionary:
	var shapes: Array = SHAPES[purpose]
	var layout := _wings(rng, shapes[rng.randi_range(0, shapes.size() - 1)], size)
	var cells := PackedInt32Array()
	cells.resize(size.x * size.y)
	cells.fill(OUT)
	for wing: Rect2i in layout.wings:
		_fill(cells, size.x, wing, WALL)
	var rooms: Array[Dictionary] = []
	for wing: Rect2i in layout.wings:
		var inner := wing.grow(-1)
		_fill(cells, size.x, inner, 0)
		_divide(rng, cells, size.x, inner, rooms, purpose in [&"office", &"house", &"shop"])
	var ranked := rooms.filter(func(room: Dictionary) -> bool: return room.kind == &"")
	ranked.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.rect.get_area() > b.rect.get_area())
	var kinds: Array = ROOM_KINDS[purpose]
	for i in ranked.size():
		ranked[i].kind = kinds[mini(i, kinds.size() - 1)]
	if layout.court.has_area():
		rooms.append({rect = layout.court, kind = &"courtyard"})
	for i in rooms.size():
		_fill(cells, size.x, rooms[i].rect, i)
	var exits := _doors(rng, cells, size, rooms.size(), purpose)
	return {size = size, cells = cells, rooms = rooms, exits = exits}


## Cuts the footprint into wings. A court is an open rectangle that the wings ring.
static func _wings(rng: RandomNumberGenerator, shape: StringName, size: Vector2i) -> Dictionary:
	var w := size.x
	var h := size.y
	var wings: Array[Rect2i] = [Rect2i(0, 0, w, h)]
	var court := Rect2i()
	if shape == &"l" and w >= 10 and h >= 9:
		var wa := rng.randi_range(5, w - 4)
		var hb := rng.randi_range(5, h - 3)
		wings = [Rect2i(0, 0, wa, h), Rect2i(wa - 1, h - hb, w - wa + 1, hb)]
	elif shape == &"t" and w >= 13 and h >= 9:
		var ha := rng.randi_range(5, h - 4)
		var bw := rng.randi_range(5, w - 6)
		wings = [Rect2i(0, 0, w, ha), Rect2i((w - bw) / 2, ha - 1, bw, h - ha + 1)]
	elif shape == &"u" and w >= 13 and h >= 9:
		var ha := rng.randi_range(5, h - 4)
		var bw := rng.randi_range(5, (w - 3) / 2)
		wings = [Rect2i(0, h - ha, w, ha), Rect2i(0, 0, bw, h - ha + 1), Rect2i(w - bw, 0, bw, h - ha + 1)]
	elif shape == &"court" and w >= 15 and h >= 15:
		var d := rng.randi_range(5, mini(6, (mini(w, h) - 3) / 2))
		court = Rect2i(d, d, w - 2 * d, h - 2 * d)
		wings = [
			Rect2i(0, 0, w, d),
			Rect2i(0, h - d, w, d),
			Rect2i(0, d - 1, d, h - 2 * d + 2),
			Rect2i(w - d, d - 1, d, h - 2 * d + 2),
		]
	var flip_x := rng.randf() < 0.5
	var flip_y := rng.randf() < 0.5
	var flip := func(r: Rect2i) -> Rect2i:
		return Rect2i(
			w - r.end.x if flip_x else r.position.x, h - r.end.y if flip_y else r.position.y, r.size.x, r.size.y
		)
	return {wings = wings.map(flip), court = flip.call(court) if court.has_area() else court}


## A strip of `r` across its full width (along_x) or full height, starting `from` cells in.
static func band(r: Rect2i, along_x: bool, from: int, length: int) -> Rect2i:
	if along_x:
		return Rect2i(r.position.x, r.position.y + from, r.size.x, length)
	return Rect2i(r.position.x + from, r.position.y, length, r.size.y)


## Puts a 2-cell corridor along the long axis of a large wing, then splits the rest into rooms.
static func _divide(
	rng: RandomNumberGenerator, cells: PackedInt32Array, w: int, r: Rect2i, rooms: Array[Dictionary], spine: bool
) -> void:
	var along_x := r.size.x >= r.size.y
	var short := mini(r.size.x, r.size.y)
	if not spine or short < 6 or maxi(r.size.x, r.size.y) < 9:
		_split(rng, cells, w, r, rooms)
		return
	var start := 0
	if short >= 10:
		start = rng.randi_range(4, short - 6)
	elif rng.randf() < 0.5:
		start = short - 2
	rooms.append({rect = band(r, along_x, start, 2), kind = &"corridor"})
	for t in [start - 1, start + 2]:
		if t >= 0 and t < short:
			_fill(cells, w, band(r, along_x, t, 1), WALL)
	if start >= 4:
		_split(rng, cells, w, band(r, along_x, 0, start - 1), rooms)
	if start + 3 < short:
		_split(rng, cells, w, band(r, along_x, start + 3, short - start - 3), rooms)


## Recursive split with a 1-cell wall. Rooms stay 3 to MAX_ROOM cells on each side.
static func _split(
	rng: RandomNumberGenerator, cells: PackedInt32Array, w: int, r: Rect2i, rooms: Array[Dictionary]
) -> void:
	var must := r.size.x > MAX_ROOM or r.size.y > MAX_ROOM
	if maxi(r.size.x, r.size.y) < 7 or not must and rng.randf() < 0.6:
		rooms.append({rect = r, kind = &""})
		return
	var vertical := r.size.x > r.size.y or r.size.x == r.size.y and rng.randf() < 0.5
	var length := r.size.x if vertical else r.size.y
	var k := rng.randi_range(3, length - 4)
	_fill(cells, w, band(r, not vertical, k, 1), WALL)
	_split(rng, cells, w, band(r, not vertical, 0, k), rooms)
	_split(rng, cells, w, band(r, not vertical, k + 1, length - k - 1), rooms)


## Opens doors between rooms and to the outside, then puts windows in some outer walls. Returns the exits.
static func _doors(
	rng: RandomNumberGenerator, cells: PackedInt32Array, size: Vector2i, count: int, purpose: StringName
) -> Array:
	var pairs := {}
	var outside := {}
	var glass: Array[Vector2i] = []
	for y in size.y:
		for x in size.x:
			var p := Vector2i(x, y)
			if cells[y * size.x + x] != WALL:
				continue
			for axis in [Vector2i.RIGHT, Vector2i.DOWN]:
				var side := Vector2i(axis.y, axis.x)
				if _at(cells, size, p - side) != WALL or _at(cells, size, p + side) != WALL:
					continue
				var a := _at(cells, size, p - axis)
				var b := _at(cells, size, p + axis)
				if a >= 0 and b >= 0 and a != b:
					var key := Vector2i(mini(a, b), maxi(a, b))
					if not pairs.has(key):
						pairs[key] = []
					pairs[key].append(p)
				elif a >= 0 and b == OUT or b >= 0 and a == OUT:
					var out: Vector2i = axis if b == OUT else -axis
					if not outside.has(out):
						outside[out] = []
					outside[out].append(p)
					glass.append(p)
	var root := range(count)
	var find := func(i: int) -> int:
		while root[i] != i:
			i = root[i]
		return i
	var keys := pairs.keys()
	MapGen.shuffle(rng, keys)
	for key: Vector2i in keys:
		var ra: int = find.call(key.x)
		var rb: int = find.call(key.y)
		if ra != rb or rng.randf() < 0.35:
			root[ra] = rb
			_open(rng, cells, size, pairs[key], rng.randf() < 0.3)
	var exits := []
	var sides := outside.keys()
	MapGen.shuffle(rng, sides)
	var wide := purpose in [&"warehouse", &"garage"]
	for i in mini(sides.size(), 2 + int(rng.randf() < 0.4)):
		for cell in _open(rng, cells, size, outside[sides[i]], wide or rng.randf() < 0.2):
			exits.append([cell, sides[i]])
	for p in glass:
		if cells[p.y * size.x + p.x] == WALL and rng.randf() < WINDOW_CHANCE[purpose]:
			var near_door := false
			for y in range(-1, 2):
				for x in range(-1, 2):
					near_door = near_door or _at(cells, size, p + Vector2i(x, y)) == DOOR
			if not near_door:
				cells[p.y * size.x + p.x] = WINDOW
	return exits


## Opens one candidate cell, and its neighbour on the same wall when `wide`. Returns the opened cells.
static func _open(
	rng: RandomNumberGenerator, cells: PackedInt32Array, size: Vector2i, candidates: Array, wide: bool
) -> Array[Vector2i]:
	var cell: Vector2i = candidates[rng.randi_range(0, candidates.size() - 1)]
	var opened: Array[Vector2i] = [cell]
	for d in SIDES:
		if wide and opened.size() == 1 and candidates.has(cell + d):
			opened.append(cell + d)
	for p in opened:
		cells[p.y * size.x + p.x] = DOOR
	return opened


static func _at(cells: PackedInt32Array, size: Vector2i, p: Vector2i) -> int:
	if p.x < 0 or p.y < 0 or p.x >= size.x or p.y >= size.y:
		return OUT
	return cells[p.y * size.x + p.x]


static func _fill(cells: PackedInt32Array, w: int, r: Rect2i, value: int) -> void:
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			cells[y * w + x] = value


static func floor_tile(kind: StringName) -> TerrainMap.Tile:
	if kind in TILE_FLOOR_ROOMS:
		return TerrainMap.Tile.TILE_FLOOR
	if kind in CONCRETE_ROOMS:
		return TerrainMap.Tile.CONCRETE
	if kind == &"courtyard":
		return TerrainMap.Tile.CLOVER
	return TerrainMap.Tile.WOOD_FLOOR
