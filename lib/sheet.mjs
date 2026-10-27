// Contact sheets: many images laid out in one labeled grid, saved as one PNG, so an agent (or a
// person) can review every width, theme, or animation frame in a single look. The grid is drawn by
// the browser itself, so this needs no image library.

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

// items: [{ file, label }]. cols: images per row. cell: the widest an image may be, in CSS pixels.
export async function makeSheet(browser, items, { out, cols = 4, cell = 420, title = '' }) {
  const figures = items
    .map(({ file, label }) => {
      const data = readFileSync(file).toString('base64')
      const type = mime[extname(file).toLowerCase()] ?? 'image/png'
      return `<figure><figcaption>${escape(label)}</figcaption><img src="data:${type};base64,${data}" alt=""></figure>`
    })
    .join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #dfe2e6; color: #1d2126; font: 13px/1.35 "Segoe UI", system-ui, sans-serif; }
    h1 { margin: 12px 14px 0; font-size: 15px; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, max-content); gap: 12px; padding: 12px 14px 14px; align-items: start; }
    figure { margin: 0; padding: 6px; border: 1px solid #b9bfc7; border-radius: 6px; background: #fff; }
    figcaption { margin: 0 2px 6px; font-weight: 600; }
    img { display: block; max-width: ${cell}px; height: auto; outline: 1px solid #e3e6ea; }
  </style>${title ? `<h1>${escape(title)}</h1>` : ''}<div class="grid">${figures}</div>`
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))))
  const size = await page.evaluate(() => ({ width: Math.ceil(document.documentElement.scrollWidth), height: Math.ceil(document.documentElement.scrollHeight) }))
  await page.setViewportSize({ width: size.width, height: Math.min(size.height, 16000) })
  await page.screenshot({ path: out, fullPage: true })
  await page.close()
  return out
}
