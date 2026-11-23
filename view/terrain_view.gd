class_name TerrainView
extends Node3D
## Ground tiles and obstacle cells of a match.

const TILE_COLORS: Array[Color] = [
	Color("5d8a45"),
	Color("6c9a4c"),
	Color("4f7a3c"),
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
	[Color("d8d2c4"), 1.5],
	[Color("a9756a"), 1.7],
	[Color("7b7f86"), 0.9],
	[Color("d9a441"), 0.8],
	[Color("2f6b3a"), 1.1],
	[Color("8b6a4c"), 0.7],
	[Color("9fd8e8"), 1.5],
]

var grid: ObstacleGrid
var _meshes: Array[MultiMeshInstance3D] = []
var _revision := -1


func setup(world: SimWorld) -> void:
	grid = world.grid
	add_child(_ground(world.map))
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
			var jitter := 0.9 + 0.2 * fposmod(sin(i * 12.9898) * 43758.5453, 1.0)
			var height: float = CELL_LOOK[mat][1] * (1.0 if grid.solid[i] else 0.15) * (0.95 + 0.1 * jitter)
			var at := Vector3(i % grid.size - grid.half + 0.5, height * 0.5, i / grid.size - grid.half + 0.5)
			mm.set_instance_transform(n, Transform3D(Basis.from_scale(Vector3(1.0, height, 1.0)), at))
			mm.set_instance_color(n, CELL_LOOK[mat][0] * jitter)


func _ground(map: TerrainMap) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var half := map.size / 2.0
	for y in map.size:
		for x in map.size:
			var tile := map.tiles[y * map.size + x]
			var shade := 0.92 + 0.16 * fposmod(sin(x * 12.9898 + y * 78.233) * 43758.5453, 1.0)
			var color := TILE_COLORS[tile] * shade
			var corners := [Vector2(x, y), Vector2(x + 1, y), Vector2(x + 1, y + 1), Vector2(x, y + 1)]
			for index: int in [0, 1, 2, 0, 2, 3]:
				st.set_normal(Vector3.UP)
				st.set_color(color)
				st.add_vertex(Vector3(corners[index].x - half, 0.0, corners[index].y - half))
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.roughness = 1.0
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	node.material_override = material
	return node
