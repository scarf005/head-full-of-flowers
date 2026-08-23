const FONT: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "m": ["00000", "11010", "10101", "10101", "10101"],
  "x": ["000", "101", "010", "101", "000"],
}

export const directWebGLGlyphFor = (char: string) => FONT[char]

const glyphWidth = (char: string) => directWebGLGlyphFor(char)?.[0]?.length ?? 3

export const measureDirectWebGLText = (text: string, pixelSize: number) => ({
  width: Math.max(
    3 * pixelSize,
    [...text].reduce((width, char) => width + (glyphWidth(char) + 1) * pixelSize, -pixelSize),
  ),
  height: 5 * pixelSize,
})
