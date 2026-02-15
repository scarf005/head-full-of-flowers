import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro"
import { lingui } from "@lingui/vite-plugin"

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    deno(),
    lingui(),
    preact({
      babel: {
        plugins: [linguiMacroPlugin],
      },
    }),
  ],
})
