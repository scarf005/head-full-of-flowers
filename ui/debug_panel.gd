class_name DebugPanel
extends PanelContainer
## Debug mode: a slider for each number of `Tune`, and buttons that give the player a weapon or a perk.

## A person asked for this weapon or perk for the player.
signal give(id: StringName)
## A person asked for the end of the match.
signal finish
## A person changed a number.
signal changed

## The range of a number that is a yes or no.
const YES_NO: Array = [0.0, 1.0, 1.0]

## Number id -> its slider.
var sliders := {}
## Id of a yes/no number -> its check box.
var checks := {}
## Number id -> the control that shows when the number differs from its default.
var _marks := {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	# The weapons of the player show below the panel.
	offset_bottom = -96.0
	var back := StyleBoxFlat.new()
	back.bg_color = Color(0.05, 0.05, 0.08, 0.9)
	back.set_content_margin_all(6.0)
	add_theme_stylebox_override("panel", back)
	var box := VBoxContainer.new()
	add_child(box)
	for ids: Array in [Defs.WEAPON_IDS, Defs.PERKS.keys()]:
		var row := HBoxContainer.new()
		for id: StringName in ids:
			var names: Dictionary = Defs.WEAPONS if Defs.WEAPONS.has(id) else Defs.PERKS
			row.add_child(_button(id, names[id].name, give.emit.bind(id)))
		box.add_child(row)
	var row := HBoxContainer.new()
	row.add_child(_button(&"restart", "Reset numbers", _reset))
	row.add_child(_button(&"clock", "End match", finish.emit))
	box.add_child(row)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 3
	scroll.add_child(grid)
	for id: StringName in Tune.ITEMS:
		var item: Array = Tune.ITEMS[id]
		var label := Label.new()
		label.text = tr(String(id).replace("_", " "))
		grid.add_child(label)
		if item == YES_NO:
			var check := CheckBox.new()
			# The arrow keys move the player, so a check box must not take them.
			check.focus_mode = Control.FOCUS_NONE
			check.toggled.connect(func(on: bool) -> void: _write(float(on), id))
			grid.add_child(check)
			grid.add_child(Control.new())
			checks[id] = check
			_marks[id] = label
			continue
		var slider := HSlider.new()
		slider.min_value = item[0]
		slider.max_value = item[1]
		slider.step = item[2]
		slider.custom_minimum_size.x = 96.0
		slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		# The arrow keys move the player, so a slider must not take them.
		slider.focus_mode = Control.FOCUS_NONE
		slider.value_changed.connect(_write.bind(id))
		grid.add_child(slider)
		sliders[id] = slider
		var value := Label.new()
		value.custom_minimum_size.x = 40.0
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(value)
		_marks[id] = value
	refresh()


## Shows the numbers of `Tune`.
func refresh() -> void:
	for id: StringName in sliders:
		sliders[id].set_value_no_signal(Tune.read(id))
		_show(id)
	for id: StringName in checks:
		checks[id].set_pressed_no_signal(Tune.read(id) > 0.5)
		_show(id)


func _show(id: StringName) -> void:
	var differs := not is_equal_approx(Tune.read(id), Tune.default_of(id))
	if sliders.has(id):
		_marks[id].text = String.num(Tune.read(id), 2)
	_marks[id].modulate = Color(1.0, 0.75, 0.4) if differs else Color.WHITE


func _write(value: float, id: StringName) -> void:
	Tune.write(id, value)
	_show(id)
	changed.emit()


func _reset() -> void:
	Tune.reset()
	refresh()
	changed.emit()


func _button(icon: StringName, tooltip: String, action: Callable) -> Button:
	var button := Button.new()
	button.icon = Icons.get_icon(icon)
	button.expand_icon = true
	button.custom_minimum_size = Vector2(30.0, 30.0)
	button.tooltip_text = tr(tooltip)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(action)
	return button
