import { i18n } from "@lingui/core"
import { messages as enMessages } from "./locales/en/messages.po"
import { messages as koMessages } from "./locales/ko/messages.po"

export type LocaleId = "en" | "ko"

export const defaultLocale: LocaleId = "en"
const LOCALE_STORAGE_KEY = "head-full-of-flowers.locale"

const loadedLocales = new Set<LocaleId>(["en", "ko"])

i18n.load({
  en: enMessages,
  ko: koMessages,
})
i18n.activate(defaultLocale)

const isLocaleId = (value: string): value is LocaleId => {
  return value === "en" || value === "ko"
}

const detectNavigatorLocale = (): LocaleId => {
  if (typeof window === "undefined") {
    return defaultLocale
  }

  const language = window.navigator.language.toLowerCase()
  if (language.startsWith("ko")) {
    return "ko"
  }

  return defaultLocale
}

const readStoredLocale = (): LocaleId | null => {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored && isLocaleId(stored) ? stored : null
  } catch {
    return null
  }
}

const writeStoredLocale = (locale: LocaleId) => {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // noop
  }
}

const storedLocale = readStoredLocale()
export const preferredLocale = storedLocale ?? detectNavigatorLocale()

if (!storedLocale) {
  writeStoredLocale(preferredLocale)
}

export const activateLocale = (locale: LocaleId) => {
  if (!loadedLocales.has(locale)) {
    return
  }
  i18n.activate(locale)
  writeStoredLocale(locale)
}

if (preferredLocale !== defaultLocale) {
  activateLocale(preferredLocale)
}

export { i18n }
