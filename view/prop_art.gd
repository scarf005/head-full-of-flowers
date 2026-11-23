class_name PropArt
## Pixel art of the props: furniture, garden things, rocks and loot boxes. Code draws each prop one time into one
## atlas. A prop shows its top face, 16 pixels for each metre of depth, over its front face.

const INK := Color8(51, 36, 51)
## Letter -> colour. The brightest channel of each colour is a level of the dither pass, so flat areas stay flat.
const PALETTE := {
	"K": INK,
	"a": Color8(255, 214, 150),
	"b": Color8(204, 160, 105),
	"c": Color8(153, 110, 72),
	"d": Color8(102, 70, 50),
	"S": Color8(190, 196, 204),
	"s": Color8(140, 146, 153),
	"z": Color8(92, 96, 102),
	"Q": Color8(255, 120, 96),
	"R": Color8(204, 70, 60),
	"r": Color8(153, 46, 50),
	"Y": Color8(255, 204, 60),
	"y": Color8(204, 146, 40),
	"L": Color8(150, 204, 90),
	"l": Color8(84, 153, 70),
	"m": Color8(48, 102, 60),
	"U": Color8(150, 180, 255),
	"B": Color8(107, 136, 204),
	"u": Color8(78, 96, 153),
	"P": Color8(255, 244, 220),
	"p": Color8(204, 190, 165),
	"T": Color8(204, 110, 70),
	"t": Color8(153, 78, 54),
	"F": Color8(255, 150, 200),
	"f": Color8(204, 100, 150),
	"W": Color8(255, 255, 255),
	"e": Color8(190, 200, 204),
	"H": Color8(204, 204, 214),
	"G": Color8(150, 148, 153),
	"g": Color8(100, 96, 102),
	"C": Color8(204, 170, 120),
	"n": Color8(96, 204, 180),
}
## Kinds that lie flat on the ground: a unit walks over them.
const FLAT: Array[StringName] = [&"rug", &"lilies", &"flowerbed", &"planter"]
## Kinds that a unit walks through: the unit is in front of them or behind them.
const THIN: Array[StringName] = [&"plant", &"reeds"]
## Kinds with a footprint of 2 cells, drawn for each of the 2 directions.
const LONG: Array[StringName] = [
	&"table",
	&"desk",
	&"workbench",
	&"counter",
	&"bookshelf",
	&"shelf",
	&"bench",
	&"flowerbed",
	&"planter",
	&"wheelbarrow"
]
## Per kind: pixels of the front face, then pixels of the art above the back edge of the top face.
const TALL := {
	&"crate": [9, 0],
	&"box": [9, 0],
	&"box_high": [9, 0],
	&"bed": [5, 3],
	&"table": [7, 0],
	&"desk": [7, 0],
	&"workbench": [8, 0],
	&"counter": [8, 4],
	&"bookshelf": [13, 0],
	&"shelf": [12, 0],
	&"bench": [5, 0],
	&"rug": [0, 0],
	&"flowerbed": [3, 0],
	&"planter": [4, 0],
}
const BARREL := [
	"....rrrrrrrr....",
	"..rrRRRRRRRRrr..",
	".rRRQQQQQQRRRRr.",
	"rRRQRRRRRRRRRRRr",
	"rRRRRRRRzzRRRRRr",
	"rRRRRRRRzzRRRRRr",
	"KrRRRRRRRRRRRRrK",
	"RKrrRRRRRRRRrrKr",
	"RRKKrrrrrrrrKKrr",
	"zzzzKKKKKKKKzzzz",
	"QRRRRYYYYYYRRRrr",
	"QRRRRYYKKYYRRRrr",
	"QRRRRYKKKKYRRRrr",
	"QRRRRYYYYYYRRRrr",
	"zzzzzzzzzzzzzzzz",
	"QRRRRRRRRRRRRRrr",
	".RRRRRRRRRRRRrr.",
	"..rrRRRRRRrrrr..",
	"....rrrrrrrr....",
]
const ROCKS := [
	[
		"......HHHHH.......",
		"....HHHHHHHGG.....",
		"...HHHHHHGGGGG....",
		"..HHHHHGGGGGGGg...",
		".HHHHGGGGGGGGGgg..",
		".HHGGGGGGGGGGGggg.",
		"HHGGGGGGgGGGGggggg",
		"HGGGGGGggGGGGggggg",
		"HGGGGGgggGGGgggggg",
		"GGGGGGgggggggggggg",
		"GGGGgggggggggggggg",
		".GGggggggggggggggg",
		".ggggggggggggggggK",
		"..gggggggggggggK..",
	],
	[
		"..........HHHH....",
		".........HHHGGG...",
		"...HHH..HHGGGGGg..",
		"..HHHHG.HGGGGGGgg.",
		".HHHGGGGHGGGGGggg.",
		".HHGGGGgGGGGGgggg.",
		"HHGGGGggGGGGggggg.",
		"HGGGGgggGGggggggg.",
		"HGGGggggggggggggg.",
		"GGGgggggggggggggg.",
		".GggggggKggggggg..",
		"..ggggg..ggggg....",
	],
]
const PLANT := [
	"......LL..........",
	".....LLlL...LL....",
	"..LL.LllL..LLlL...",
	".LLlLLllLLLLllL...",
	".LllLLllLLlllL.LL.",
	"..LlllllLlllLLLlL.",
	"LL.LlllllllLLlllL.",
	"LlLLLlllmllllllL..",
	"LllllllmmmlllLL...",
	".LLllllmmmlllllL..",
	"..mllllmmmmllllmL.",
	"...mmlmmTTmmlmmm..",
	".....mTTTTTTm.....",
	".....TTTTTTTt.....",
	".....tTTTTTtt.....",
	"......tTTTtt......",
	"......tttttt......",
]
const REEDS := [
	"....d.......d.....",
	"....d..d....d.....",
	"....d..d....d..d..",
	".d..l..d....l..d..",
	".d..l..l..d.l..d..",
	".d..l..l..d.l..l..",
	".l..l..l..d.l..l..",
	".l.Ll..l..l.lL.l..",
	".l.Ll.Ll..l.lL.l..",
	".lL.l.Ll.Ll.l.Ll..",
	".lL.lL.l.Ll.l.Ll..",
	"..lLl.Ll.L.ll.l...",
	"..mlmLmlmLmlmml...",
	"...mmmmmmmmmmm....",
]
const LILIES := [
	"....llllll......",
	"..llLLLLLLll....",
	".lLLLLLLLLLLl...",
	"lLLLLLFWFLLLLl..",
	"lLLLLFWYWFLLLl..",
	"lLLLLLFWFLLmm...",
	".lLLLLLLLLm.....",
	"..llLLLLLlll....",
	"....llllll......",
]
const FLOWER := [".F.", "FYF", ".F."]
const CHAIR := [
	"cbbbbbbbbbbc",
	"cbaaaaaaaabc",
	"cbaaaaaaaabc",
	"cbbbbbbbbbbc",
	"cddddddddddc",
	"cddddddddddc",
	"cccccccccccc",
	"cbbbbbbbbbbc",
	"caaaaaaaaaac",
	"caaaaaaaaaac",
	"caaaaaaaaaac",
	"caaaaaaaaaac",
	"caaaaaaaaaac",
	"cbbbbbbbbbbc",
	"cccccccccccc",
	"cddddddddddc",
	"cd........dc",
	"cd........dc",
	"cd........dc",
	"cd........dc",
]
const WHEELBARROW := [
	"........................rrrrrrrrrr..",
	".bbbb..................rRRRRRRRRRRr.",
	".bccbbbbbbbbbbbbbbbbbbrRRQQQQQQQRRRr",
	".....ccccccccccccccccrRRQRRRRRRRRRRr",
	".....................rRRRRRRRRRRRRRr",
	".bbbb................rRRRRRRRRRRRRRr",
	".bccbbbbbbbbbbbbbbbbbbrRRRRRRRRRRRr.",
	".....cccccccccccccccc..rrrrrrrrrrr..",
	".....................zzzz..rrrr.....",
	"....................zzsszz.zz.......",
	"....................zsSSsz.zz.......",
	"....................zzsszz.zz.......",
	".....................zzzz..zz.......",
]
const REGISTER := ["zzzzzz", "znnnnz", "zzzzzz", "zsSsSz", "zSsSsz", "zzzzzz"]
const TOOLBOX := ["..zzzz..", "RRRRRRRR", "RQQQQQQR", "rrrYYrrr", "rrrrrrrr"]

static var _atlas: ImageTexture
## [kind, cells of the footprint] -> rectangle of its art in the atlas.
static var _rects := {}
static var _image: Image
static var _meshes := {}


## The art of all props in one row, built one time.
static func atlas() -> ImageTexture:
	if _atlas == null:
		var arts := {}
		var size := Vector2i.ZERO
		for kind: StringName in [&"barrel", &"rocks", &"rocks2", &"plant", &"reeds", &"lilies", &"chair"]:
			arts[[kind, Vector2i.ONE]] = _draw(kind, Vector2i.ONE)
		for kind: StringName in [&"crate", &"box", &"box_high"]:
			arts[[kind, Vector2i.ONE]] = _draw(kind, Vector2i.ONE)
		for kind: StringName in [&"bed", &"rug"]:
			arts[[kind, Vector2i(2, 2)]] = _draw(kind, Vector2i(2, 2))
		for kind: StringName in LONG:
			for cells: Vector2i in [Vector2i(2, 1), Vector2i(1, 2)]:
				arts[[kind, cells]] = _draw(kind, cells)
		for key: Array in arts:
			var art: Image = arts[key]
			_rects[key] = Rect2i(Vector2i(size.x, 0), art.get_size())
			size = Vector2i(size.x + art.get_width(), maxi(size.y, art.get_height()))
		var image := Image.create_empty(size.x, size.y, false, Image.FORMAT_RGBA8)
		for key: Array in arts:
			var art: Image = arts[key]
			image.blit_rect(art, Rect2i(Vector2i.ZERO, art.get_size()), _rects[key].position)
		_atlas = ImageTexture.create_from_image(image)
	return _atlas


## Rectangle in the atlas of the art of `kind` with a footprint of `cells`.
static func rect(kind: StringName, cells: Vector2i) -> Rect2i:
	atlas()
	return _rects[[kind, cells]]


## Mesh with the art of `kind`. The origin is on the ground at the middle of the south edge of the art. A flat kind
## lies on the ground with the origin at the middle of its north edge.
static func mesh(kind: StringName, cells: Vector2i) -> ArrayMesh:
	var key := [kind, cells]
	if not _meshes.has(key):
		var art := Rect2(rect(kind, cells))
		var sheet := Vector2(atlas().get_size())
		var half := art.size.x * 0.5 / UnitView.PX_PER_M
		var tall := art.size.y / UnitView.PX_PER_M / cos(CameraRig.PITCH)
		var deep := art.size.y / UnitView.PX_PER_M / sin(CameraRig.PITCH)
		var tool := SurfaceTool.new()
		tool.begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
		# Each row: [height, distance to the south, v of the art].
		var rows := [[0.02, 0.0, art.position.y], [0.02, deep, art.end.y]]
		if kind not in FLAT:
			rows = [[tall, 0.0, art.position.y], [0.0, 0.0, art.end.y]]
		for row: Array in rows:
			for side: float in [-1.0, 1.0]:
				tool.set_uv(Vector2(art.get_center().x + side * art.size.x * 0.5, row[2]) / sheet)
				tool.add_vertex(Vector3(side * half, row[0], row[1]))
		_meshes[key] = tool.commit()
	return _meshes[key]


## Draws one prop with a border of ink around it.
static func _draw(kind: StringName, cells: Vector2i) -> Image:
	var wide := cells.x * 20 - 2
	var deep := (16 if cells.y == 1 else 33) - 2
	var tall: Array = TALL.get(kind, [0, 0])
	var rows: Array = (
		{
			&"barrel": BARREL,
			&"rocks": ROCKS[0],
			&"rocks2": ROCKS[1],
			&"plant": PLANT,
			&"reeds": REEDS,
			&"lilies": LILIES,
			&"chair": CHAIR,
			&"wheelbarrow": WHEELBARROW,
		}
		. get(kind, [])
	)
	var size := Vector2i(wide, deep + tall[0] + tall[1])
	if not rows.is_empty():
		size = Vector2i(rows[0].length(), rows.size())
		if kind == &"wheelbarrow" and cells.x == 1:
			size = Vector2i(size.y, size.x)
	# An even width, so the middle of the art is on a pixel border.
	_image = Image.create_empty(size.x + 2 + size.x % 2, size.y + 2, false, Image.FORMAT_RGBA8)
	if kind == &"wheelbarrow" and cells.x == 1:
		# Turned art: the handles point to the south.
		for y in rows.size():
			for x in rows[y].length():
				if rows[y][x] != ".":
					_image.set_pixel(1 + y, 1 + rows[y].length() - 1 - x, PALETTE[rows[y][x]])
	elif not rows.is_empty():
		_art(0, 0, rows)
	else:
		_furniture(kind, wide, deep, tall[1])
	if kind != &"rug":
		_outline()
	return _image


## Box-shaped props. `y` is the row of the back edge of the top face.
static func _furniture(kind: StringName, w: int, d: int, y: int) -> void:
	var long := w > d + 4
	match kind:
		&"crate":
			_box(0, y, w, d, 9, "b", "a", "c")
			_fill(2, y + 2, w - 4, d - 5, "a")
			for x: int in [6, 11]:
				_fill(x, y + 2, 1, d - 5, "b")
			_fill(2, y + d + 2, w - 4, 5, "d")
			for n in 5:
				_fill(3 + n * 3, y + d + 2 + n, 2, 1, "c")
		&"box", &"box_high":
			var high := kind == &"box_high"
			_box(0, y, w, d, 9, "W" if high else "Y", "W" if high else "a", "e" if high else "y")
			_fill(7, y, 4, d + 9, "Y" if high else "R")
			_fill(7, y + d - 1, 4, 1, "a" if high else "Q")
			_fill(7, y + d + 2, 4, 3, "K")
			_fill(8, y + d + 3, 2, 1, "W")
			_fill(0, y + d + 7, w, 1, "s" if high else "c")
		&"bed":
			_box(0, y, w, d, 5, "e", "U", "c")
			# Headboard, 2 pillows, then a blanket with dots that hangs over the foot of the bed.
			_fill(0, 0, w, 4, "c")
			_fill(1, 1, w - 2, 1, "b")
			for x: int in [3, w / 2 + 2]:
				_fill(x, y + 2, w / 2 - 5, 8, "W")
				_fill(x, y + 9, w / 2 - 5, 1, "S")
			_fill(0, y + 13, w, d - 13, "B")
			_fill(0, y + 13, w, 2, "U")
			for n in 12:
				_fill(4 + (n % 4) * 9 + (n / 4 % 2) * 4, y + 17 + (n / 4) * 4, 2, 2, "U")
			_fill(0, y + d, w, 3, "u")
			_fill(3, y + d + 3, w - 6, 2, "d")
		&"table":
			_box(0, y, w, d, 2, "b", "a", "c")
			_fill(2, y + 1, w - 4, 1, "a")
			for x: int in [1, w - 3]:
				_fill(x, y + d + 2, 2, 5, "c")
			# A plate and a cup at each third of the long side.
			for n in 2:
				var at := (
					Vector2i(w * (n + 1) / 3 - 3, y + d / 2 - 2)
					if long
					else Vector2i(w / 2 - 3, y + d * (n + 1) / 3 - 2)
				)
				_art(at.x, at.y, [".WWWW.", "WWeeWW", "WWeeWW", ".WWWW."])
				_fill(at.x + (8 if long else 1), at.y + (0 if long else 6), 2, 2, "R")
		&"desk":
			_box(0, y, w, d, 7, "b", "a", "c")
			_fill(2, y + d + 1, w - 4, 5, "d")
			for x: int in [1, w - 7] if long else [1]:
				_fill(x, y + d + 1, 6 if long else w - 2, 5, "c")
				_fill(x + (2 if long else w / 2 - 2), y + d + 3, 2, 1, "a")
			_art(3, y + 3, ["PPPPP", "PppPP", "PPPPP", "PppPP", "PPPPP", "PPPPP"])
			_art(w - 9, y + d - 8, ["mmmmmm", "mllllm", "mllllm", "mmmmmm"])
			_fill(w - 6, y + 2, 1, 4, "K")
		&"workbench":
			_box(0, y, w, d, 8, "S", "W", "s")
			_fill(1, y + d + 2, w - 2, 6, "z")
			_fill(3, y + d + 4, w - 6, 1, "s")
			for x: int in [0, w - 2]:
				_fill(x, y + d, 2, 8, "s")
			_art(3, y + 3, TOOLBOX)
			_art(w - 8, y + d - 7, ["ss...", "sszzz", "ss..."])
			_fill(w - 9, y + 2, 5, 2, "c")
		&"counter":
			_box(0, y, w, d, 8, "P", "W", "p")
			_fill(0, y + d + 2, w, 2, "n")
			_fill(0, y + d + 7, w, 1, "s")
			_art(3, y - 3, REGISTER)
			_art(w - 8, y + d - 7, ["RR.YY", "RR.YY", "rr.yy"])
		&"bookshelf":
			_box(0, y, w, d, 13, "c", "b", "d")
			_fill(1, y + 1, w - 2, d - 3, "b")
			if long:
				# Two rows of book spines on the front.
				for row in 2:
					for n in (w - 4) / 2:
						var short := (n * 7 + row * 3) % 5 == 0
						_fill(
							2 + n * 2,
							y + d + 1 + row * 6 + int(short),
							2,
							5 - int(short),
							"RYlBPu"[(n * 5 + row * 2) % 6]
						)
			else:
				# The shelf faces east: the tops of the books show on that side.
				for n in (d - 4) / 2:
					_fill(w - 7, y + 2 + n * 2, 5, 2, "RYlBPu"[n * 5 % 6])
				_fill(2, y + d + 2, w - 4, 9, "c")
		&"shelf":
			_box(0, y, w, d, 12, "s", "S", "z")
			for at: Vector2i in (
				[Vector2i(2, 2), Vector2i(w - 9, d - 9)] if long else [Vector2i(2, 2), Vector2i(4, d - 10)]
			):
				_art(at.x, y + at.y, ["CCCCCCC", "CCCPCCC", "CCCPCCC", "CCCPCCC", "CCCCCCC", "ccccccc"])
			for row in 2:
				_fill(1, y + d + 1 + row * 6, w - 2, 4, "K")
				for n in (w - 4) / 6:
					_fill(2 + n * 6, y + d + 2 + row * 6, 5, 3, "CRCnYC"[(n + row * 2) % 6])
			for x: int in [0, w - 1]:
				_fill(x, y + d, 1, 12, "S")
		&"bench":
			_box(0, y, w, d, 2, "b", "a", "c")
			for n in 3:
				var gap := (n + 1) * (d if long else w) / 4
				_fill(0 if long else gap, y + (gap if long else 0), w if long else 1, 1 if long else d, "c")
			for x: int in [1, w - 3]:
				_fill(x, y + d + 2, 2, 3, "z")
		&"rug":
			_fill(0, 0, w, d, "R")
			_fill(2, 2, w - 4, d - 4, "Q")
			_fill(4, 4, w - 8, d - 8, "R")
			for n in 5:
				_fill(w / 2 - 1 - n * 2, d / 2 - 5 + n, 2 + n * 4, 1, "a")
				_fill(w / 2 - 1 - n * 2, d / 2 + 4 - n, 2 + n * 4, 1, "a")
			_fill(w / 2 - 3, d / 2 - 1, 6, 2, "R")
			for x in w / 2:
				_fill(x * 2, 0, 1, 1, "P")
				_fill(x * 2 + 1, d - 1, 1, 1, "P")
		&"flowerbed", &"planter":
			var bed := kind == &"flowerbed"
			_box(0, y, w, d, 3 if bed else 4, "c" if bed else "T", "b" if bed else "Q", "d" if bed else "t")
			_fill(2, y + 2, w - 4, d - 5, "d")
			# The last plant ends 2 pixels before the rim.
			var count := ((w if long else d) - 4) / 6
			for n in count:
				var along := 3 + n * 6
				var across := 2 + (n * 3) % ((d if long else w) - 9)
				var at := Vector2i(along, y + across) if long else Vector2i(across, y + along)
				if bed:
					_fill(at.x, at.y + 2, 4, 3, "l")
					_art(at.x, at.y, FLOWER)
					_fill(at.x + 1, at.y + 1, 1, 1, "Y")
					if n % 3 == 1:
						_fill(at.x, at.y + 1, 1, 1, "W")
						_fill(at.x + 2, at.y + 1, 1, 1, "W")
						_fill(at.x + 1, at.y, 1, 1, "W")
						_fill(at.x + 1, at.y + 2, 1, 1, "W")
				else:
					_art(at.x - 1, at.y, [".LLLL.", "LLLlLL", "LlllLl", "llmlll", ".lmml."])


## A box: the top face, the bright rim of its front edge and the front face below it. The 4 corners are round.
static func _box(x: int, y: int, w: int, d: int, h: int, top: String, rim: String, front: String) -> void:
	_fill(x, y, w, d, top)
	_fill(x, y + d - 1, w, 1, rim)
	_fill(x, y + d, w, h, front)
	for corner: Vector2i in [Vector2i(x, y), Vector2i(x + w - 1, y)]:
		_image.set_pixelv(corner + Vector2i.ONE, Color.TRANSPARENT)


static func _fill(x: int, y: int, w: int, h: int, letter: String) -> void:
	_image.fill_rect(Rect2i(x + 1, y + 1, w, h), PALETTE[letter])


## Draws the rows of letters with the top left pixel at (x, y).
static func _art(x: int, y: int, rows: Array) -> void:
	for row in rows.size():
		for column in rows[row].length():
			if rows[row][column] != ".":
				_image.set_pixel(1 + x + column, 1 + y + row, PALETTE[rows[row][column]])


## Sets each clear pixel next to the art to ink.
static func _outline() -> void:
	var source := _image.duplicate() as Image
	for y in source.get_height():
		for x in source.get_width():
			if source.get_pixel(x, y).a > 0.5:
				continue
			for side: Vector2i in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				var at := Vector2i(x, y) + side
				if Rect2i(Vector2i.ZERO, source.get_size()).has_point(at) and source.get_pixelv(at).a > 0.5:
					_image.set_pixel(x, y, INK)
