// sheet: lays out any images in one labeled grid, saved as one PNG.

import { basename, join } from 'node:path'
import { launchBrowser } from '../lib/browser.mjs'
import { outputFolder } from '../lib/files.mjs'
import { makeSheet } from '../lib/sheet.mjs'

export const help = `vt sheet <image> [<image> ...] [options]

Lays out the images in a grid with their file names as labels and saves it as one PNG.

  --cols <n>        images per row (default: 4)
  --cell <px>       widest image (default: 420)
  --title <text>    a heading above the grid
  --out <file>      the PNG to write (default: sheet.png in a new folder under the system temp folder)`

export const options = {
  cols: { type: 'string', default: '4' },
  cell: { type: 'string', default: '420' },
  title: { type: 'string', default: '' },
  out: { type: 'string' },
}

export async function run(first, values, ...rest) {
  const files = [first, ...rest].filter(Boolean)
  if (!files.length) throw new Error('vt sheet needs at least one image')
  const out = values.out ?? join(outputFolder(undefined, 'sheet'), 'sheet.png')
  const browser = await launchBrowser()
  try {
    const items = files.map((file) => ({ file, label: basename(file) }))
    console.log(`sheet: ${await makeSheet(browser, items, { out, cols: Number(values.cols), cell: Number(values.cell), title: values.title })}`)
  } finally {
    await browser.close()
  }
}
