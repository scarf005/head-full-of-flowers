class_name Banner
extends Control
## Short centred call-outs: match start, kill streaks, lead changes, the last seconds and the match end.

const STREAKS := ["Double kill", "Triple kill", "Rampage"]

var game: GameView
var _text := ""
var _color := Color.WHITE
var _ttl := 0.0
## Seconds since the call-out came. It starts large and shrinks to its size in 0.12 s.
var _age := 0.0
var _streak := 0
var _streak_at := -10.0
var _leader := -1
var _second := 11


func setup(view: GameView) -> void:
	game = view
	_ttl = 0.0
	_streak = 0
	_streak_at = -10.0
	_leader = -1
	_second = 11
	game.event.connect(_on_event)


func say(text: String, color: Color, seconds: float) -> void:
	# A call-out that repeats in each frame, for example out of bounds, stays at its size.
	if text != _text or _ttl <= 0.0:
		_age = 0.0
	_text = text
	_color = color
	_ttl = seconds


func _on_event(e: Dictionary) -> void:
	if game.autoplay:
		return
	if e.type == &"go":
		say(tr("GO"), Color.WHITE, 0.8)
	elif e.type == &"finish":
		# The results panel opens after 1.5 s and covers this place.
		say(tr("TIME"), Color.WHITE, 1.4)
	elif e.type == &"hit" and e.kill and e.source == 0 and e.target != 0:
		_streak = _streak + 1 if game.world.now - _streak_at < 4.0 else 1
		_streak_at = game.world.now
		if _streak > 1:
			say(tr(STREAKS[mini(_streak, 4) - 2]), Color(1.0, 0.85, 0.3), 1.2)


func _process(delta: float) -> void:
	_ttl -= 0.0 if get_tree().paused else delta
	_age += delta
	var w := game.world
	if game.autoplay or w.finished:
		queue_redraw()
		return
	var top: Dictionary = w.standings()[0]
	var mine := game.player.team
	if top.petals > 0 and top.team != _leader:
		if top.team == mine and _leader != -1:
			say(tr("Lead taken"), w.team_color(mine), 1.2)
		elif _leader == mine:
			say(tr("Lead lost"), Color(1.0, 0.4, 0.4), 1.2)
		_leader = top.team
	if game.player.pos.length() > w.arena_radius - game.player.radius - 0.05:
		say(tr("Out of bounds"), Color(1.0, 0.4, 0.4), 0.2)
	var second := ceili(w.time_left / Defs.GAME_SPEED)
	if second <= 10 and second < _second:
		_second = second
		say(str(second), Color.WHITE, 0.6)
		game.event.emit({type = &"tick"})
	queue_redraw()


func _draw() -> void:
	if _ttl <= 0.0:
		return
	var font := get_theme_default_font()
	var at := Vector2(0.0, size.y * 0.3)
	# Steps of 16 px keep the pixel font sharp.
	var px := 64 + 16 * ceili(3.0 * clampf(1.0 - _age / 0.12, 0.0, 1.0))
	at.y += (px - 64) * 0.35
	draw_string_outline(font, at, _text, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, 12, Color(0.05, 0.05, 0.08))
	draw_string(font, at, _text, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, _color)
