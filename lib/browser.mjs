// Starts the Chrome or Edge already installed on this PC through playwright-core, so nothing is
// downloaded. Every page stays offline by default: requests to other origins (analytics, fonts,
// ads) are blocked, so a screenshot never counts as a visit on a live site's analytics.

import { chromium } from 'playwright-core'

export async function launchBrowser() {
  const errors = []
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel })
    } catch (error) {
      errors.push(`${channel}: ${error.message.split('\n')[0]}`)
    }
  }
  throw new Error(`visual-tools needs Google Chrome or Microsoft Edge.\n${errors.join('\n')}`)
}

// A browser context with one color scheme and motion setting. `origin` is the site being
// captured; anything else is blocked unless `allowExternal` is set.
export async function newContext(browser, { theme = 'light', motion = 'reduce', scale = 1, width = 1280, height = 800, locale = 'en-US', origin, allowExternal = false, mobile = false }) {
  const context = await browser.newContext({
    colorScheme: theme,
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
    deviceScaleFactor: scale,
    viewport: { width, height },
    locale,
    isMobile: mobile,
    hasTouch: mobile,
  })
  if (origin && !allowExternal) {
    await context.route((url) => url.origin !== origin && url.protocol !== 'data:', (route) => route.abort())
  }
  return context
}

// Runs in the page: loads lazy images now and waits for fonts, so the capture shows the final page.
export async function settle(page) {
  await page.evaluate(async () => {
    const images = [...document.images]
    for (const image of images) image.loading = 'eager'
    await Promise.all(images.map((image) => image.decode().catch(() => {})))
    await document.fonts.ready
  })
}

// Runs in the page with motion on: scrolls down half a screen at a time so every scroll-triggered
// animation starts, then jumps every finite animation to its end and returns to the top.
export async function playToEnd(page) {
  await page.evaluate(async () => {
    const frames = (count) =>
      new Promise((done) => {
        const next = () => (count-- ? requestAnimationFrame(next) : done())
        next()
      })
    const bottom = () => document.documentElement.scrollHeight - innerHeight
    for (let y = 0; ; y = Math.min(y + innerHeight / 2, bottom())) {
      scrollTo({ top: y, behavior: 'instant' })
      await frames(3)
      if (y >= bottom()) break
    }
    for (const animation of document.getAnimations()) {
      try {
        animation.finish()
      } catch {
        // Infinite loops cannot finish; they stay as they are.
      }
    }
    scrollTo({ top: 0, behavior: 'instant' })
    await frames(2)
  })
}
