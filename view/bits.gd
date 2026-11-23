class_name Bits
extends MultiMeshInstance3D
## Pool of small cubes that fly, fall and bounce: shell casings, petals and splinters.

const COUNT := 512

var _pos := PackedVector3Array()
var _vel := PackedVector3Array()
var _life := PackedFloat32Array()
var _size := PackedFloat32Array()
var _next := 0


func _init() -> void:
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = BoxMesh.new()
	multimesh.instance_count = COUNT
	for list: Variant in [_pos, _vel, _life, _size]:
		list.resize(COUNT)
	for i in COUNT:
		multimesh.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))
	custom_aabb = AABB(Vector3(-60, 0, -60), Vector3(120, 6, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material_override = material


func add(at: Vector3, vel: Vector3, color: Color, size: float, life: float) -> void:
	_pos[_next] = at
	_vel[_next] = vel
	_size[_next] = size
	_life[_next] = life
	multimesh.set_instance_color(_next, color)
	_next = (_next + 1) % COUNT


func _process(delta: float) -> void:
	for i in COUNT:
		if _life[i] <= 0.0:
			continue
		_life[i] -= delta
		var v := _vel[i] + Vector3.DOWN * 20.0 * delta
		var p := _pos[i] + v * delta
		var rest := _size[i] * 0.5
		if p.y < rest and v.y < 0.0:
			p.y = rest
			v = Vector3(v.x * 0.5, -v.y * 0.35, v.z * 0.5)
		_pos[i] = p
		_vel[i] = v
		var scale := _size[i] * clampf(_life[i] * 5.0, 0.0, 1.0)
		var spin := Basis(Vector3(0.6, 0.5, 0.6).normalized(), (p.x + p.z) * 4.0)
		multimesh.set_instance_transform(i, Transform3D(spin.scaled(Vector3.ONE * scale), p))
