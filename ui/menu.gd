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

var settings := ConfigFile.new()
var _box := VBoxContainer.new()
var _mode := OptionButton.new()
var _size := SpinBox.new()
var _hard := CheckButton.new()
var _seed := LineEdit.new()


func _ready() -> void:
	settings.load("user://settings.cfg")
	TranslationServer.set_locale(settings.get_value("ui", "locale", OS.get_locale_language()))
	set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE)
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	_box.custom_minimum_size.x = 360.0
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
	_row("Mode", _mode)
	_size = SpinBox.new()
	_fit_size(_mode.selected, settings.get_value("match", "size", 8))
	_row("Size", _size)
	_hard = CheckButton.new()
	_hard.button_pressed = settings.get_value("match", "hard", false)
	_row("Hard bots", _hard)
	_seed = LineEdit.new()
	_seed.placeholder_text = tr("random")
	_row("Map seed", _seed)
	_button("Start", _start).grab_focus()
	_volume("Sound", &"Sfx")
	_volume("Music", &"Music")
	_button("한국어" if TranslationServer.get_locale() != "ko" else "English", _swap_locale)
	if not OS.has_feature("web"):
		_button("Quit", get_tree().quit)
	show()


func show_pause() -> void:
	_clear()
	_label("Paused", 32)
	_button("Resume", resume.emit).grab_focus()
	_button("Leave match", quit_to_title.emit)
	show()


## Final standings and the player's numbers.
func show_results(w: SimWorld) -> void:
	_clear()
	var rows := w.standings()
	var total := 0
	for row in rows:
		total += row.petals
	var player := w.units[0]
	_label("Victory" if rows[0].team == player.team else "Defeat", 32)
	for place in rows.size():
		var names := w.units.filter(func(u: SimUnit) -> bool: return u.team == rows[place].team).map(Hud.unit_name)
		var share: float = 100.0 * rows[place].petals / maxf(1.0, total)
		var line := _label("%d. %s   %d (%d%%)" % [place + 1, ", ".join(names), rows[place].petals, share], 16)
		line.add_theme_color_override("font_color", w.team_color(rows[place].team))
	var accuracy := 100.0 * player.shots_hit / maxf(1.0, player.shots_fired)
	_label(
		"%s %d   %s %d   %s %d%%" % [tr("Kills"), player.kills, tr("Deaths"), player.deaths, tr("Hit rate"), accuracy],
		16
	)
	_button("Play again", _start).grab_focus()
	_button("Leave match", quit_to_title.emit)
	show()


func _start() -> void:
	settings.set_value("match", "mode", _mode.selected)
	settings.set_value("match", "size", int(_size.value))
	settings.set_value("match", "hard", _hard.button_pressed)
	settings.save("user://settings.cfg")
	var seed := _seed.text.hash() if _seed.text else randi()
	start.emit({mode = MODES[_mode.selected], size = int(_size.value), hard = _hard.button_pressed, seed = seed})


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


func _volume(text: String, bus: StringName) -> void:
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
	slider.value_changed.connect(apply)
	slider.drag_ended.connect(func(_changed: bool) -> void: settings.save("user://settings.cfg"))
	apply.call(slider.value)
	_row(text, slider)


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


func _button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = tr(text)
	button.pressed.connect(action)
	_box.add_child(button)
	return button


func _row(text: String, control: Control) -> void:
	var row := HBoxContainer.new()
	var label := Label.new()
	label.text = tr(text)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	row.add_child(control)
	_box.add_child(row)
