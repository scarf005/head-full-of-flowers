class_name GrassView
extends MultiMeshInstance3D
## A field of grass tufts on the grass tiles and reeds on the marsh tiles inside the arena. The shader bends them in
## the wind and under units.

## Height in metres at which flowers lie, level with the bent grass tips.
const TOP := 0.5
const TALL := {TerrainMap.Tile.GRASS: 0.6, TerrainMap.Tile.CLOVER: 0.5, TerrainMap.Tile.WILD_GRASS: 0.7}
## Height in metres of a reed on a marsh. Flowers lie under the reeds.
const REED := 0.9
## Share of the tufts of a grass tile that a marsh tile has as reeds.
const REEDS := 0.3
## Colour of a reed. Alpha below 1 marks a reed for the shader.
const REED_COLOR := Color(1.0, 0.85, 0.5, 0.0)

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
	# Squares of half a metre on and around each prop that lies on the ground. A tuft beside such a prop leans over
	# it and hides it, so these squares get no tufts.
	var bare := {}
	for prop: Dictionary in map.props:
		if prop.kind not in PropArt.FLAT:
			continue
		var first := Vector2i(Vector2(prop.x * 2 - prop.width, prop.y * 2 - prop.height).round()) - Vector2i.ONE
		for dy in prop.height * 2 + 2:
			for dx in prop.width * 2 + 2:
				bare[first + Vector2i(dx, dy)] = true
	for y in map.size:
		for x in map.size:
			var corner := Vector2(x - map.size / 2.0, y - map.size / 2.0)
			if corner.length() > reach or world.grid.hp[y * map.size + x] > 0.0:
				continue
			for n in per_tile:
				var at := corner + Vector2(rng.randf(), rng.randf())
				var tile := TerrainView.tile(map, at)
				var reed := tile == TerrainMap.Tile.MARSH and rng.randf() < REEDS
				if not (TALL.has(tile) or reed) or bare.has(Vector2i((at * 2.0).floor())):
					continue
				var wide := 0.8 if reed else 1.6
				var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(
					Vector3(wide, TALL.get(tile, REED) * rng.randf_range(0.85, 1.15), wide)
				)
				var color := REED_COLOR if reed else Color.from_hsv(0.0, 0.0, rng.randf_range(0.96, 1.04))
				for row in 3:
					buffer.append_array([basis.x[row], basis.y[row], basis.z[row], [at.x, 0.0, at.y][row]])
				buffer.append_array([color.r, color.g, color.b, color.a])
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
	material.set_shader_parameter("pushers", pushers(world.units))


## Places of the units for the shaders of the grass and the flowers: 12 places, with a far place for each one that
## no unit has.
static func pushers(units: Array[SimUnit]) -> PackedVector3Array:
	var places := PackedVector3Array()
	for n in 12:
		places.append(Vector3(units[n].pos.x, 0.0, units[n].pos.y) if n < units.size() else Vector3.ONE * 1e6)
	return places


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
