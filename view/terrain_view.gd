class_name TerrainView
extends Node3D
## Ground and obstacles of a match, drawn like a floor plan: thin walls, door leaves that turn, window glass and
## pixel art for each piece of furniture.

## Look of a box in `shaders/wall.gdshader`. The 6 kinds of buildings are in the order of WALL_COLORS.
enum Style { PLAIN, HOUSE, OFFICE, SHOP, WAREHOUSE, GARAGE, GREENHOUSE, HEDGE, GLASS }

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
	[Color("b0733c"), 1.15],
]
const WALL_COLORS := {
	&"house": Color("e9dcc0"),
	&"office": Color("c3ccd6"),
	&"shop": Color("e3b877"),
	&"warehouse": Color("b5745f"),
	&"garage": Color("c2b8ae"),
	&"greenhouse": Color("d6e6d0"),
}
## Door leaf of each kind of building, in a colour that its wall does not have.
const DOOR_COLORS := {
	&"house": Color("c8643c"),
	&"office": Color("5a8fc0"),
	&"shop": Color("4fa070"),
	&"warehouse": Color("a9bcc6"),
	&"garage": Color("d9a441"),
	&"greenhouse": Color("c8843c"),
}
## Wall thickness in metres per linear material. The other materials draw as boxes.
const THICK := {Defs.Mat.WALL: 0.22, Defs.Mat.WAREHOUSE: 0.4, Defs.Mat.HEDGE: 0.55}
const FLOORS: Array[int] = [TerrainMap.Tile.CONCRETE, TerrainMap.Tile.WOOD_FLOOR, TerrainMap.Tile.TILE_FLOOR]
const BOOKS: Array[Color] = [Color("c9584a"), Color("e0b64f"), Color("4f8a6a"), Color("5873b8")]
## Length, height and thickness in metres of a door leaf. The ink outline takes 1 pixel of each side, so a thinner
## leaf is all ink from above.
const DOOR_SIZE := Vector3(0.94, 1.15, 0.24)
## Radians that a door leaf turns in each second.
const DOOR_TURN := 16.0
## Height in metres of the wall under a window.
const SILL := 0.5
const GLASS := Color("bfe8ff")
## Top in metres and thickness in metres of the glass of a window.
const PANE := Vector2(1.2, 0.2)

static var _warp: FastNoiseLite

var grid: ObstacleGrid
var map: TerrainMap
var _boxes := MultiMesh.new()
var _revision := -1
var _built := false
## Cell index -> kind of the building that owns the cell.
var _walls := {}
## Cell index -> {pivot, closed, turn}: the leaf of each door that stands, its angle when closed and the angle
## that it turns to, in radians.
var _doors := {}
## Cell index -> index of the box of its window glass.
var _panes := {}
var _boxes_material := ShaderMaterial.new()
## For each box, the cell that it stands on, or -1 for a box that stays.
var _owners := PackedInt32Array()
## Cell index -> the pixel art of the prop, rock or loot box that stands on it.
var _sprites := {}
var _sprite_material := ShaderMaterial.new()
## For flat props: before the shapes on the ground, so the ring of an item shows on a rug.
var _flat_material := ShaderMaterial.new()


func setup(world: SimWorld) -> void:
	grid = world.grid
	map = world.map
	_boxes_material.shader = preload("res://shaders/wall.gdshader")
	_sprite_material.shader = preload("res://shaders/prop.gdshader")
	_sprite_material.set_shader_parameter(&"atlas", PropArt.atlas())
	# After the ink outline pass, as the units: the art has its own outline.
	_sprite_material.render_priority = 1
	_flat_material.shader = _sprite_material.shader
	_flat_material.set_shader_parameter(&"atlas", PropArt.atlas())
	_flat_material.render_priority = -1
	add_child(_ground())
	for building in map.buildings:
		var rect: Rect2i = building.rect
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				_walls[y * grid.size + x] = building.kind
	_add_doors()
	_boxes.transform_format = MultiMesh.TRANSFORM_3D
	_boxes.use_colors = true
	_boxes.use_custom_data = true
	_boxes.mesh = BoxMesh.new()
	var node := MultiMeshInstance3D.new()
	node.multimesh = _boxes
	node.material_override = _boxes_material
	add_child(node)


func _process(delta: float) -> void:
	for entry: Dictionary in _doors.values():
		entry.pivot.rotation.y = move_toward(entry.pivot.rotation.y, entry.turn, DOOR_TURN * delta)
	if grid == null or grid.revision == _revision:
		return
	_revision = grid.revision
	if _built:
		# A full rebuild takes more than 10 ms. Hide only the boxes of broken cells.
		for n in _owners.size():
			if _owners[n] >= 0 and grid.hp[_owners[n]] <= 0.0:
				_owners[n] = -1
				_hide(n)
		for cell: int in _doors.keys():
			if grid.hp[cell] <= 0.0:
				_doors[cell].pivot.queue_free()
				_doors.erase(cell)
		for cell: int in _sprites.keys():
			if grid.hp[cell] <= 0.0:
				_sprites[cell].queue_free()
				_sprites.erase(cell)
		return
	_built = true
	var out := []
	for i in grid.material.size():
		_claim(out, i - 1)
		var mat := grid.material[i]
		if grid.hp[i] <= 0.0 or mat in [Defs.Mat.PROP, Defs.Mat.NONE, Defs.Mat.DOOR]:
			continue
		var cell := Vector2i(i % grid.size, i / grid.size)
		var centre := Vector2(cell) + Vector2(0.5 - grid.half, 0.5 - grid.half)
		var look: Array = CELL_LOOK[mat]
		if not THICK.has(mat):
			var box: StringName = &"box_high" if grid.high_tier[i] else &"box"
			_sprite(i, box if mat == Defs.Mat.BOX else &"rocks", centre, Vector2i.ONE)
			continue
		var kind: StringName = _walls.get(i, &"warehouse")
		var color: Color = WALL_COLORS[kind] if mat == Defs.Mat.WAREHOUSE else look[0]
		var style := Style.HEDGE if mat == Defs.Mat.HEDGE else Style.PLAIN
		if mat == Defs.Mat.WAREHOUSE:
			style = WALL_COLORS.keys().find(kind) + 1 as Style
		var thick: float = THICK[mat]
		var height: float = SILL if grid.solid[i] == ObstacleGrid.LOW else look[1]
		_box(out, centre, Vector2(thick, thick), height, color, style)
		for side: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			if _lined(cell + side):
				var arm := Vector2(side) * (0.25 + thick * 0.25)
				var size := Vector2(side).abs() * (0.5 - thick * 0.5) + Vector2(side.y, side.x).abs() * thick
				_box(out, centre + arm, size, height, color, style)
		if grid.glass.has(i):
			_panes[i] = out.size()
			var along := Vector2(_axis(cell))
			_box(out, centre, along + Vector2(along.y, along.x) * PANE.y, PANE.x, GLASS, Style.GLASS, SILL)
	_claim(out, grid.material.size() - 1)
	for prop in map.props:
		var i := grid.size * floori(prop.y + grid.half) + floori(prop.x + grid.half)
		if grid.hp[i] > 0.0:
			_sprite(i, prop.kind, Vector2(prop.x, prop.y), Vector2i(prop.width, prop.height))
	_boxes.instance_count = out.size()
	for n in out.size():
		_boxes.set_instance_transform(n, out[n][0])
		_boxes.set_instance_color(n, out[n][1])
		_boxes.set_instance_custom_data(n, Color(out[n][2], 0.0, 0.0))


## Draws a loot box that the match put on a free cell.
func add_box(cell: Vector2i) -> void:
	var i := cell.y * grid.size + cell.x
	_sprite(i, &"box_high" if grid.high_tier[i] else &"box", grid.center_of(cell), Vector2i.ONE)


## Turns the leaf of a door for a `door` event. An open leaf stands square to its wall, on the far side from the
## unit that opened it.
func door(e: Dictionary) -> void:
	var entry: Dictionary = _doors.get(e.cell.y * grid.size + e.cell.x, {})
	if entry.is_empty():
		return
	var hinge := Vector2(entry.pivot.position.x, entry.pivot.position.z)
	var away := [0.5, -0.5].filter(
		func(side: float) -> bool:
			var angle: float = entry.closed + PI * side
			return Vector2(cos(angle), -sin(angle)).dot(e.from - hinge) < 0.0
	)
	entry.turn = entry.closed + (PI * (away[0] if away else 0.5) if e.open else 0.0)


## Takes the glass of a window away.
func break_glass(cell: Vector2i) -> void:
	var i := cell.y * grid.size + cell.x
	if _panes.has(i):
		_hide(_panes[i])
		_panes.erase(i)


func _hide(box: int) -> void:
	_boxes.set_instance_transform(box, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))


## One leaf for each door. The hinge is at the west or the north end of the cell. The second leaf of a wide door
## has it at the other end.
func _add_doors() -> void:
	var mesh := BoxMesh.new()
	for building in map.buildings:
		var material := ShaderMaterial.new()
		material.shader = preload("res://shaders/door.gdshader")
		var wood: Color = DOOR_COLORS[building.kind]
		material.set_shader_parameter(&"wood", Vector3(wood.r, wood.g, wood.b))
		for cell: Vector2i in building.doors:
			var axis := _axis(cell)
			var far := _door(cell - axis)
			var hinge := grid.center_of(cell) + Vector2(axis) * (0.5 if far else -0.5)
			var pivot := Node3D.new()
			pivot.position = Vector3(hinge.x, 0.0, hinge.y)
			pivot.rotation.y = (PI if far else 0.0) + (0.0 if axis == Vector2i.RIGHT else -PI / 2.0)
			var leaf := MeshInstance3D.new()
			leaf.mesh = mesh
			leaf.material_override = material
			leaf.scale = DOOR_SIZE
			leaf.position = Vector3(0.5, DOOR_SIZE.y * 0.5, 0.0)
			pivot.add_child(leaf)
			add_child(pivot)
			_doors[cell.y * grid.size + cell.x] = {pivot = pivot, closed = pivot.rotation.y, turn = pivot.rotation.y}


## Records `cell` as the owner of the boxes added since the last call.
func _claim(out: Array, cell: int) -> void:
	while _owners.size() < out.size():
		_owners.append(cell)


## Adds the pixel art of a prop, a rock or a loot box on `cell`. `at` is the middle of its footprint of `cells`.
func _sprite(cell: int, kind: StringName, at: Vector2, cells: Vector2i) -> void:
	var node := MeshInstance3D.new()
	# 2 looks for rocks.
	node.mesh = PropArt.mesh(&"rocks2" if kind == &"rocks" and cell % 2 == 1 else kind, cells)
	node.material_override = _flat_material if kind in PropArt.FLAT else _sprite_material
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


func _door(cell: Vector2i) -> bool:
	return grid.in_bounds(cell) and grid.material[cell.y * grid.size + cell.x] == Defs.Mat.DOOR


## True when `cell` continues the line of a wall: a wall, a window, a fence, a hedge or a door.
func _lined(cell: Vector2i) -> bool:
	return _joins(cell) or _door(cell)


## Direction of the wall that a door or a window is in: south when more of its 2 neighbours to the north and south
## continue the line than of its 2 neighbours to the west and east, else east.
func _axis(cell: Vector2i) -> Vector2i:
	var across := int(_lined(cell + Vector2i.LEFT)) + int(_lined(cell + Vector2i.RIGHT))
	var along := int(_lined(cell + Vector2i.UP)) + int(_lined(cell + Vector2i.DOWN))
	return Vector2i.RIGHT if across >= along else Vector2i.DOWN


## Adds a box of `size` metres on the ground plane, from `bottom` to `top` metres.
func _box(
	out: Array, centre: Vector2, size: Vector2, top: float, color: Color, style := Style.PLAIN, bottom := 0.0
) -> void:
	var basis := Basis.from_scale(Vector3(size.x, top - bottom, size.y))
	out.append([Transform3D(basis, Vector3(centre.x, (top + bottom) * 0.5, centre.y)), color, style])


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
