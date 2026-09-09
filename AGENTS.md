# Agent Mandatory Rules

- Make atomic commit after finishing requested prompt. If changes are requested after the initial prompt, make fixup commit.
- Always use `t` macro from `"@lingui/core/macro"` for UI text, then run `deno task i18n:extract` and update generated `.po` translations (at minimum `src/locales/ko/messages.po`) before finishing.
- NEVER take existing code into account when making technical decisions. the WHOLE code is vibe coded.
- Existing hand-drawn sprites are the visual reference for new game assets. Match their pixel scale, palette, outlines, shading, and proportions in the actual game view before expanding an asset set.
- NEVER use `new URL(..., import.meta.url)` for asset imports; use static asset imports instead.
