interface SfxCredit {
  label: string
  title: string
  creator: string
  id: string
  license: "CC0" | "CC BY 4.0"
  asset: string
}

const creditSourcePaths = ["src/game/weapon-config.ts", "src/game/audio.ts"]
const readmePath = "README.md"
const hudPath = "src/game/hud-panels.tsx"
const readmeStartMarker = "<!-- SFX_CREDITS_START -->"
const readmeEndMarker = "<!-- SFX_CREDITS_END -->"
const hudStartMarker = "{/* SFX_CREDITS_START */}"
const hudEndMarker = "{/* SFX_CREDITS_END */}"
const sfxImportPattern =
  /^\s*import\s+[^\s]+\s+from\s+(?<quote>["'])(?<asset>\.\.\/assets\/sfx\/[^"'\n]+)\k<quote>(?<tail>.*)$/gm
const creditMarkerPattern = /\/\/ @sfx-credit/g
const inlineCreditMarkerPattern = /^\s*;?\s*\/\/ @sfx-credit (?<credit>{.+})\s*$/

type AssertSfxCredit = (value: unknown, sourcePath: string) => asserts value is SfxCredit

const assertSfxCredit: AssertSfxCredit = (value, sourcePath) => {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid SFX credit marker in ${sourcePath}`)
  }

  const credit = value as Record<string, unknown>
  const fields = ["label", "title", "creator", "id", "license", "asset"] as const
  if (fields.some((field) => typeof credit[field] !== "string")) {
    throw new Error(`SFX credit marker in ${sourcePath} must contain string ${fields.join(", ")} fields`)
  }

  if (fields.some((field) => (credit[field] as string).trim().length === 0 || /[\r\n]/.test(credit[field] as string))) {
    throw new Error(`SFX credit marker fields in ${sourcePath} must be non-empty and single-line`)
  }

  if (credit.license !== "CC0" && credit.license !== "CC BY 4.0") {
    throw new Error(`Unsupported SFX credit license in ${sourcePath}: ${credit.license}`)
  }

  if (typeof credit.id !== "string" || !/^\d+$/.test(credit.id)) {
    throw new Error(`SFX credit ID in ${sourcePath} must be numeric: ${credit.id}`)
  }
}

export const parseSfxCredits = (source: string, sourcePath = "source.ts"): SfxCredit[] => {
  const credits: SfxCredit[] = []

  for (const match of source.matchAll(sfxImportPattern)) {
    const asset = match.groups?.asset
    const markerMatch = match.groups?.tail.match(inlineCreditMarkerPattern)
    if (!asset || !markerMatch?.groups?.credit) {
      throw new Error(`Missing SFX credit marker for ${asset} in ${sourcePath}`)
    }

    const credit = JSON.parse(markerMatch.groups.credit)
    assertSfxCredit(credit, sourcePath)

    if (!asset.endsWith(`/assets/sfx/${credit.asset}`)) {
      throw new Error(`SFX credit marker in ${sourcePath} does not match its imported asset`)
    }

    credits.push(credit)
  }

  if (credits.length !== [...source.matchAll(creditMarkerPattern)].length) {
    throw new Error(`Each SFX credit marker in ${sourcePath} must follow an SFX import`)
  }

  return credits
}

const licenseUrlFor = (license: SfxCredit["license"]) =>
  license === "CC0"
    ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : "https://creativecommons.org/licenses/by/4.0/"

const escapeMarkdownText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
const escapeJsxText = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("{", "&#123;").replaceAll(
    "}",
    "&#125;",
  )

export const renderReadmeSfxCredits = (credits: SfxCredit[]) =>
  credits.map((credit) =>
    `- ${escapeMarkdownText(credit.label)}: [${escapeMarkdownText(credit.title)} by ${
      escapeMarkdownText(credit.creator)
    }](https://freesound.org/s/${credit.id}/) - [${credit.license}${credit.license === "CC0" ? " 1.0" : ""}](${
      licenseUrlFor(credit.license)
    })`
  ).join("\n")

export const renderHudSfxCredits = (credits: SfxCredit[]) =>
  credits.map((credit) =>
    `              <li>
                <a
                  href="https://freesound.org/people/${encodeURIComponent(credit.creator)}/sounds/${credit.id}/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  ${escapeJsxText(credit.label)} - ${escapeJsxText(credit.creator)} #${credit.id} (${credit.license})
                </a>
              </li>`
  ).join("\n")

export const replaceGeneratedRegion = (source: string, startMarker: string, endMarker: string, content: string) => {
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker)

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error(`Missing or invalid generated region: ${startMarker} ... ${endMarker}`)
  }

  if (
    source.indexOf(startMarker, startIndex + startMarker.length) >= 0 ||
    source.indexOf(endMarker, endIndex + endMarker.length) >= 0
  ) {
    throw new Error(`Generated region markers must be unique: ${startMarker} ... ${endMarker}`)
  }

  const contentStart = startIndex + startMarker.length
  const indentation = source.slice(source.lastIndexOf("\n", startIndex) + 1, startIndex)
  return `${source.slice(0, contentStart)}\n${content}\n${indentation}${source.slice(endIndex)}`
}

export const generateSfxCreditUpdates = async () => {
  const credits =
    (await Promise.all(creditSourcePaths.map(async (path) => parseSfxCredits(await Deno.readTextFile(path), path))))
      .flat()

  if (credits.length === 0) {
    throw new Error("No SFX credit markers found")
  }

  const duplicateIds = credits.map((credit) => credit.id).filter((id, index, ids) => ids.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate SFX credit IDs: ${[...new Set(duplicateIds)].join(", ")}`)
  }

  return [
    {
      path: readmePath,
      content: replaceGeneratedRegion(
        await Deno.readTextFile(readmePath),
        readmeStartMarker,
        readmeEndMarker,
        `\n${renderReadmeSfxCredits(credits)}\n`,
      ),
    },
    {
      path: hudPath,
      content: replaceGeneratedRegion(
        await Deno.readTextFile(hudPath),
        hudStartMarker,
        hudEndMarker,
        renderHudSfxCredits(credits),
      ),
    },
  ]
}

export const updateSfxCredits = async ({ check = false } = {}) => {
  const updates = await generateSfxCreditUpdates()
  const staleUpdates: typeof updates = []
  for (const update of updates) {
    if (await Deno.readTextFile(update.path) !== update.content) {
      staleUpdates.push(update)
    }
  }

  if (check) {
    if (staleUpdates.length > 0) {
      throw new Error(`SFX credits are out of date: ${staleUpdates.map(({ path }) => path).join(", ")}`)
    }
    return
  }

  for (const { path, content } of updates) {
    if (await Deno.readTextFile(path) !== content) {
      await Deno.writeTextFile(path, content)
      console.log(`Updated ${path}`)
    }
  }
}

if (import.meta.main) {
  await updateSfxCredits({ check: Deno.args.includes("--check") })
}
