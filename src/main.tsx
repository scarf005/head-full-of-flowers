import "./index.css"
import { render } from "preact"
import { I18nProvider } from "@lingui/react"
import { App } from "./app.tsx"
import { i18n } from "./i18n.ts"

render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
  document.getElementById("app") as HTMLElement,
)
