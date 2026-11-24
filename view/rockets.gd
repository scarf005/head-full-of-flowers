class_name Rockets
extends MultiMeshInstance3D
## Rockets in flight as small 3D models of the 83 mm SMAW rocket: a probe on a cone nose, a round body with a yellow
## band, a thin tail with 4 fins and an exhaust flame. Each frame: add() each rocket, then end_frame().

const CAPACITY := 64
const SIDES := 8
## Metres from the middle of a rocket back to its tail, where the flame starts. The shader has the same number.
const TAIL := -1.25
const FLAME := Color("ffd04a", 0.0)
## Outline of the model from the nose back: [metres forward, radius, colour of the part that ends here]. Colour alpha
## 0 marks the flame.
const PROFILE := [
	[0.35, 0.0, Color.BLACK],
	[0.31, 0.035, Color("b4b8b0")],
	[0.12, 0.035, Color("b4b8b0")],
	[0.12, 0.07, Color("5f6b3a")],
	[-0.15, 0.17, Color("5f6b3a")],
	[-0.3, 0.17, Color("7a8a4a")],
	[-0.38, 0.17, Color("e8c547")],
	[-0.75, 0.17, Color("7a8a4a")],
	[-0.85, 0.09, Color("50564a")],
	[TAIL, 0.09, Color("50564a")],
	[TAIL, 0.0, Color("50564a")],
	[TAIL, 0.13, FLAME],
	[-1.85, 0.0, FLAME],
]

static var _model: ArrayMesh

var _count := 0


func _init() -> void:
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = model()
	multimesh.instance_count = CAPACITY
	multimesh.visible_instance_count = 0
	custom_aabb = AABB(Vector3(-60, -2, -60), Vector3(120, 10, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/rocket.gdshader")
	material_override = material


## Adds one rocket for this frame at `at`. It points along `vel` and turns `roll` radians around its length.
func add(at: Vector3, vel: Vector2, roll: float) -> void:
	if _count >= CAPACITY:
		return
	multimesh.set_instance_transform(_count, place(at, vel, roll))
	_count += 1


## Place, turn and size of a model at `at` that points along `vel` and turns `roll` radians around its length.
static func place(at: Vector3, vel: Vector2, roll: float) -> Transform3D:
	var ahead := Vector3(vel.x, 0.0, vel.y).normalized()
	var basis := Basis(ahead, roll) * Basis(ahead, Vector3.UP, ahead.cross(Vector3.UP))
	return Transform3D(basis * Tune.rocket_size, at)


## Shows the rockets of this frame.
func end_frame() -> void:
	multimesh.visible_instance_count = _count
	_count = 0


## The model along +x with the nose forward, built one time. Each part of PROFILE turns around the length.
static func model() -> ArrayMesh:
	if _model != null:
		return _model
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for n in range(1, PROFILE.size()):
		var a: Array = PROFILE[n - 1]
		var b: Array = PROFILE[n]
		# Outward normal of the part in the plane of its length and its radius.
		var slope := Vector2(b[1] - a[1], a[0] - b[0]).normalized()
		tool.set_color(b[2])
		for side in SIDES:
			var turns := [TAU * side / SIDES, TAU * (side + 1) / SIDES]
			var mid := TAU * (side + 0.5) / SIDES
			tool.set_normal(Vector3(slope.x, slope.y * cos(mid), slope.y * sin(mid)))
			var ring := func(p: Array, turn: float) -> Vector3: return Vector3(p[0], p[1] * cos(turn), p[1] * sin(turn))
			for corner: Array in [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]]:
				tool.add_vertex(ring.call(corner[0], turns[corner[1]]))
	# 4 fins in an X at the tail, each swept back.
	tool.set_color(PROFILE[-3][2])
	for fin in 4:
		var out := Vector3(0.0, cos(PI / 4.0 + fin * PI / 2.0), sin(PI / 4.0 + fin * PI / 2.0))
		tool.set_normal(Vector3.RIGHT.cross(out))
		for corner: Vector2 in [Vector2(-1.0, 0.09), Vector2(TAIL, 0.09), Vector2(TAIL, 0.25), Vector2(-1.0, 0.09)]:
			tool.add_vertex(Vector3(corner.x, 0.0, 0.0) + out * corner.y)
		for corner: Vector2 in [Vector2(TAIL, 0.25), Vector2(-1.12, 0.25)]:
			tool.add_vertex(Vector3(corner.x, 0.0, 0.0) + out * corner.y)
	_model = tool.commit()
	return _model
