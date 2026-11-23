class_name GrassView
extends MultiMeshInstance3D
## A field of grass tufts on the grass tiles inside the arena. The shader bends them in the wind and under units.

const TALL := {TerrainMap.Tile.GRASS: 0.85, TerrainMap.Tile.CLOVER: 0.6, TerrainMap.Tile.WILD_GRASS: 1.1}

var world: SimWorld
var material := ShaderMaterial.new()


func setup(sim: SimWorld) -> void:
	world = sim
	var map := world.map
	var per_tile := 14 if Quality.high() else 5
	var reach := world.arena_start + 3.0
	var buffer := PackedFloat32Array()
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for y in map.size:
		for x in map.size:
			var tile := map.tiles[y * map.size + x]
			var corner := Vector2(x - map.size / 2.0, y - map.size / 2.0)
			if not TALL.has(tile) or corner.length() > reach or world.grid.hp[y * map.size + x] > 0.0:
				continue
			for n in per_tile:
				var at := corner + Vector2(rng.randf(), rng.randf())
				var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(
					Vector3(1.2, TALL[tile] * rng.randf_range(0.7, 1.3), 1.2)
				)
				var color := Color.from_hsv(0.0, 0.0, rng.randf_range(0.9, 1.1))
				for row in 3:
					buffer.append_array([basis.x[row], basis.y[row], basis.z[row], [at.x, 0.0, at.y][row]])
				buffer.append_array([color.r, color.g, color.b, 1.0])
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = _tuft()
	multimesh.instance_count = buffer.size() / 16
	multimesh.buffer = buffer
	custom_aabb = AABB(Vector3(-60, 0, -60), Vector3(120, 2, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	material.shader = preload("res://shaders/grass.gdshader")
	material_override = material


func _process(_delta: float) -> void:
	var pushers := PackedVector3Array()
	for u in world.units:
		pushers.append(Vector3(u.pos.x, 0.0, u.pos.y))
	pushers.resize(12)
	material.set_shader_parameter("pushers", pushers)


## Three tapered blades that lean outward.
func _tuft() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for blade in 3:
		var out := Vector3(cos(blade * 2.1), 0.0, sin(blade * 2.1))
		var side := Vector3(-out.z, 0.0, out.x) * 0.07
		var root := out * 0.08
		var mid := out * 0.16 + Vector3.UP * 0.55
		var tip := out * 0.3 + Vector3.UP
		var points := [root - side, root + side, mid + side * 0.6, root - side, mid + side * 0.6, mid - side * 0.6]
		points.append_array([mid - side * 0.6, mid + side * 0.6, tip])
		for point: Vector3 in points:
			st.set_uv(Vector2(0.0, point.y))
			st.set_color(Color.WHITE)
			st.add_vertex(point)
	return st.commit()
