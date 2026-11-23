class_name SpriteArt
## Pixel art of a unit, drawn as text: a girl with fox ears and a tail. Each letter is one pixel.
## The sheet has 2 rows (front view, back view) of 6 frames: 2 at rest, then 4 of the walk.

const FRAME := Vector2i(24, 28)
const FRAMES := 6
## Letter -> colour. H, h and L are the team colour (base, dark, light): the sprite shader swaps these 3 keys.
## The brightest channel of each other colour is a level of the dither pass, so flat areas stay flat.
const PALETTE := {
	"K": Color8(51, 36, 51),
	"H": Color8(255, 0, 255),
	"h": Color8(160, 0, 160),
	"L": Color8(255, 128, 255),
	"E": Color8(255, 214, 222),
	"S": Color8(255, 222, 196),
	"r": Color8(255, 170, 170),
	"W": Color8(255, 255, 255),
	"P": Color8(255, 70, 120),
	"B": Color8(102, 92, 110),
	"F": Color8(255, 150, 200),
	"Y": Color8(255, 204, 60),
	"M": Color8(204, 91, 105),
}
## Ears, hair and face. The flower pin is white, so it shows on each hair colour.
const HEAD_FRONT := [
	".K............K.",
	"KHK..........KHK",
	"KHHK........KHHK",
	"KHWHK......KHWHK",
	"KHWWHK....KHWWHK",
	"KHEWHHKKKKHHWEHK",
	"KHHEHLLHHHWHEHHK",
	"KHHHHLLHHWYWHHHK",
	"KHHHHHHHHHWHHHHK",
	"KHHhHhHHHHhHhHHK",
	"KHhSShSSSShSShHK",
	"KHhSKKSSSSKKShHK",
	"KHhSPWSSSSPWShHK",
	"KHhrPPSSSSPPrhHK",
	"KHhSSSSMMSSSShHK",
	"KhhKSSSSSSSSKhhK",
	"KhK.KKKKKKKK.KhK",
	".K............K.",
]
const HEAD_BACK := [
	".K............K.",
	"KHK..........KHK",
	"KHHK........KHHK",
	"KHHHK......KHHHK",
	"KHhHHK....KHHhHK",
	"KHhHHHKKKKHHHhHK",
	"KHHHHHHHHLLHHHHK",
	"KHHHHHHHHHLLHHHK",
	"KHHHHHHHHHHLHHHK",
	"KHHHHHHHHHHHHHHK",
	"KHHHhHHHHHHhHHHK",
	"KHHHhHHHHHHhHHHK",
	"KHHhHHHhhHHHhHHK",
	"KHHhHHHhhHHHhHHK",
	"KHhHHHhHHhHHHhHK",
	"KHhKHhKHHKhHKhHK",
	"KhK.KK.KK.KK.KhK",
	".K............K.",
]
## White shirt with dark straps, bare arms and a dark skirt.
const BODY_FRONT := [
	"..KWWWWWWK..",
	".KSWBWWBWSK.",
	".KSWBWWBWSK.",
	".KKWWBBWWKK.",
	"..KBBBBBBK..",
	".KBBBBBBBBK.",
	".KKKKKKKKKK.",
]
const BODY_BACK := [
	"..KWWWWWWK..",
	".KSWBWWBWSK.",
	".KSWWBBWWSK.",
	".KKWBWWBWKK.",
	"..KBBBBBBK..",
	".KBBBBBBBBK.",
	".KKKKKKKKKK.",
]
## Legs at rest and at the 2 steps of the walk.
const LEGS := [
	["...KSKKSK...", "...KSKKSK...", "...KBKKBK..."],
	["...KSKKSK...", "..KSK.KBK...", "..KBK.KKK..."],
	["...KSKKSK...", "...KBK.KSK..", "...KKK.KBK.."],
]
## The tip is at the top left and the root at the bottom right.
const TAIL := [
	".KKK....",
	"KWWHK...",
	"KWHHHK..",
	"KHHHHHK.",
	".KHHHHK.",
	"..KHHhK.",
	"...KKhK.",
	".....KK.",
]
## Per frame: [legs, lift of the upper body in pixels, lift of the tail in pixels].
const POSES := [[0, 0, 0], [0, -1, 0], [1, 0, 1], [0, 1, 0], [2, 0, 1], [0, 1, 0]]

static var _sheet: ImageTexture


## The sheet of all frames, built one time.
static func sheet() -> ImageTexture:
	if _sheet == null:
		var image := Image.create_empty(FRAME.x * FRAMES, FRAME.y * 2, false, Image.FORMAT_RGBA8)
		for n in FRAMES:
			var pose: Array = POSES[n]
			var front := Vector2i(n * FRAME.x, 0)
			var back := front + Vector2i(0, FRAME.y)
			# Front view: the tail is behind the body. Back view: the tail hangs over the skirt.
			_stamp(image, TAIL, front + Vector2i(0, 16 - pose[1] - pose[2]), false)
			_stamp(image, LEGS[pose[0]], front + Vector2i(6, 25), false)
			_stamp(image, BODY_FRONT, front + Vector2i(6, 18 - pose[1]), false)
			_stamp(image, HEAD_FRONT, front + Vector2i(4, 1 - pose[1]), false)
			_stamp(image, LEGS[pose[0]], back + Vector2i(6, 25), false)
			_stamp(image, BODY_BACK, back + Vector2i(6, 18 - pose[1]), false)
			_stamp(image, HEAD_BACK, back + Vector2i(4, 1 - pose[1]), false)
			_stamp(image, TAIL, back + Vector2i(13, 16 - pose[1] - pose[2]), true)
		_sheet = ImageTexture.create_from_image(image)
	return _sheet


## Place of a frame in the sheet as a UV rectangle (x, y, width, height).
static func frame_uv(back: bool, frame: int) -> Vector4:
	return Vector4(float(frame) / FRAMES, 0.5 if back else 0.0, 1.0 / FRAMES, 0.5)


## Draws the rows of `art` with the top left pixel at `at`. `mirror` flips the art left to right.
static func _stamp(image: Image, art: Array, at: Vector2i, mirror: bool) -> void:
	for y in art.size():
		var row: String = art[y]
		for x in row.length():
			var letter := row[row.length() - 1 - x] if mirror else row[x]
			var cell := at + Vector2i(x, y)
			if letter != "." and cell.y >= 0 and cell.y < image.get_height():
				image.set_pixelv(cell, PALETTE[letter])
