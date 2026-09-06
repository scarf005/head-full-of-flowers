// deno-fmt-ignore-file
// Run against the open app with: playwright-cli run-code "$(cat tests/menu.playwright.js)"
async (page) => {
  page.setDefaultTimeout(20000)
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const navigation = page.locator(".menu-navigation")
  const section = (id) => navigation.locator(`[aria-controls="menu-${id}-column"]`)
  const open = async (id) => { if (await section(id).getAttribute("aria-expanded") !== "true") await section(id).click() }
  const box = (selector) => page.locator(selector).boundingBox()
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 900 })
  await navigation.waitFor()
  await page.evaluate(async () => { await document.fonts.load('48px "NeoDunggeunmo"') })

  await open("options")
  await page.locator(".option-language-button").first().click()
  const english = await box(".menu-navigation")
  const englishOptions = await box("#menu-options-column")
  await page.locator(".option-language-button").nth(1).click()
  assert(JSON.stringify(english) === JSON.stringify(await box(".menu-navigation")), "Language switch keeps main menu bounds fixed")
  assert(JSON.stringify(englishOptions) === JSON.stringify(await box("#menu-options-column")), "Language switch keeps settings bounds fixed")
  assert(await page.locator("#menu-options-column p, #menu-options-column h2").count() === 0, "Settings contains no duplicate heading or help")
  await open("help")
  assert(await page.locator("#menu-help-column p").count() === 2, "Rules and controls have their own Help row")
  assert(await page.locator("#menu-options-column").count() === 0, "Help is separate from settings")

  const initialNav = await box(".menu-navigation")
  await open("game")
  assert(await page.locator(".mode-card[aria-pressed=\"true\"]").first().textContent().then(text => text.includes("개인전")), "Free for All is selected by default")
  assert(await page.locator(".menu-start-easy").getAttribute("aria-pressed") === "true", "Easy mode is selected by default")
  assert(await page.locator(".menu-difficulty-column, .menu-player-column").count() === 2, "New game opens all four columns at once")
  const columns = await Promise.all([".menu-player-column", ".menu-difficulty-column", ".menu-choice-column", ".menu-navigation"].map(box))
  for (let index = 0; index < 3; index++) {
    assert(columns[index].width === 200, "Choice columns are 200px wide")
    assert(Math.abs(columns[index + 1].x - columns[index].x - columns[index].width - 16) < 1, "Column gaps are 16px")
    assert(Math.abs(columns[index].y - columns[index + 1].y) < 1, "Four columns stay on one row")
  }
  assert(JSON.stringify(initialNav) === JSON.stringify(await box(".menu-navigation")), "Opening columns does not move the main menu")
  assert(await page.locator(".menu-columns").evaluate(el => el.scrollHeight <= el.clientHeight), "No unnecessary vertical scrollbar")
  assert(await page.locator(".menu-columns h2").count() === 0, "No duplicate column titles")
  assert(await navigation.locator("button").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 54), "Rightmost Korean menu retains its large type")
  assert(await page.locator(".menu-columns button, .mode-card-detail").evaluateAll(els => els.every(el => getComputedStyle(el).color === "rgb(255, 255, 255)" && Number(getComputedStyle(el).fontWeight) >= 800)), "All choices use bold white text")

  const slider = page.locator('.menu-player-column input[type="range"]')
  await slider.focus()
  await page.keyboard.press("Home")
  const sliderBox = await slider.boundingBox()
  await page.mouse.move(sliderBox.x + 14, sliderBox.y + sliderBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sliderBox.x + sliderBox.width - 14, sliderBox.y + sliderBox.height / 2, { steps: 6 })
  await page.mouse.up()
  assert(await slider.inputValue() === await slider.getAttribute("max"), "White rectangular thumb can be dragged to maximum players")
  await page.keyboard.press("Home")
  assert(await slider.inputValue() === await slider.getAttribute("min"), "Slider keeps keyboard controls")

  for (const [width, height] of [[839, 782], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height })
    assert(await page.locator(".menu-panel").evaluate(el => el.scrollWidth <= el.clientWidth), `No outer overflow at ${width}`)
    for (const selector of [".mode-card", ".menu-start-hard", ".menu-confirm-start", ".menu-load-replay"]) {
      await page.locator(selector).first().scrollIntoViewIfNeeded()
      await page.locator(selector).first().click({ trial: true })
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const difficulty of ["easy", "hard"]) {
    await open("game")
    await page.locator(".mode-card").first().click()
    await page.locator(`.menu-start-${difficulty}`).click()
    assert(await page.locator(".menu-player-column").isVisible(), "Difficulty selection does not start before player count")
    await page.locator(".menu-confirm-start").click()
    await page.locator(".menu-panel").waitFor({ state: "detached" })
    await page.keyboard.press("Escape")
    await page.locator(".pause-panel").waitFor()
    assert(await page.locator(".pause-panel button").evaluateAll(els => els.every(el => getComputedStyle(el).color === "rgb(255, 255, 255)" && Number(getComputedStyle(el).fontWeight) >= 800)), "Pause actions match the white bold style")
    await page.locator(".pause-resume-button").click()
    await page.locator(".pause-panel").waitFor({ state: "detached" })
    await page.keyboard.press("Escape")
    await page.locator(".pause-main-menu-button").click()
    await navigation.waitFor()
  }
  const canvas = page.locator(".arena-canvas")
  const before = await canvas.screenshot({ style: ".hud { visibility: hidden !important; }" })
  await page.mouse.move(30, 30)
  await page.keyboard.press("w")
  const after = await canvas.screenshot({ style: ".hud { visibility: hidden !important; }" })
  assert(before.equals(after), "Menu map remains static")
}
