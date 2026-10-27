// shoot: screenshots of pages or parts of pages at several widths and color themes, plus one
// contact sheet that shows them all side by side.

import { join } from 'node:path'
import { launchBrowser, newContext, playToEnd, settle } from '../lib/browser.mjs'
import { outputFolder, slug } from '../lib/files.mjs'
import { makeSheet } from '../lib/sheet.mjs'
import { openTarget } from '../lib/site.mjs'

export const help = `vt shoot <target> [options]

Screenshots pages, or the elements matching a selector, at each width and theme, and makes a
contact sheet (sheet.png) of all of them. <target> is a URL, a built site's folder (served on a
local port), or an HTML or SVG file.

  --path <p>        page path to open; repeat for several pages (default: the target itself)
  --widths <list>   viewport widths in CSS pixels (default: 375,1280)
  --themes <list>   light, dark, or both (default: light)
  --selector <css>  capture matching elements instead of the page
  --all             with --selector: every match, not only the first
  --pad <px>        space kept around an element (default: 12)
  --viewport        capture only the first screen instead of the full page
  --motion <mode>   reduce (default: the page as visitors who turn motion off see it), end (motion on,
                    scrolled through, every animation jumped to its end), or on (as it is after load)
  --height <px>     viewport height (default: 900)
  --scale <n>       device pixel ratio (default: 1; use 2 for crisp text)
  --mobile          emulate a touch phone (mobile user agent and viewport rules)
  --hover <css>     hover this element before each capture
  --wait <ms>       extra wait after the page loads (default: 0)
  --lang <code>     browser language (default: en-US)
  --allow-external  let the page load from other origins (blocked by default: no analytics hits)
  --out <folder>    output folder (default: a new folder under the system temp folder)
  --cols <n>        contact sheet columns (default: one per width and theme)
  --cell <px>       widest image in the contact sheet (default: 420)
  --no-sheet        skip the contact sheet`

export const options = {
  path: { type: 'string', multiple: true },
  widths: { type: 'string', default: '375,1280' },
  themes: { type: 'string', default: 'light' },
  selector: { type: 'string' },
  all: { type: 'boolean', default: false },
  pad: { type: 'string', default: '12' },
  viewport: { type: 'boolean', default: false },
  motion: { type: 'string', default: 'reduce' },
  height: { type: 'string', default: '900' },
  scale: { type: 'string', default: '1' },
  mobile: { type: 'boolean', default: false },
  hover: { type: 'string' },
  wait: { type: 'string', default: '0' },
  lang: { type: 'string', default: 'en-US' },
  'allow-external': { type: 'boolean', default: false },
  out: { type: 'string' },
  cols: { type: 'string' },
  cell: { type: 'string', default: '420' },
  'no-sheet': { type: 'boolean', default: false },
}

const list = (text) => text.split(',').map((item) => item.trim()).filter(Boolean)

// Page coordinates of each matching element, grown by `pad` and kept inside the page.
async function elementClips(page, selector, all, pad) {
  return page.evaluate(
    ({ selector, all, pad }) => {
      const elements = [...document.querySelectorAll(selector)].slice(0, all ? undefined : 1)
      const pageWidth = document.documentElement.scrollWidth
      const pageHeight = document.documentElement.scrollHeight
      return elements
        .map((element) => {
          const rect = element.getBoundingClientRect()
          if (!rect.width || !rect.height) return null
          const x = Math.max(0, rect.left + scrollX - pad)
          const y = Math.max(0, rect.top + scrollY - pad)
          return {
            x,
            y,
            width: Math.min(pageWidth, rect.right + scrollX + pad) - x,
            height: Math.min(pageHeight, rect.bottom + scrollY + pad) - y,
          }
        })
        .filter(Boolean)
    },
    { selector, all, pad },
  )
}

export async function run(target, values) {
  const widths = list(values.widths).map(Number)
  const themes = list(values.themes)
  for (const theme of themes) if (!['light', 'dark'].includes(theme)) throw new Error(`Unknown theme: ${theme}`)
  if (!['reduce', 'end', 'on'].includes(values.motion)) throw new Error(`Unknown --motion: ${values.motion}`)
  const pad = Number(values.pad)
  const height = Number(values.height)
  const folder = outputFolder(values.out, 'shoot')
  const site = await openTarget(target, values.path ?? [])
  const browser = await launchBrowser()
  const shots = []
  try {
    for (const theme of themes) {
      const context = await newContext(browser, {
        theme,
        motion: values.motion,
        scale: Number(values.scale),
        width: widths[0],
        height,
        locale: values.lang,
        origin: site.origin,
        allowExternal: values['allow-external'],
        mobile: values.mobile,
      })
      for (const path of site.paths) {
        for (const width of widths) {
          const page = await context.newPage()
          await page.setViewportSize({ width, height })
          const response = await page.goto(site.origin + path, { waitUntil: 'load' })
          if (response && !response.ok()) console.warn(`warning: ${path} answered ${response.status()}`)
          await settle(page)
          if (values.motion === 'end') await playToEnd(page)
          if (Number(values.wait)) await page.waitForTimeout(Number(values.wait))
          if (values.hover) await page.hover(values.hover)
          const base = `${slug(path)}__${width}__${theme}`
          if (values.selector) {
            const clips = await elementClips(page, values.selector, values.all, pad)
            if (!clips.length) console.warn(`warning: nothing visible matches ${values.selector} on ${path} at ${width}px`)
            for (const [i, clip] of clips.entries()) {
              const file = join(folder, `${base}${clips.length > 1 ? `__${i + 1}` : ''}.png`)
              await page.screenshot({ path: file, clip, fullPage: true })
              shots.push({ file, label: `${path} · ${width}px · ${theme}${clips.length > 1 ? ` · #${i + 1}` : ''}` })
            }
          } else {
            const file = join(folder, `${base}.png`)
            await page.screenshot({ path: file, fullPage: !values.viewport })
            shots.push({ file, label: `${path} · ${width}px · ${theme}` })
          }
          await page.close()
        }
      }
      await context.close()
    }
    for (const shot of shots) console.log(shot.file)
    if (shots.length > 1 && !values['no-sheet']) {
      const cols = Number(values.cols ?? Math.min(widths.length * themes.length, 6))
      const sheet = await makeSheet(browser, shots, { out: join(folder, 'sheet.png'), cols, cell: Number(values.cell), title: `${target} · motion ${values.motion}` })
      console.log(`sheet: ${sheet}`)
    }
  } finally {
    await browser.close()
    await site.close()
  }
  return shots
}
