# Agent Mandatory Rules

- Always use `t` macro from `"@lingui/core/macro"` for UI text, then run `deno task i18n:extract` and update generated `.po` translations (at minimum `src/locales/ko/messages.po`) before finishing.
- Make atomic commit after finishing requested prompt. If changes are requested, make fixup commit.
