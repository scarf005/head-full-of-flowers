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
]
const WALL_COLORS := {
	&"house": Color("e9dcc0"),
	&"office": Color("c3ccd6"),
	&"shop": Color("e3b877"),
	&"warehouse": Color("b5745f"),
	&"garage": Color("9a8f86"),
	&"greenhouse": Color("d6e6d0"),
}
## Wall thickness in metres per linear material. The other materials draw as boxes.
const THICK := {Defs.Mat.WALL: 0.22, Defs.Mat.WAREHOUSE: 0.4, Defs.Mat.HEDGE: 0.55}
const FLOORS: Array[int] = [TerrainMap.Tile.CONCRETE, TerrainMap.Tile.WOOD_FLOOR, TerrainMap.Tile.TILE_FLOOR]
const BOOKS: Array[Color] = [Color("c9584a"), Color("e0b64f"), Color("4f8a6a"), Color("5873b8")]
const DOOR_COLOR := Color("5a3d2a")
## Height in metres of the wall under a window.
const SILL := 0.5

static var _warp: FastNoiseLite

var grid: ObstacleGrid
var map: TerrainMap
var _boxes := MultiMesh.new()
var _revision := -1
## Cell index -> wall colour of the building that owns the cell.
var _walls := {}
var _boxes_material := ShaderMaterial.new()
## For each box, the cell that it stands on, or -1 for a box that stays.
var _owners := PackedInt32Array()
## Cell index -> the pixel art of the prop, rock or loot box that stands on it.
var _sprites := {}
var _sprite_material := ShaderMaterial.new()


func setup(world: SimWorld) -> void:
	grid = world.grid
	map = world.map
	_boxes_material.shader = preload("res://shaders/box.gdshader")
	_sprite_material.shader = preload("res://shaders/prop.gdshader")
	_sprite_material.set_shader_parameter(&"atlas", PropArt.atlas())
	# After the ink outline pass, as the units: the art has its own outline.
	_sprite_material.render_priority = 1
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
	if not _owners.is_empty():
		# A full rebuild takes more than 10 ms. Hide only the boxes of broken cells.
		for n in _owners.size():
			if _owners[n] >= 0 and grid.hp[_owners[n]] <= 0.0:
				_owners[n] = -1
				_boxes.set_instance_transform(n, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))
		for cell: int in _sprites.keys():
			if grid.hp[cell] <= 0.0:
				_sprites[cell].queue_free()
				_sprites.erase(cell)
		return
	var out := []
	for i in grid.material.size():
		_claim(out, i - 1)
		var mat := grid.material[i]
		if grid.hp[i] <= 0.0 or mat == Defs.Mat.PROP or mat == Defs.Mat.NONE:
			continue
		var cell := Vector2i(i % grid.size, i / grid.size)
		var centre := Vector2(cell) + Vector2(0.5 - grid.half, 0.5 - grid.half)
		var look: Array = CELL_LOOK[mat]
		if not THICK.has(mat):
			var box: StringName = &"box_high" if grid.high_tier[i] else &"box"
			_sprite(i, box if mat == Defs.Mat.BOX else &"rocks", centre, Vector2i.ONE)
			continue
		var color: Color = _walls.get(i, look[0]) if mat == Defs.Mat.WAREHOUSE else look[0]
		var thick: float = THICK[mat]
		var height: float = SILL if grid.solid[i] == ObstacleGrid.LOW else look[1]
		_box(out, centre, Vector2(thick, thick), height, color)
		for side: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			if _joins(cell + side):
				var arm := Vector2(side) * (0.25 + thick * 0.25)
				_box(
					out,
					centre + arm,
					Vector2(side).abs() * (0.5 - thick * 0.5) + Vector2(side.y, side.x).abs() * thick,
					height,
					color
				)
	_claim(out, grid.material.size() - 1)
	for prop in map.props:
		var i := grid.size * floori(prop.y + grid.half) + floori(prop.x + grid.half)
		if grid.hp[i] > 0.0:
			_sprite(i, prop.kind, Vector2(prop.x, prop.y), Vector2i(prop.width, prop.height))
	for building in map.buildings:
		for door: Vector2i in building.doors:
			var along_x := _joins(door + Vector2i.LEFT) or _joins(door + Vector2i.RIGHT)
			var hinge := Vector3(door.x - grid.half + 0.5, 0.3, door.y - grid.half + 0.5)
			hinge -= Vector3(0.5, 0, 0) if along_x else Vector3(0, 0, 0.5)
			var swing := Basis(Vector3.UP, (0.0 if along_x else -PI / 2.0) - 1.4)
			var leaf := (
				Transform3D(swing, hinge) * Transform3D(Basis.from_scale(Vector3(0.9, 0.6, 0.1)), Vector3(0.45, 0, 0))
			)
			out.append([leaf, DOOR_COLOR])
	_claim(out, -1)
	_boxes.instance_count = out.size()
	for n in out.size():
		_boxes.set_instance_transform(n, out[n][0])
		_boxes.set_instance_color(n, out[n][1])


## Draws a loot box that the match put on a free cell.
func add_box(cell: Vector2i) -> void:
	var i := cell.y * grid.size + cell.x
	_sprite(i, &"box_high" if grid.high_tier[i] else &"box", grid.center_of(cell), Vector2i.ONE)


## Records `cell` as the owner of the boxes added since the last call.
func _claim(out: Array, cell: int) -> void:
	while _owners.size() < out.size():
		_owners.append(cell)


## Adds the pixel art of a prop, a rock or a loot box on `cell`. `at` is the middle of its footprint of `cells`.
func _sprite(cell: int, kind: StringName, at: Vector2, cells: Vector2i) -> void:
	var node := MeshInstance3D.new()
	# 2 looks for rocks.
	node.mesh = PropArt.mesh(&"rocks2" if kind == &"rocks" and cell % 2 == 1 else kind, cells)
	node.material_override = _sprite_material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Props and units are upright art on the ground: the one nearer to the camera draws last. A flat prop sorts by
	# its north edge, so a unit on it draws over it.
	node.sorting_use_aabb_center = false
	var line := 0.2 if kind in PropArt.THIN else (-0.5 if kind in PropArt.FLAT else 0.5) * (cells.y - 0.1)
	# On the pixel grid of the view, so each art pixel is one whole view pixel.
	node.position = Vector3(at.x, 0.0, snappedf(at.y + line, 1.0 / (UnitView.PX_PER_M * sin(CameraRig.PITCH))))
	add_child(node)
	_sprites[cell] = node


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
	var moved := map.tile_at(p + _push(p) * 2.2)
	return raw if moved in FLOORS else moved


static func _push(p: Vector2) -> Vector2:
	return Vector2(_warp.get_noise_2d(p.x, p.y), _warp.get_noise_2d(p.x + 71.0, p.y - 37.0))


## One plane. The shader draws each ground kind and bends the borders with the same push as `tile()`.
func _ground() -> Node3D:
	tile(map, Vector2.ZERO)
	var kinds := Image.create_from_data(map.size, map.size, false, Image.FORMAT_R8, map.tiles)
	var push := Image.create_empty(map.size, map.size, false, Image.FORMAT_RGB8)
	for y in map.size:
		for x in map.size:
			var p := Vector2(x + 0.5, y + 0.5) - Vector2.ONE * map.size / 2.0
			var at := _push(p) * 0.5 + Vector2(0.5, 0.5)
			push.set_pixel(x, y, Color(at.x, at.y, 0.0))
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/ground.gdshader")
	material.set_shader_parameter("tiles", ImageTexture.create_from_image(kinds))
	material.set_shader_parameter("warp", ImageTexture.create_from_image(push))
	material.set_shader_parameter("map_size", float(map.size))
	var palette := TILE_COLORS.map(func(c: Color) -> Vector3: return Vector3(c.r, c.g, c.b))
	material.set_shader_parameter("palette", PackedVector3Array(palette))
	var plane := PlaneMesh.new()
	plane.size = Vector2(map.size, map.size)
	var node := MeshInstance3D.new()
	node.mesh = plane
	node.material_override = material
	return node
