---
name: i18n-extract
description: Extract Lingui messages with deno task i18n:extract
---

## What I do

- Run `deno task i18n:extract` from the project root.
- Report which locale catalog files changed.

## When to use me

- After adding or changing translatable strings wrapped with `t` macros.
- Before committing UI text changes.

## Steps

1. Confirm the repository root contains `deno.json` and `lingui.config.ts`.
2. Run `deno task i18n:extract`.
3. Review `src/locales/en/messages.po` and `src/locales/ko/messages.po` for new `msgid` entries.
4. Fill Korean translations for newly added strings if they are blank.
