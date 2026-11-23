class_name FlowerView
extends MultiMeshInstance3D
## Draws every flower of the match in one multimesh.

var field: FlowerField
var colors := {}
var _used := 0


func setup(world: SimWorld) -> void:
	field = world.flowers
	for team in range(-1, world.team_count):
		colors[team] = world.team_color(team)
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.use_custom_data = true
	multimesh.mesh = _flower_mesh()
	multimesh.instance_count = field.capacity
	multimesh.visible_instance_count = 0
	custom_aabb = AABB(Vector3(-60, 0, -60), Vector3(120, 2, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/flower.gdshader")
	material_override = material


func _process(_delta: float) -> void:
	for i in field.dirty:
		var seed := fposmod(sin(i * 12.9898) * 43758.5453, 1.0)
		var basis := Basis(Vector3.UP, seed * TAU).scaled(Vector3.ONE * (0.45 + field.size[i] * 1.6))
		multimesh.set_instance_transform(i, Transform3D(basis, Vector3(field.pos[i].x, 0.0, field.pos[i].y)))
		var color: Color = colors[field.owner[i]]
		multimesh.set_instance_color(i, color.lerp(Color.from_hsv(seed, 0.5, 1.0), 0.12) * (0.85 + 0.3 * seed))
		multimesh.set_instance_custom_data(i, Color(field.bloom_at[i], seed, 0.0, 0.0))
		_used = maxi(_used, i + 1)
	field.dirty.clear()
	multimesh.visible_instance_count = _used


## A stem with five cupped petals round a yellow centre. UV.x marks the tinted parts, UV.y the brightness.
func _flower_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var top := Vector3(0, 0.75, 0)
	for point: Vector3 in [Vector3(-0.04, 0, 0), Vector3(0.04, 0, 0), top]:
		_vertex(st, point, Vector2(0.0, 0.0))
	for petal in 5:
		var a := TAU * petal / 5.0
		var points := [top, _rim(a - 0.42, 0.75), _rim(a, 1.0), _rim(a + 0.42, 0.75)]
		for index: int in [0, 1, 2, 0, 2, 3]:
			_vertex(st, points[index], Vector2(1.0, 0.5 if index == 0 else 1.0))
		var centre := [top + Vector3(0, 0.03, 0), _rim(a, 0.28), _rim(a + TAU / 5.0, 0.28)]
		for point: Vector3 in centre:
			_vertex(st, point + Vector3(0, 0.02, 0), Vector2(0.0, 1.0))
	return st.commit()


func _vertex(st: SurfaceTool, point: Vector3, uv: Vector2) -> void:
	st.set_uv(uv)
	st.set_color(Color.WHITE)
	st.add_vertex(point)


func _rim(angle: float, reach: float) -> Vector3:
	return Vector3(cos(angle) * reach * 0.5, 0.75 + reach * 0.12, sin(angle) * reach * 0.5)
