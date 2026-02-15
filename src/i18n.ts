import { i18n } from "@lingui/core"
import { messages as enMessages } from "./locales/en/messages.po"

export type LocaleId = "en" | "ko"

export const defaultLocale: LocaleId = "en"
const LOCALE_STORAGE_KEY = "head-full-of-flowers.locale"

const loadedLocales = new Set<LocaleId>([defaultLocale])

i18n.load(defaultLocale, enMessages)
i18n.activate(defaultLocale)

const isLocaleId = (value: string): value is LocaleId => {
  return value === "en" || value === "ko"
}

const readStoredLocale = (): LocaleId => {
  if (typeof window === "undefined") {
    return defaultLocale
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored && isLocaleId(stored) ? stored : defaultLocale
  } catch {
    return defaultLocale
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

export const preferredLocale = readStoredLocale()

const localeLoaders: Record<Exclude<LocaleId, "en">, () => Promise<{ messages: Record<string, unknown> }>> = {
  ko: () => import("./locales/ko/messages.po"),
}

export const activateLocale = async (locale: LocaleId) => {
  if (locale !== "en" && !loadedLocales.has(locale)) {
    const { messages } = await localeLoaders[locale]()
    i18n.load(locale, messages)
    loadedLocales.add(locale)
  }

  i18n.activate(locale)
  writeStoredLocale(locale)
}

if (preferredLocale !== defaultLocale) {
  void activateLocale(preferredLocale)
}

export { i18n }
