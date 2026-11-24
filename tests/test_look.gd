extends GutTest
## Numbers that the shaders read.


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
