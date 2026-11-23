class_name Menu
extends PanelContainer
## Title, pause and result screens in one panel.

signal start(config: Dictionary)
signal resume
signal quit_to_title

const MODES: Array[StringName] = [&"ffa", &"tdm", &"duo", &"squad"]
const MODE_NAMES := ["Free for All", "Team Deathmatch", "Duos", "Squads"]
## Per mode: [smallest size, largest size, default size].
const SIZES := [[2, 8, 8], [2, 6, 4], [2, 6, 4], [2, 3, 3]]
## Controls legend: key caps (a StringName is an icon) and the icon of what they do.
const LEGEND := [
	[["W", "A", "S", "D"], &"move"],
	[[&"mouse"], &"crosshair"],
	[["LMB"], &"fire"],
	[["RMB", "G"], &"grenade"],
	[["R"], &"rapid_reload"],
	[["Q", "Wheel"], &"swap"],
	[["Esc"], &"pause"],
]

var settings := ConfigFile.new()
var _box := VBoxContainer.new()
var _mode := OptionButton.new()
var _size := SpinBox.new()
var _hard := CheckButton.new()
var _seed := LineEdit.new()
var _config := {}
var _typed_seed := ""


func _ready() -> void:
	settings.load("user://settings.cfg")
	TranslationServer.set_locale(settings.get_value("ui", "locale", OS.get_locale_language()))
	set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE)
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	_box.custom_minimum_size.x = 360.0
	var back := StyleBoxFlat.new()
	back.bg_color = Color(0.05, 0.05, 0.08, 0.88)
	back.set_content_margin_all(12.0)
	add_theme_stylebox_override("panel", back)
	add_child(_box)
	show_title()


func show_title() -> void:
	_clear()
	_label("Head Full of Flowers", 32)
	_mode = OptionButton.new()
	for n in MODES.size():
		_mode.add_item(tr(MODE_NAMES[n]))
	_mode.selected = settings.get_value("match", "mode", 0)
	_mode.item_selected.connect(func(index: int) -> void: _fit_size(index, SIZES[index][2]))
	_row(&"mode", "Mode", _mode)
	_size = SpinBox.new()
	_fit_size(_mode.selected, settings.get_value("match", "size", 8))
	_row(&"players", "Size", _size)
	_hard = CheckButton.new()
	_hard.button_pressed = settings.get_value("match", "hard", false)
	_row(&"bots", "Hard bots", _hard)
	_seed = LineEdit.new()
	_seed.placeholder_text = tr("random")
	_row(&"seed", "Map seed", _seed)
	_button(&"play", "Start", _start).grab_focus()
	_volume(&"sound", "Sound", &"Sfx")
	_volume(&"music", "Music", &"Music")
	_button(&"language", "한국어" if TranslationServer.get_locale() != "ko" else "English", _swap_locale)
	if not OS.has_feature("web"):
		_button(&"exit", "Quit", get_tree().quit)
	_legend()
	show()


func show_pause() -> void:
	_clear()
	_label("Paused", 32)
	_button(&"play", "Resume", resume.emit).grab_focus()
	_button(&"exit", "Leave match", quit_to_title.emit)
	_legend()
	show()


## Final standings and the player's numbers.
func show_results(w: SimWorld) -> void:
	_clear()
	var rows := w.standings()
	var total := 0
	for row in rows:
		total += row.petals
	var player := w.units[0]
	var won: bool = rows[0].team == player.team
	var header := _line()
	header.add_child(_icon(&"trophy" if won else &"skull", "", 32.0))
	_label("Victory" if won else "Defeat", 32).reparent(header)
	var table := GridContainer.new()
	table.columns = 4
	table.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	table.add_theme_constant_override("h_separation", 12)
	_box.add_child(table)
	for place in rows.size():
		var team: int = rows[place].team
		var names := w.units.filter(func(u: SimUnit) -> bool: return u.team == team).map(Hud.unit_name)
		var bar := ColorRect.new()
		bar.color = w.team_color(team)
		bar.custom_minimum_size = Vector2(140.0 * rows[place].petals / maxf(1.0, rows[0].petals), 12.0)
		bar.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var share := "%d%%" % (100.0 * rows[place].petals / maxf(1.0, total))
		for cell: Variant in ["%d" % (place + 1), ", ".join(names), bar, share]:
			var node: Control = cell if cell is Control else _label(cell, 16)
			if node is Label:
				node.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
				node.add_theme_color_override("font_color", bar.color if team != player.team else Color.WHITE)
				node.reparent(table)
			else:
				table.add_child(node)
	var accuracy := 100.0 * player.shots_hit / maxf(1.0, player.shots_fired)
	var stats := _line()
	for stat: Array in [[&"skull", "Kills", player.kills], [&"tombstone", "Deaths", player.deaths]]:
		stats.add_child(_icon(stat[0], stat[1], 32.0))
		_label(str(stat[2]), 16).reparent(stats)
	stats.add_child(_icon(&"crosshair", "Hit rate", 32.0))
	_label("%d%%" % accuracy, 16).reparent(stats)
	_button(&"restart", "Play again", _again).grab_focus()
	_button(&"exit", "Leave match", quit_to_title.emit)
	show()


func _start() -> void:
	settings.set_value("match", "mode", _mode.selected)
	settings.set_value("match", "size", int(_size.value))
	settings.set_value("match", "hard", _hard.button_pressed)
	settings.save("user://settings.cfg")
	_config = {mode = MODES[_mode.selected], size = int(_size.value), hard = _hard.button_pressed}
	_typed_seed = _seed.text
	_again()


## Start a match with the last settings. The results screen has no setting widgets.
func _again() -> void:
	var config := _config.duplicate()
	config.seed = _typed_seed.hash() if _typed_seed else randi()
	start.emit(config)


func _fit_size(mode: int, value: int) -> void:
	_size.min_value = SIZES[mode][0]
	_size.max_value = SIZES[mode][1]
	_size.value = value


func _swap_locale() -> void:
	var locale := "en" if TranslationServer.get_locale() == "ko" else "ko"
	TranslationServer.set_locale(locale)
	settings.set_value("ui", "locale", locale)
	settings.save("user://settings.cfg")
	show_title()


func _volume(icon: StringName, text: String, bus: StringName) -> void:
	var slider := HSlider.new()
	slider.max_value = 1.0
	slider.step = 0.05
	slider.value = settings.get_value("audio", bus, 0.8)
	slider.custom_minimum_size.x = 180.0
	var apply := func(value: float) -> void:
		var index := AudioServer.get_bus_index(bus)
		if index >= 0:
			AudioServer.set_bus_volume_db(index, linear_to_db(maxf(value, 0.0001)))
		settings.set_value("audio", bus, value)
	apply.call(slider.value)
	slider.value_changed.connect(apply)
	slider.value_changed.connect(func(_value: float) -> void: settings.save("user://settings.cfg"))
	_row(icon, text, slider)


func _clear() -> void:
	for child in _box.get_children():
		_box.remove_child(child)
		child.queue_free()


func _label(text: String, px: int) -> Label:
	var label := Label.new()
	label.text = tr(text)
	label.add_theme_font_size_override("font_size", px)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_box.add_child(label)
	return label


func _button(icon: StringName, text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = tr(text)
	button.icon = Icons.get_icon(icon)
	button.pressed.connect(action)
	_box.add_child(button)
	return button


func _row(icon: StringName, text: String, control: Control) -> void:
	var row := HBoxContainer.new()
	row.add_child(_icon(icon, "", 32.0))
	var label := Label.new()
	label.text = tr(text)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	row.add_child(control)
	_box.add_child(row)


## A centred row for icons and labels.
func _line() -> HBoxContainer:
	var line := HBoxContainer.new()
	line.alignment = BoxContainer.ALIGNMENT_CENTER
	_box.add_child(line)
	return line


func _icon(id: StringName, tooltip: String, px: float) -> TextureRect:
	var icon := TextureRect.new()
	icon.texture = Icons.get_icon(id)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2.ONE * px
	icon.tooltip_text = tr(tooltip) if tooltip else ""
	return icon


func _legend() -> void:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.add_theme_constant_override("h_separation", 24)
	var cap := StyleBoxFlat.new()
	cap.bg_color = Color(0.05, 0.05, 0.08)
	cap.set_border_width_all(2)
	cap.border_color = Color(0.75, 0.75, 0.8)
	cap.set_content_margin_all(4.0)
	for entry: Array in LEGEND:
		var line := HBoxContainer.new()
		for key: Variant in entry[0]:
			if key is StringName:
				line.add_child(_icon(key, "", 32.0))
				continue
			var label := Label.new()
			label.text = tr(key)
			label.add_theme_stylebox_override("normal", cap)
			line.add_child(label)
		line.add_child(_icon(entry[1], "", 32.0))
		grid.add_child(line)
	_box.add_child(grid)
