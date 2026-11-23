class_name TerrainMap
## Generated garden: ground tiles, obstacle blueprints, props and loot points.
## World (x, y) maps to tile (floor(x) + size / 2, floor(y) + size / 2).

enum Tile {
	GRASS,
	CLOVER,
	WILD_GRASS,
	DIRT,
	DIRT_ROAD,
	ROAD_EDGE,
	GRAVEL,
	CONCRETE,
	WATER,
	MARSH,
	SAND,
	WOOD_FLOOR,
	TILE_FLOOR,
}

var size := Defs.MAP_SIZE
## Row-major: tiles[y * size + x].
var tiles: PackedByteArray
## Each: {kind, x, y, width, height, tiles}. kind is &"warehouse", &"house", &"hedge", &"wall", &"box" or
## &"high-tier-box". x, y is the world centre. tiles is an Array of PackedByteArray rows (1 = solid cell); it is
## used for warehouse, house and hedge and may be empty for the other kinds.
var obstacles: Array[Dictionary] = []
## Each: {kind, x, y, width, height, solid}. kind is a StringName such as &"bench". width and height are whole
## cells.
var props: Array[Dictionary] = []
var pickup_points: PackedVector2Array = []


func _init(map_size: int = Defs.MAP_SIZE) -> void:
	size = map_size
	tiles.resize(size * size)


func tile_at(p: Vector2) -> Tile:
	var half := size / 2
	var x := floori(p.x) + half
	var y := floori(p.y) + half
	if x < 0 or y < 0 or x >= size or y >= size:
		return Tile.GRASS
	return tiles[y * size + x] as Tile


static func speed_mul(tile: Tile) -> float:
	return 0.45 if tile == Tile.MARSH else 0.65 if tile == Tile.WATER else 1.0


func build_grid() -> ObstacleGrid:
	var grid := ObstacleGrid.new(size)
	var half := size / 2
	for o in obstacles:
		var mat := _material(o.kind)
		var high_tier: bool = o.kind == &"high-tier-box"
		var left := floori(o.x - o.width * 0.5 + half)
		var top := floori(o.y - o.height * 0.5 + half)
		if o.kind in [&"warehouse", &"house", &"hedge"]:
			for row in o.tiles.size():
				for col in o.tiles[row].size():
					if o.tiles[row][col]:
						grid.set_cell(Vector2i(left + col, top + row), mat)
			continue
		for row in maxi(1, floori(o.height)):
			for col in maxi(1, floori(o.width)):
				grid.set_cell(Vector2i(left + col, top + row), mat, high_tier)
	for prop in props:
		var left := floori(prop.x - prop.width / 2.0 + half)
		var top := floori(prop.y - prop.height / 2.0 + half)
		var cells := []
		for y in range(top, top + prop.height):
			for x in range(left, left + prop.width):
				grid.set_cell(Vector2i(x, y), Defs.Mat.PROP, false, prop.solid)
				cells.append(y * size + x)
		for cell: int in cells:
			grid.prop_cells[cell] = cells
	return grid


static func _material(kind: StringName) -> Defs.Mat:
	match kind:
		&"wall":
			return Defs.Mat.WALL
		&"warehouse", &"house":
			return Defs.Mat.WAREHOUSE
		&"hedge":
			return Defs.Mat.HEDGE
		_:
			return Defs.Mat.BOX
