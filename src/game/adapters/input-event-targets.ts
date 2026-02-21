const eventTargetsSelector = (event: PointerEvent, selector: string) => {
  if (event.target instanceof Element && Boolean(event.target.closest(selector))) {
    return true
  }

  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  for (const node of path) {
    if (node instanceof Element && Boolean(node.closest(selector))) {
      return true
    }
  }

  return false
}

const eventWithinButtonBounds = (event: PointerEvent, selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector)
  if (!button) {
    return false
  }

  const bounds = button.getBoundingClientRect()
  return event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
}

export const isMobileControlTarget = (event: PointerEvent) => {
  return eventTargetsSelector(event, ".mobile-controls")
}

export const isRematchButtonTarget = (event: PointerEvent) => {
  return eventTargetsSelector(event, ".match-result-rematch") ||
    eventWithinButtonBounds(event, ".match-result-rematch")
}

export const isPausePanelTarget = (event: PointerEvent) => {
  return eventTargetsSelector(event, ".pause-panel")
}

export const isPauseResumeTarget = (event: PointerEvent) => {
  return eventTargetsSelector(event, ".pause-resume-button")
}

export const isPauseMainMenuTarget = (event: PointerEvent) => {
  return eventTargetsSelector(event, ".pause-main-menu-button")
}
