class_name Fx
extends MultiMeshInstance3D
## Batch of flat pixel shapes that face the camera: shots, discs, rings, sparks and item art.
## Each frame: add() the shapes of things that the match holds, then step(). spawn() adds a shape that lives for
## a set time.

enum Shape { SHOT, DISC, SPARK, ART }

const CAPACITY := 2048
## Size of one atlas cell in pixels, as in the shader.
const CELL := Vector2i(36, 24)
const SECONDARY_ART: Array[StringName] = [&"grenade", &"molotov", &"fire"]

static var _atlas: ImageTexture
static var _cells: Array[StringName] = []

var _count := 0
## Each: {at, vel, age, life, shape, from, to, colors, turn, hole, dots}.
var _parts: Array[Dictionary] = []


## `priority` 0 draws under the units and props, 2 over them.
func _init(priority: int) -> void:
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.use_custom_data = true
	multimesh.mesh = QuadMesh.new()
	multimesh.instance_count = CAPACITY
	multimesh.visible_instance_count = 0
	custom_aabb = AABB(Vector3(-60, -2, -60), Vector3(120, 10, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/fx.gdshader")
	material.render_priority = priority
	material.set_shader_parameter(&"atlas", atlas())
	material.set_shader_parameter(&"cells", float(_cells.size()))
	# A ground shape lies on the ground. An air shape stands and leans only below its middle.
	var slope := 1.0 / tan(CameraRig.PITCH)
	material.set_shader_parameter(&"lie", Vector2(slope if priority == 0 else 0.0, slope))
	material_override = material


## Height in metres at which the middle of a shape shows `px` view pixels above its ground point.
static func up(px: float) -> float:
	return px / UnitView.PX_PER_M / cos(CameraRig.PITCH)


## Turn in radians of a shape that points along the sim direction `dir`.
static func turn_of(dir: Vector2) -> float:
	return UnitView.view_dir(dir).angle()


## Cell of the atlas with the art of a weapon, a secondary or a perk.
static func cell(id: StringName) -> float:
	atlas()
	return _cells.find(id)


## One row of cells with the art of each weapon, secondary and perk, built one time.
static func atlas() -> ImageTexture:
	if _atlas == null:
		_cells.assign(Defs.WEAPON_IDS)
		_cells.append_array(SECONDARY_ART)
		_cells.append_array(Defs.PERKS.keys())
		var image := Image.create_empty(CELL.x * _cells.size(), CELL.y, false, Image.FORMAT_RGBA8)
		for n in _cells.size():
			var art: Image = (load("res://assets/sprites/%s.png" % _cells[n]) as Texture2D).get_image()
			art.convert(Image.FORMAT_RGBA8)
			var at := Vector2i(n * CELL.x, 0) + (CELL - art.get_size()) / 2
			image.blit_rect(art, Rect2i(Vector2i.ZERO, art.get_size()), at)
		_atlas = ImageTexture.create_from_image(image)
	return _atlas


## Adds one shape for this frame. `size` is in view pixels. `z` and `w` are the shape values of the shader.
func add(at: Vector3, size: Vector2, shape: Shape, color: Color, turn := 0.0, z := 0.0, w := 0.0) -> void:
	if _count >= CAPACITY:
		return
	# Whole pixel pairs, so the middle of the shape is on a pixel border.
	var scale := Vector3(roundf(size.x * 0.5) * 2.0, roundf(size.y * 0.5) * 2.0, 1.0) / UnitView.PX_PER_M
	multimesh.set_instance_transform(_count, Transform3D(Basis.from_scale(scale.max(Vector3.ONE * 0.001)), at))
	multimesh.set_instance_color(_count, color)
	multimesh.set_instance_custom_data(_count, Color(shape, turn, z, w))
	_count += 1


## Adds a shape that lives for `life` seconds. It goes from the size `from` to the size `to`, fast at first, and shows
## `colors` one after the other. `more` can hold: vel (Vector3), turn, hole (Vector2: hole at the start and at the
## end, for a ring), dots (share of the life from which only every second pixel shows).
func spawn(
	at: Vector3, life: float, shape: Shape, from: Vector2, to: Vector2, colors: Array[Color], more := {}
) -> void:
	var part := {at = at, life = life, shape = shape, from = from, to = to, colors = colors, age = 0.0}
	part.merge({vel = Vector3.ZERO, turn = 0.0, hole = Vector2.ZERO, dots = 2.0})
	part.merge(more, true)
	_parts.append(part)


## Moves the timed shapes on by `delta` seconds, adds them and shows all shapes of this frame.
func step(delta: float) -> void:
	for i in range(_parts.size() - 1, -1, -1):
		var part := _parts[i]
		part.age += delta
		if part.age >= part.life:
			_parts.remove_at(i)
	for part in _parts:
		var t: float = part.age / part.life
		part.at += part.vel * delta
		var size: Vector2 = part.from.lerp(part.to, 1.0 - (1.0 - t) * (1.0 - t))
		var color: Color = part.colors[mini(int(t * part.colors.size()), part.colors.size() - 1)]
		var hole: Vector2 = part.hole
		add(part.at, size, part.shape, color, part.turn, lerpf(hole.x, hole.y, t), float(t >= part.dots))
	multimesh.visible_instance_count = _count
	_count = 0
