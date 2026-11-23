class_name UnitView
extends Node3D
## Low-poly figure of one unit: feet, body, head with a blossom, gun and a health bar.

## Gun box size in metres (width, height, length) per weapon. Other weapons use RIFLE.
const GUNS := {
	&"pistol": Vector3(0.13, 0.14, 0.34),
	&"shotgun": Vector3(0.18, 0.14, 0.65),
	&"auto-shotgun": Vector3(0.2, 0.16, 0.65),
	&"flamethrower": Vector3(0.24, 0.22, 0.6),
	&"grenade-launcher": Vector3(0.26, 0.24, 0.55),
	&"rocket-launcher": Vector3(0.3, 0.28, 1.0),
	&"battle-rifle": Vector3(0.14, 0.14, 0.9),
}
const RIFLE := Vector3(0.14, 0.13, 0.7)
const SCALE := 1.45

var unit: SimUnit
var color: Color
## Scale of the figure. Set below 1 to make it pop up, for example at a respawn.
var grow := 1.0
var material := StandardMaterial3D.new()
## Ground of the match, to find water under the unit.
var map: TerrainMap
var _body := Node3D.new()
var _legs := Node3D.new()
var _feet: Array[MeshInstance3D] = []
var _gun: MeshInstance3D
var _bar: MeshInstance3D
var _stride := 0.0
## Materials of the figure that go white at a hit.
var _lit: Array[StandardMaterial3D] = []


func setup(sim_unit: SimUnit, team_color: Color) -> void:
	unit = sim_unit
	color = team_color
	material.roughness = 0.9
	material.albedo_color = color
	_lit.append(material)
	var dark := _lit_material(Color(0.13, 0.13, 0.17))
	var skin := _lit_material(color.lerp(Color(1.0, 0.9, 0.8), 0.6))
	var plain := StandardMaterial3D.new()
	plain.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	plain.albedo_color = color
	scale = Vector3.ONE * SCALE
	add_child(_legs)
	add_child(_body)
	for side: float in [-0.13, 0.13]:
		_feet.append(_part(BoxMesh.new(), Vector3(side, 0.06, 0), Vector3(0.14, 0.12, 0.24), dark, _legs))
	var torso := CylinderMesh.new()
	torso.bottom_radius = 0.27
	torso.top_radius = 0.2
	torso.height = 0.5
	torso.radial_segments = 6
	torso.rings = 1
	# The body is darker than the flowers of its team, so it shows on its own flower field.
	_part(torso, Vector3(0, 0.45, 0), Vector3.ONE, _lit_material(color.darkened(0.4)), _body)
	_part(BoxMesh.new(), Vector3(0, 0.5, 0.25), Vector3(0.32, 0.3, 0.14), dark, _body)
	var ball := SphereMesh.new()
	ball.radius = 0.5
	ball.height = 1.0
	ball.radial_segments = 6
	ball.rings = 3
	_part(ball, Vector3(0, 0.88, 0), Vector3.ONE * 0.42, skin, _body)
	for n in 5:
		var out := Vector3(cos(n * TAU / 5.0), 0.0, sin(n * TAU / 5.0)) * 0.22
		_part(ball, out + Vector3(0, 1.1, 0), Vector3(0.34, 0.12, 0.34), material, _body)
	var heart := _lit_material(Color(1.0, 0.82, 0.2))
	_part(ball, Vector3(0, 1.14, 0), Vector3(0.22, 0.14, 0.22), heart, _body)
	var steel := _lit_material(Color(0.36, 0.38, 0.46))
	_gun = _part(BoxMesh.new(), Vector3.ZERO, Vector3.ONE, steel, _body)
	var wood := _lit_material(Color(0.62, 0.42, 0.26))
	# Stock: the rear third of the gun, a little wider, in wood.
	_part(BoxMesh.new(), Vector3(0, -0.15, 0.36), Vector3(1.5, 1.3, 0.3), wood, _gun)
	_bar = _part(BoxMesh.new(), Vector3(0, 1.85, 0), Vector3.ONE, plain)
	_bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if unit.is_player:
		var ring := TorusMesh.new()
		ring.inner_radius = 0.42
		ring.outer_radius = 0.5
		ring.ring_segments = 3
		_part(ring, Vector3(0, 0.04, 0), Vector3(1, 0.2, 1), plain).cast_shadow = _bar.cast_shadow


func _ready() -> void:
	for lit in _lit:
		# On from the start: a later switch compiles a new shader in the middle of a fight.
		lit.emission_enabled = true
		lit.emission = Color.BLACK
		lit.emission_energy_multiplier = 3.0


func _process(delta: float) -> void:
	var at := unit.pos - unit.vel * GameView.lag
	# A unit in water stands knee-deep.
	var floor_y := -0.3 if map and map.tile_at(at) == TerrainMap.Tile.WATER else 0.0
	position = Vector3(at.x, lerpf(position.y, floor_y, clampf(delta * 10.0, 0.0, 1.0)), at.y)
	var speed := unit.vel.length()
	_stride += speed * delta * 1.5
	if speed > 0.5:
		_legs.rotation.y = atan2(-unit.vel.x, -unit.vel.y)
	for n in 2:
		var swing := _stride + n * PI
		_feet[n].position.z = sin(swing) * 0.18 * minf(1.0, speed / 4.0)
		_feet[n].position.y = 0.06 + maxf(0.0, cos(swing)) * 0.1 * minf(1.0, speed / 4.0)
	grow = move_toward(grow, 1.0, delta * 5.0)
	var squash := unit.hit_flash * 0.25
	_body.scale = Vector3(1.0 + squash, 1.0 - squash, 1.0 + squash) * grow
	_body.position.y = absf(sin(_stride)) * 0.05
	_body.rotation.y = atan2(-unit.aim.x, -unit.aim.y)
	_body.rotation.x = unit.recoil * 0.2
	var size: Vector3 = GUNS.get(unit.weapon_id(), RIFLE)
	_gun.scale = size
	# In front of the blossom, so the camera above sees where the unit aims.
	_gun.position = Vector3(0.2, 0.55, -0.3 - size.z * 0.5 + unit.recoil * 0.18)
	# The whole figure goes white at a hit.
	for lit in _lit:
		lit.emission = Color.WHITE * unit.hit_flash
	_bar.scale = Vector3(maxf(0.02, unit.hp / unit.max_hp) * 0.9, 0.07, 0.07)


func _lit_material(albedo: Color) -> StandardMaterial3D:
	var lit := StandardMaterial3D.new()
	lit.albedo_color = albedo
	_lit.append(lit)
	return lit


func _part(mesh: Mesh, at: Vector3, size: Vector3, mat: Material, parent: Node3D = self) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.position = at
	node.scale = size
	node.material_override = mat
	parent.add_child(node)
	return node
