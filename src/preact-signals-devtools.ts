declare global {
  interface Window {
    __PREACT_SIGNALS_DEVTOOLS__?: unknown
  }
}

if (import.meta.env.DEV && typeof globalThis.window !== "undefined") {
  globalThis.window.__PREACT_SIGNALS_DEVTOOLS__ = false
}

export {}
