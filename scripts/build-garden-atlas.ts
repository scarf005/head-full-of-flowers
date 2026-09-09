/// <reference lib="deno.ns" />
// Run from the repository root with --allow-read=src/assets/props --allow-run=magick.
import { PROP_SPECS } from "../src/game/world/terrain-props.ts"

const directory = "src/assets/props"
const source: { palette: Record<string, string>; sprites: Record<string, string[]> } = JSON.parse(
  await Deno.readTextFile(`${directory}/garden-atlas.json`),
)
for (const kind of Object.keys(PROP_SPECS)) {
  if (!source.sprites[kind]) throw new Error(`Missing sprite: ${kind}`)
}
const cell = 24
const width = cell * 4
const pixels = new Uint8Array(width * width * 4)
for (const [kind, rows] of Object.entries(source.sprites)) {
  const spec = PROP_SPECS[kind as keyof typeof PROP_SPECS]
  const spriteWidth = Math.max(...rows.map((row) => row.length))
  if (!spec || !rows.length || rows.length > cell || spriteWidth > cell) throw new Error(`Invalid sprite: ${kind}`)
  const left = spec.sprite % 4 * cell + Math.floor((cell - spriteWidth) / 2)
  const top = Math.floor(spec.sprite / 4) * cell + Math.floor((cell - rows.length) / 2)
  for (const [y, row] of rows.entries()) {
    for (const [x, symbol] of [...row].entries()) {
      const color = source.palette[symbol]
      if (!/^#[0-9a-f]{8}$/i.test(color ?? "")) throw new Error(`Unknown color ${symbol} in ${kind}`)
      const offset = ((top + y) * width + left + x) * 4
      pixels.set(color.slice(1).match(/../g)!.map((value) => parseInt(value, 16)), offset)
    }
  }
}
const header = new TextEncoder().encode(
  `P7\nWIDTH ${width}\nHEIGHT ${width}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`,
)
const process = new Deno.Command("magick", {
  args: ["pam:-", "-strip", `PNG32:${directory}/garden-atlas.png`],
  stdin: "piped",
  clearEnv: true,
}).spawn()
const writer = process.stdin.getWriter()
await writer.write(header)
await writer.write(pixels)
await writer.close()
if (!(await process.status).success) throw new Error("PNG export failed")
