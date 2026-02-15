import { defineConfig } from "@lingui/cli"

export default defineConfig({
  locales: ["en", "ko"],
  sourceLocale: "en",
  fallbackLocales: {
    default: "en",
  },
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
})
