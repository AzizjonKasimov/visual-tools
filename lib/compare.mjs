// Pixel comparison of two PNG files with pixelmatch. Images of different sizes are compared on a
// canvas big enough for both, so the extra area counts as changed.

import { readFileSync, writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import pngjs from 'pngjs'

const { PNG } = pngjs

function padTo(image, width, height) {
  if (image.width === width && image.height === height) return image
  const padded = new PNG({ width, height, fill: true })
  padded.data.fill(0)
  PNG.bitblt(image, padded, 0, 0, image.width, image.height, 0, 0)
  return padded
}

// Returns { changed, total, ratio, sizeChanged } and writes a diff image when `diffFile` is given:
// unchanged pixels faded, changed ones red.
export function comparePngs(fileA, fileB, { threshold = 0.1, diffFile } = {}) {
  const a = PNG.sync.read(readFileSync(fileA))
  const b = PNG.sync.read(readFileSync(fileB))
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  const diff = new PNG({ width, height })
  const changed = pixelmatch(padTo(a, width, height).data, padTo(b, width, height).data, diff.data, width, height, {
    threshold,
    alpha: 0.2,
    includeAA: false,
  })
  if (diffFile) writeFileSync(diffFile, PNG.sync.write(diff))
  const total = width * height
  return { changed, total, ratio: changed / total, sizeChanged: a.width !== b.width || a.height !== b.height, sizes: [`${a.width}x${a.height}`, `${b.width}x${b.height}`] }
}
