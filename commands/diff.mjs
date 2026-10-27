// diff: compares two sets of screenshots (for example `vt shoot` before and after a change) and
// shows what moved. Exits with 1 when anything changed, so it can serve as a check.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { launchBrowser } from '../lib/browser.mjs'
import { comparePngs } from '../lib/compare.mjs'
import { outputFolder, slug } from '../lib/files.mjs'
import { makeSheet } from '../lib/sheet.mjs'

export const help = `vt diff <before> <after> [options]

Compares two PNG files, or every PNG in two folders matched by file name (such as two runs of
vt shoot with the same options), writes a diff image for each pair that differs (changed pixels in
red), and a contact sheet of before, after, and diff for each. Exits with 1 when anything differs.

  --threshold <0-1> how different a pixel must be to count (default: 0.1)
  --tolerance <%>   ignore pairs where at most this share of pixels changed (default: 0)
  --out <folder>    output folder (default: a new folder under the system temp folder)
  --cell <px>       widest image in the contact sheet (default: 420)`

export const options = {
  threshold: { type: 'string', default: '0.1' },
  tolerance: { type: 'string', default: '0' },
  out: { type: 'string' },
  cell: { type: 'string', default: '420' },
}

function pngsIn(folder) {
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.toLowerCase().endsWith('.png') && name !== 'sheet.png') found.push(relative(folder, full))
    }
  }
  walk(folder)
  return found.sort()
}

export async function run(before, values, after) {
  if (!before || !after) throw new Error('vt diff needs two files or folders: <before> <after>')
  const a = resolve(before)
  const b = resolve(after)
  for (const path of [a, b]) if (!existsSync(path)) throw new Error(`Not found: ${path}`)
  const pairs = statSync(a).isDirectory()
    ? [...new Set([...pngsIn(a), ...pngsIn(b)])].map((name) => ({ name, a: join(a, name), b: join(b, name) }))
    : [{ name: basename(b), a, b }]
  const folder = outputFolder(values.out, 'diff')
  const tolerance = Number(values.tolerance) / 100
  const changed = []
  for (const pair of pairs) {
    if (!existsSync(pair.a) || !existsSync(pair.b)) {
      console.log(`${existsSync(pair.a) ? 'gone ' : 'new  '} ${pair.name}`)
      changed.push({ ...pair, missing: true })
      continue
    }
    const diffFile = join(folder, `${slug(pair.name)}__diff.png`)
    const result = comparePngs(pair.a, pair.b, { threshold: Number(values.threshold), diffFile })
    const differs = result.sizeChanged || result.ratio > tolerance
    console.log(`${differs ? 'diff ' : 'same '} ${pair.name}${result.changed ? `  ${(result.ratio * 100).toFixed(2)}% of pixels` : ''}${result.sizeChanged ? `  size ${result.sizes.join(' -> ')}` : ''}`)
    if (differs) changed.push({ ...pair, diffFile })
  }
  const shown = changed.filter((pair) => !pair.missing)
  if (shown.length) {
    const browser = await launchBrowser()
    try {
      const items = shown.flatMap((pair) => [
        { file: pair.a, label: `before · ${pair.name}` },
        { file: pair.b, label: 'after' },
        { file: pair.diffFile, label: 'changed pixels' },
      ])
      console.log(`sheet: ${await makeSheet(browser, items, { out: join(folder, 'sheet.png'), cols: 3, cell: Number(values.cell), title: `${before} -> ${after}` })}`)
    } finally {
      await browser.close()
    }
  }
  console.log(changed.length ? `${changed.length} of ${pairs.length} differ.` : `All ${pairs.length} match.`)
  return changed.length ? 1 : 0
}
