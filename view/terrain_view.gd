class_name TerrainView
extends Node3D
## Ground tiles and obstacle cells of a match.

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
	[Color("e4dccb"), 1.2],
	[Color("b5745f"), 1.4],
	[Color("7b7f86"), 0.9],
	[Color("d9a441"), 0.8],
	[Color("2f6b3a"), 1.1],
	[Color("8b6a4c"), 0.7],
	[Color("9fd8e8"), 1.2],
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
	&"rug": [Color("b3525e"), 0.2],
	&"plant": [Color("3f9a4e"), 4.5],
	&"planter": [Color("57a84e"), 3.0],
	&"bench": [Color("9a7650"), 0.4],
	&"flowerbed": [Color("e58fb1"), 2.5],
	&"wheelbarrow": [Color("c0563e"), 0.5],
	&"rocks": [Color("8a8d92"), 0.6],
	&"reeds": [Color("9aa85a"), 5.0],
	&"lilies": [Color("7fd0a0"), 0.5],
}
const WALL_COLORS := {
	&"house": Color("e9dcc0"),
	&"office": Color("c3ccd6"),
	&"shop": Color("e3b877"),
	&"warehouse": Color("b5745f"),
	&"garage": Color("9a8f86"),
	&"greenhouse": Color("d6e6d0"),
}
const HIGH_TIER_COLOR := Color("f2f0e6")

var grid: ObstacleGrid
var _meshes: Array[MultiMeshInstance3D] = []
var _revision := -1
## Cell index -> [colour, height] that replaces the CELL_LOOK entry.
var _props := {}


func setup(world: SimWorld) -> void:
	grid = world.grid
	add_child(_ground(world.map))
	for building in world.map.buildings:
		var rect: Rect2i = building.rect
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				if grid.material[y * grid.size + x] == Defs.Mat.WAREHOUSE:
					_props[y * grid.size + x] = [WALL_COLORS[building.kind], CELL_LOOK[Defs.Mat.WAREHOUSE][1]]
	for prop in world.map.props:
		for cell: int in grid.prop_cells.get(grid.size * floori(prop.y + grid.half) + floori(prop.x + grid.half), []):
			_props[cell] = PROP_LOOK.get(prop.kind, CELL_LOOK[Defs.Mat.PROP])
	var box := BoxMesh.new()
	for mat in CELL_LOOK.size():
		var node := MultiMeshInstance3D.new()
		node.multimesh = MultiMesh.new()
		node.multimesh.transform_format = MultiMesh.TRANSFORM_3D
		node.multimesh.use_colors = true
		node.multimesh.mesh = box
		var material := StandardMaterial3D.new()
		material.vertex_color_use_as_albedo = true
		material.roughness = 1.0
		node.material_override = material
		add_child(node)
		_meshes.append(node)


func _process(_delta: float) -> void:
	if grid == null or grid.revision == _revision:
		return
	_revision = grid.revision
	var cells: Array[PackedInt32Array] = []
	cells.resize(CELL_LOOK.size())
	for i in grid.material.size():
		var mat := grid.material[i]
		if mat > 0 and grid.hp[i] > 0.0:
			cells[mini(mat, CELL_LOOK.size() - 1)].append(i)
	for mat in CELL_LOOK.size():
		var mm := _meshes[mat].multimesh
		mm.instance_count = cells[mat].size()
		for n in cells[mat].size():
			var i := cells[mat][n]
			var look: Array = _props.get(i, CELL_LOOK[mat])
			var built := mat in [Defs.Mat.WALL, Defs.Mat.WAREHOUSE, Defs.Mat.GLASS]
			var jitter := 1.0 if built else 0.9 + 0.2 * fposmod(sin(i * 12.9898) * 43758.5453, 1.0)
			var height: float = look[1] * (1.0 if grid.solid[i] else 0.15) * jitter
			var cell := Vector2i(i % grid.size, i / grid.size)
			var size := Vector3(1.0, height, 1.0) if grid.solid[i] else Vector3(0.9, height, 0.9)
			if mat == Defs.Mat.GLASS:
				size = Vector3(1.0, height, 0.3) if grid.is_solid(cell + Vector2i.LEFT) else Vector3(0.3, height, 1.0)
			var at := Vector3(cell.x - grid.half + 0.5, height * 0.5, cell.y - grid.half + 0.5)
			mm.set_instance_transform(n, Transform3D(Basis.from_scale(size), at))
			mm.set_instance_color(n, (HIGH_TIER_COLOR if grid.high_tier[i] else look[0]) * jitter)


func _ground(map: TerrainMap) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var half := map.size / 2.0
	for y in map.size:
		for x in map.size:
			var tile := map.tiles[y * map.size + x]
			var shade := 0.92 + 0.16 * fposmod(sin(x * 12.9898 + y * 78.233) * 43758.5453, 1.0)
			var color := TILE_COLORS[tile] * shade
			color.a = float(tile <= TerrainMap.Tile.WILD_GRASS)
			var corners := [Vector2(x, y), Vector2(x + 1, y), Vector2(x + 1, y + 1), Vector2(x, y + 1)]
			for index: int in [0, 1, 2, 0, 2, 3]:
				st.set_normal(Vector3.UP)
				st.set_color(color)
				st.add_vertex(Vector3(corners[index].x - half, 0.0, corners[index].y - half))
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/ground.gdshader")
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = material
	return node
