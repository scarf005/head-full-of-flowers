extends GutTest
## Data that the shaders of the ground, grass and flowers read. The west half of the map is a marsh.

var w: SimWorld


func before_each() -> void:
	var map := TerrainMap.new()
	for y in map.size:
		for x in map.size / 2:
			map.tiles[y * map.size + x] = TerrainMap.Tile.MARSH
	w = SimWorld.new({seed = 7, size = 2}, map)


func test_each_look_number_is_a_global_shader_parameter() -> void:
	var sources := ""
	for file in DirAccess.get_files_at("res://shaders"):
		if file.get_extension() in ["gdshader", "gdshaderinc"]:
			sources += FileAccess.get_file_as_string("res://shaders/" + file)
	for id: StringName in Tune.LOOK:
		assert_true(Tune.ITEMS.has(id), "%s is in the debug panel" % id)
		var setting: Dictionary = ProjectSettings.get_setting("shader_globals/" + id, {})
		assert_eq(setting.get("type"), "float", id)
		assert_eq(setting.get("value"), Tune.default_of(id), "%s starts at its default" % id)
		assert_string_contains(sources, "global uniform float %s;" % id)


func test_a_flower_on_a_marsh_gets_the_marsh_mark() -> void:
	var opts := {arena_radius = w.arena_radius, now = w.now, grid = w.grid}
	w.flowers.burst(w.rng, 0, Vector2(-10.0, 0.0), Vector2.UP, 20, 1.0, opts)
	w.flowers.burst(w.rng, 1, Vector2(10.0, 0.0), Vector2.UP, 20, 1.0, opts)
	var view: FlowerView = autofree(FlowerView.new())
	view.setup(w)
	var marsh := 0
	for i in 40:
		var mark := view.custom_data(i, 0.0).b
		assert_eq(mark, 1.0 if _marsh(w.flowers.pos[i]) else 0.0, "flower %d" % i)
		marsh += int(mark)
	assert_between(marsh, 10, 20)


func test_reeds_stand_on_a_marsh_and_grass_on_the_rest() -> void:
	var view: GrassView = autofree(GrassView.new())
	view.setup(w)
	var data := view.multimesh.buffer
	var reeds := 0
	var tufts := 0
	for n in view.multimesh.instance_count:
		var at := Vector2(data[n * 16 + 3], data[n * 16 + 11])
		var reed := data[n * 16 + 15] == 0.0
		assert_eq(reed, _marsh(at), "tuft at %s" % at)
		reeds += int(reed)
		tufts += int(not reed)
	assert_almost_eq(float(reeds) / tufts, GrassView.REEDS, 0.05, "reeds for each tuft of grass")


func _marsh(at: Vector2) -> bool:
	return TerrainView.tile(w.map, at) == TerrainMap.Tile.MARSH
