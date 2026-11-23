class_name TerrainView
extends Node3D
## Ground and obstacles of a match, drawn like a floor plan: thin walls, door leaves and one box for each
## piece of furniture.

const TILE_COLORS: Array[Color] = [
	Color("457a36"),
	Color("4f8a3c"),
	Color("3a6a2e"),
	Color("8a6a48"),
	Color("9a8262"),
	Color("7d7256"),
	Color("8d8d86"),
	Color("a3a39c"),
	Color("3f6f9a"),
	Color("4d6b4a"),
	Color("cdb983"),
	Color("9b6f48"),
	Color("b9c2c4"),
]
## Per Defs.Mat: [colour, height in metres].
const CELL_LOOK := [
	[Color.BLACK, 0.0],
	[Color("8a6a4c"), 0.8],
	[Color("b5745f"), 1.3],
	[Color("7b7f86"), 0.9],
	[Color("d9a441"), 0.8],
	[Color("2f6b3a"), 0.9],
	[Color("8b6a4c"), 0.7],
	[Color("9fd8e8"), 1.3],
]
## Per prop kind: [colour, height in metres].
const PROP_LOOK := {
	&"bed": [Color("c9d4ee"), 0.45],
	&"table": [Color("a8794e"), 0.6],
	&"chair": [Color("8a5f3c"), 0.5],
	&"bookshelf": [Color("6e4a34"), 1.1],
	&"shelf": [Color("8d8f96"), 1.0],
	&"counter": [Color("d7d2c8"), 0.7],
	&"desk": [Color("94704a"), 0.6],
	&"workbench": [Color("70757d"), 0.7],
	&"crate": [Color("c79a55"), 0.8],
	&"barrel": [Color("b0483c"), 0.9],
	&"rug": [Color("b3525e"), 0.03],
	&"plant": [Color("3f9a4e"), 0.7],
	&"planter": [Color("57a84e"), 0.45],
	&"bench": [Color("9a7650"), 0.4],
	&"flowerbed": [Color("e58fb1"), 0.35],
	&"wheelbarrow": [Color("c0563e"), 0.5],
	&"rocks": [Color("8a8d92"), 0.6],
	&"reeds": [Color("9aa85a"), 0.75],
	&"lilies": [Color("7fd0a0"), 0.05],
}
const WALL_COLORS := {
	&"house": Color("e9dcc0"),
	&"office": Color("c3ccd6"),
	&"shop": Color("e3b877"),
	&"warehouse": Color("b5745f"),
	&"garage": Color("9a8f86"),
	&"greenhouse": Color("d6e6d0"),
}
## Wall thickness in metres per linear material. The other materials draw as boxes.
const THICK := {Defs.Mat.WALL: 0.22, Defs.Mat.WAREHOUSE: 0.4, Defs.Mat.GLASS: 0.12, Defs.Mat.HEDGE: 0.55}
const FLOORS: Array[int] = [TerrainMap.Tile.CONCRETE, TerrainMap.Tile.WOOD_FLOOR, TerrainMap.Tile.TILE_FLOOR]
const DOOR_COLOR := Color("5a3d2a")
const HIGH_TIER_COLOR := Color("f2f0e6")

static var _warp: FastNoiseLite

var grid: ObstacleGrid
var map: TerrainMap
var _boxes := MultiMesh.new()
var _revision := -1
## Cell index -> wall colour of the building that owns the cell.
var _walls := {}
var _boxes_material := StandardMaterial3D.new()


func setup(world: SimWorld) -> void:
	grid = world.grid
	map = world.map
	_boxes_material.vertex_color_use_as_albedo = true
	_boxes_material.roughness = 1.0
	add_child(_ground())
	for building in map.buildings:
		var rect: Rect2i = building.rect
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				_walls[y * grid.size + x] = WALL_COLORS[building.kind]
	_boxes.transform_format = MultiMesh.TRANSFORM_3D
	_boxes.use_colors = true
	_boxes.mesh = BoxMesh.new()
	var node := MultiMeshInstance3D.new()
	node.multimesh = _boxes
	node.material_override = _boxes_material
	add_child(node)


func _process(_delta: float) -> void:
	if grid == null or grid.revision == _revision:
		return
	_revision = grid.revision
	var out := []
	for i in grid.material.size():
		var mat := grid.material[i]
		if grid.hp[i] <= 0.0 or mat == Defs.Mat.PROP or mat == Defs.Mat.NONE:
			continue
		var cell := Vector2i(i % grid.size, i / grid.size)
		var centre := Vector2(cell) + Vector2(0.5 - grid.half, 0.5 - grid.half)
		var look: Array = CELL_LOOK[mat]
		if not THICK.has(mat):
			var rock := float(mat == Defs.Mat.ROCK) * (0.5 + 0.5 * sin(i * 12.9898))
			var size := Vector2(0.78, 0.78) + Vector2(0.3, -0.1) * rock
			_box(out, centre, size, look[1] * (1.0 - 0.4 * rock), HIGH_TIER_COLOR if grid.high_tier[i] else look[0])
			out[-1][0] = out[-1][0].rotated_local(Vector3.UP, rock * 5.0)
			continue
		var color: Color = _walls.get(i, look[0]) if mat == Defs.Mat.WAREHOUSE else look[0]
		var thick: float = THICK[mat]
		_box(out, centre, Vector2(thick, thick), look[1], color)
		for side: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			if _joins(cell + side):
				var arm := Vector2(side) * (0.25 + thick * 0.25)
				_box(
					out,
					centre + arm,
					Vector2(side).abs() * (0.5 - thick * 0.5) + Vector2(side.y, side.x).abs() * thick,
					look[1],
					color
				)
	for prop in map.props:
		var i := grid.size * floori(prop.y + grid.half) + floori(prop.x + grid.half)
		if grid.hp[i] > 0.0:
			var look: Array = PROP_LOOK.get(prop.kind, CELL_LOOK[Defs.Mat.PROP])
			var inset := 0.5 if prop.width * prop.height == 1 and not prop.solid else 0.2
			_box(out, Vector2(prop.x, prop.y), Vector2(prop.width - inset, prop.height - inset), look[1], look[0])
	for building in map.buildings:
		for door: Vector2i in building.doors:
			var along_x := _joins(door + Vector2i.LEFT) or _joins(door + Vector2i.RIGHT)
			var hinge := Vector3(door.x - grid.half + 0.5, 0.55, door.y - grid.half + 0.5)
			hinge -= Vector3(0.5, 0, 0) if along_x else Vector3(0, 0, 0.5)
			var swing := Basis(Vector3.UP, (0.0 if along_x else -PI / 2.0) - 1.1)
			var leaf := (
				Transform3D(swing, hinge) * Transform3D(Basis.from_scale(Vector3(0.9, 1.1, 0.08)), Vector3(0.45, 0, 0))
			)
			out.append([leaf, DOOR_COLOR])
	_boxes.instance_count = out.size()
	for n in out.size():
		_boxes.set_instance_transform(n, out[n][0])
		_boxes.set_instance_color(n, Quality.raw(out[n][1]))


## True when a wall, window, fence or hedge stands in `cell`.
func _joins(cell: Vector2i) -> bool:
	return grid.is_solid(cell) and THICK.has(grid.material[cell.y * grid.size + cell.x])


func _box(out: Array, centre: Vector2, size: Vector2, height: float, color: Color) -> void:
	var basis := Basis.from_scale(Vector3(size.x, height, size.y))
	out.append([Transform3D(basis, Vector3(centre.x, height * 0.5, centre.y)), color])


## Ground kind at a world point. Borders between outdoor kinds wander off the tile grid. Floors keep their tile.
static func tile(map: TerrainMap, p: Vector2) -> TerrainMap.Tile:
	if _warp == null:
		_warp = FastNoiseLite.new()
		_warp.frequency = 0.2
		_warp.fractal_octaves = 2
	var raw := map.tile_at(p)
	if raw in FLOORS:
		return raw
	var push := Vector2(_warp.get_noise_2d(p.x, p.y), _warp.get_noise_2d(p.x + 71.0, p.y - 37.0))
	var moved := map.tile_at(p + push * 2.2)
	return raw if moved in FLOORS else moved


## One plane with a ground texture of 4 pixels for each metre, and hard-edged quads for the floors.
func _ground() -> Node3D:
	var side := map.size * 4
	var half := map.size / 2.0
	var data := PackedByteArray()
	data.resize(side * side * 4)
	for y in side:
		for x in side:
			var kind := tile(map, Vector2(x + 0.5, y + 0.5) / 4.0 - Vector2(half, half))
			var color := TILE_COLORS[TerrainMap.Tile.DIRT if kind in FLOORS else kind]
			var at := (y * side + x) * 4
			data[at] = color.r8
			data[at + 1] = color.g8
			data[at + 2] = color.b8
			data[at + 3] = 255 if kind <= TerrainMap.Tile.WILD_GRASS else 0
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/ground.gdshader")
	var image := Image.create_from_data(side, side, false, Image.FORMAT_RGBA8, data)
	material.set_shader_parameter("tiles", ImageTexture.create_from_image(image))
	var plane := PlaneMesh.new()
	plane.size = Vector2(map.size, map.size)
	var node := MeshInstance3D.new()
	node.mesh = plane
	node.material_override = material
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for y in map.size:
		for x in map.size:
			var kind := map.tiles[y * map.size + x]
			for corner: Vector2i in [
				Vector2i.ZERO, Vector2i.RIGHT, Vector2i.ONE, Vector2i.ZERO, Vector2i.ONE, Vector2i.DOWN
			]:
				if kind in FLOORS:
					st.set_normal(Vector3.UP)
					st.set_color(Quality.raw(TILE_COLORS[kind]))
					st.add_vertex(Vector3(x + corner.x - half, 0.02, y + corner.y - half))
	var floors := MeshInstance3D.new()
	floors.mesh = st.commit()
	floors.material_override = _boxes_material
	node.add_child(floors)
	return node
