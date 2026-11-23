class_name FlowerView
extends MultiMeshInstance3D
## Draws every flower of the match in one multimesh.

var field: FlowerField
var map: TerrainMap
var colors := {}
var _used := 0


func setup(world: SimWorld) -> void:
	field = world.flowers
	map = world.map
	for team in range(-1, world.team_count):
		colors[team] = world.team_color(team)
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.use_custom_data = true
	var quad := PlaneMesh.new()
	quad.size = Vector2.ONE
	multimesh.mesh = quad
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
		var basis := Basis(Vector3.UP, seed * TAU).scaled(Vector3.ONE * maxf(0.12, field.size[i] * 1.8))
		var lift := GrassView.TOP if GrassView.TALL.has(TerrainView.tile(map, field.pos[i])) else 0.03
		var at := Vector3(field.pos[i].x, lift + seed * 0.08, field.pos[i].y)
		multimesh.set_instance_transform(i, Transform3D(basis, at))
		var color: Color = colors[field.owner[i]]
		multimesh.set_instance_color(i, color.lerp(Color.from_hsv(seed, 0.5, 1.0), 0.12) * (0.85 + 0.3 * seed))
		multimesh.set_instance_custom_data(i, Color(field.bloom_at[i], seed, 0.0, 0.0))
		_used = maxi(_used, i + 1)
	field.dirty.clear()
	multimesh.visible_instance_count = _used
