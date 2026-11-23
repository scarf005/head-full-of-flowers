class_name UnitView
extends Node3D
## Low-poly figure of one unit: body, head, gun and a health bar.

var unit: SimUnit
var body: MeshInstance3D
var gun: MeshInstance3D
var bar: MeshInstance3D
var material := StandardMaterial3D.new()
var color: Color
var _stride := 0.0


func setup(sim_unit: SimUnit, team_color: Color) -> void:
	unit = sim_unit
	color = team_color
	material.roughness = 0.9
	body = _part(_cylinder(0.3, 0.2, 0.8), Vector3(0, 0.5, 0), material)
	_part(_cylinder(0.2, 0.2, 0.3), Vector3(0, 0.6, 0), material, body)
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.12, 0.12, 0.15)
	gun = _part(BoxMesh.new(), Vector3(0.22, 0.2, -0.35), dark, body)
	gun.scale = Vector3(0.09, 0.09, 0.6)
	var bar_material := StandardMaterial3D.new()
	bar_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bar_material.albedo_color = color
	bar = _part(BoxMesh.new(), Vector3(0, 1.75, 0), bar_material)
	bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _process(delta: float) -> void:
	position = Vector3(unit.pos.x, 0.0, unit.pos.y)
	_stride += unit.vel.length() * delta * 1.6
	body.position.y = 0.5 + absf(sin(_stride)) * 0.08
	body.rotation.y = atan2(-unit.aim.x, -unit.aim.y)
	body.rotation.x = -unit.recoil * 0.25
	gun.position.z = -0.35 + unit.recoil * 0.15
	material.albedo_color = color.lerp(Color.WHITE, unit.hit_flash)
	material.emission_enabled = unit.hit_flash > 0.0
	material.emission = Color.WHITE * unit.hit_flash
	bar.scale = Vector3(maxf(0.02, unit.hp / unit.max_hp) * 0.9, 0.07, 0.07)


func _cylinder(bottom: float, top: float, height: float) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.bottom_radius = bottom
	mesh.top_radius = top
	mesh.height = height
	mesh.radial_segments = 6
	mesh.rings = 1
	return mesh


func _part(mesh: Mesh, at: Vector3, mat: Material, parent: Node3D = self) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.position = at
	node.material_override = mat
	parent.add_child(node)
	return node
