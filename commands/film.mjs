// film: a filmstrip of an element's animations. Instead of recording in real time, it pauses every
// CSS and Web Animations API animation inside the element and seeks them to chosen moments, so each
// frame shows exactly that moment, the same on every run. Optional GIF or MP4 through ffmpeg.

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchBrowser, newContext, settle } from '../lib/browser.mjs'
import { comparePngs } from '../lib/compare.mjs'
import { outputFolder } from '../lib/files.mjs'
import { makeSheet } from '../lib/sheet.mjs'
import { openTarget } from '../lib/site.mjs'

export const help = `vt film <target> --selector <css> [options]

Captures frames of the animations inside one element at chosen moments and lays them out in a
contact sheet (sheet.png). Works with CSS animations and the Web Animations API, including ones
that start when the element scrolls into view; not with canvas or requestAnimationFrame drawing.

  --selector <css>  the element to film (required; the first match)
  --path <p>        page path to open (default: the target itself)
  --frames <n>      frames for the contact sheet, evenly spaced from 0 to the end (default: 10)
  --times <list>    exact moments in ms instead, e.g. 0,300,600,1500
  --duration <ms>   where the last frame is (default: when the last animation ends; one loop for
                    endless ones)
  --width <px>      viewport width (default: 1280)
  --height <px>     minimum viewport height; it grows to fit the element (default: 900)
  --theme <t>       light or dark (default: light)
  --scale <n>       device pixel ratio (default: 1)
  --pad <px>        space kept around the element (default: 12)
  --mobile          emulate a touch phone
  --hover <css>     hover this element first, to film hover loops (pass the --selector itself to
                    hover the filmed element)
  --check-end       compare the last frame with the page as reduced-motion visitors see it, and
                    report the share of pixels that differ (animations should end in the still layout)
  --gif, --mp4      also write film.gif or film.mp4 (needs ffmpeg on PATH)
  --fps <n>         frames per second for --gif and --mp4 (default: 20)
  --out <folder>    output folder (default: a new folder under the system temp folder)
  --cols <n>        contact sheet columns (default: 5)
  --cell <px>       widest frame in the contact sheet (default: 360)
  --allow-external  let the page load from other origins (blocked by default)`

export const options = {
  selector: { type: 'string' },
  path: { type: 'string' },
  frames: { type: 'string', default: '10' },
  times: { type: 'string' },
  duration: { type: 'string' },
  width: { type: 'string', default: '1280' },
  height: { type: 'string', default: '900' },
  theme: { type: 'string', default: 'light' },
  scale: { type: 'string', default: '1' },
  pad: { type: 'string', default: '12' },
  mobile: { type: 'boolean', default: false },
  hover: { type: 'string' },
  'check-end': { type: 'boolean', default: false },
  gif: { type: 'boolean', default: false },
  mp4: { type: 'boolean', default: false },
  fps: { type: 'string', default: '20' },
  out: { type: 'string' },
  cols: { type: 'string', default: '5' },
  cell: { type: 'string', default: '360' },
  'allow-external': { type: 'boolean', default: false },
}

const frames = (page, count = 2) =>
  page.evaluate(
    (count) =>
      new Promise((done) => {
        const next = () => (count-- ? requestAnimationFrame(next) : done())
        next()
      }),
    count,
  )

// Grows the viewport to fit the element (its layout size, ignoring transforms that an animation
// may be applying right now) and scrolls it to the middle of the screen.
async function frameElement(page, selector, { width, height, pad }) {
  const size = await page.evaluate((selector) => {
    const element = document.querySelector(selector)
    return element ? Math.max(element.offsetHeight || 0, element.getBoundingClientRect().height) : null
  }, selector)
  if (size === null) throw new Error(`Nothing matches ${selector}`)
  await page.setViewportSize({ width, height: Math.min(4000, Math.max(height, Math.ceil(size + 2 * pad + 80))) })
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center', behavior: 'instant' }), selector)
}

// The element's box on screen, grown by `pad`. Measure it with the animations at their end, so
// an element that scales or slides in is not measured mid-way.
function clipOf(page, selector, pad) {
  return page.evaluate(
    ({ selector, pad }) => {
      const rect = document.querySelector(selector).getBoundingClientRect()
      const x = Math.max(0, rect.left - pad)
      const y = Math.max(0, rect.top - pad)
      return { x, y, width: Math.min(innerWidth, rect.right + pad) - x, height: Math.min(innerHeight, rect.bottom + pad) - y }
    },
    { selector, pad },
  )
}

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

function encode(folder, fps, kind) {
  const input = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(folder, 'frames', 'frame-%04d.png')]
  const out = join(folder, `film.${kind}`)
  const filter =
    kind === 'gif'
      ? ['-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4']
      : ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:color=white', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  const result = spawnSync('ffmpeg', [...input, ...filter, out], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`ffmpeg failed to write ${out}`)
  return out
}

export async function run(target, values) {
  if (!values.selector) throw new Error('vt film needs --selector')
  const width = Number(values.width)
  const height = Number(values.height)
  const pad = Number(values.pad)
  const video = values.gif || values.mp4
  if (video && !hasFfmpeg()) throw new Error('--gif and --mp4 need ffmpeg on PATH')
  const folder = outputFolder(values.out, 'film')
  const site = await openTarget(target, values.path ? [values.path] : [])
  const browser = await launchBrowser()
  const contextOptions = {
    theme: values.theme,
    scale: Number(values.scale),
    width,
    height,
    origin: site.origin,
    allowExternal: values['allow-external'],
    mobile: values.mobile,
  }
  try {
    const context = await newContext(browser, { ...contextOptions, motion: 'on' })
    const page = await context.newPage()
    await page.goto(site.origin + site.paths[0], { waitUntil: 'load' })
    await settle(page)
    await frameElement(page, values.selector, { width, height, pad })
    if (values.hover) await page.hover(values.hover)
    // Let scroll-triggered scripts see the element and start its animations, then freeze them.
    await frames(page, 3)
    const found = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      const inside = (animation) => {
        const target = animation.effect && animation.effect.target
        return target && (target === root || root.contains(target))
      }
      window.__vtAnimations = document.getAnimations().filter(inside)
      let end = 0
      for (const animation of window.__vtAnimations) {
        animation.pause()
        const timing = animation.effect.getComputedTiming()
        end = Math.max(end, Number.isFinite(timing.endTime) ? timing.endTime : (timing.delay || 0) + (timing.duration || 0))
      }
      return { count: window.__vtAnimations.length, end: Math.ceil(end) }
    }, values.selector)
    if (!found.count) console.warn(`warning: no animations inside ${values.selector}; the frames will all look the same`)
    const end = values.duration ? Number(values.duration) : found.end
    await page.evaluate((end) => {
      for (const animation of window.__vtAnimations) animation.currentTime = end
    }, found.end)
    const clip = await clipOf(page, values.selector, pad)
    const count = Math.max(2, Number(values.frames))
    let times = values.times
      ? values.times.split(',').map(Number)
      : Array.from({ length: count }, (_, i) => Math.round((end * i) / (count - 1)))
    if (video) {
      const fps = Number(values.fps)
      times = Array.from({ length: Math.floor((end / 1000) * fps) + 1 }, (_, i) => Math.round((i * 1000) / fps))
      mkdirSync(join(folder, 'frames'), { recursive: true })
    }
    const shots = []
    for (const [i, time] of times.entries()) {
      await page.evaluate((time) => {
        for (const animation of window.__vtAnimations) animation.currentTime = time
      }, time)
      const file = video ? join(folder, 'frames', `frame-${String(i).padStart(4, '0')}.png`) : join(folder, `t${String(time).padStart(5, '0')}ms.png`)
      await page.screenshot({ path: file, clip })
      shots.push({ file, label: `${time} ms` })
    }
    console.log(`${found.count} animations inside ${values.selector}; last one ends at ${found.end} ms`)
    await context.close()

    let sheetShots = shots
    if (video) {
      for (const kind of ['gif', 'mp4'].filter((kind) => values[kind])) console.log(`${kind}: ${encode(folder, values.fps, kind)}`)
      const picks = Math.min(12, shots.length)
      sheetShots = Array.from({ length: picks }, (_, i) => shots[Math.round((i * (shots.length - 1)) / (picks - 1))])
    } else {
      for (const shot of shots) console.log(shot.file)
    }

    if (values['check-end']) {
      const still = await newContext(browser, { ...contextOptions, motion: 'reduce' })
      const stillPage = await still.newPage()
      await stillPage.goto(site.origin + site.paths[0], { waitUntil: 'load' })
      await settle(stillPage)
      await frameElement(stillPage, values.selector, { width, height, pad })
      const stillClip = await clipOf(stillPage, values.selector, pad)
      const stillFile = join(folder, 'still.png')
      await stillPage.screenshot({ path: stillFile, clip: stillClip })
      await still.close()
      const last = shots.at(-1).file
      const result = comparePngs(last, stillFile, { diffFile: join(folder, 'end-vs-still.png') })
      const percent = (result.ratio * 100).toFixed(2)
      console.log(
        result.changed
          ? `check-end: the last frame differs from the still page in ${result.changed} pixels (${percent}%)${result.sizeChanged ? `, sizes ${result.sizes.join(' vs ')}` : ''}; see end-vs-still.png`
          : 'check-end: the last frame matches the still page',
      )
      sheetShots = [...sheetShots, { file: stillFile, label: 'still (reduced motion)' }]
    }

    const sheet = await makeSheet(browser, sheetShots, {
      out: join(folder, 'sheet.png'),
      cols: Number(values.cols),
      cell: Number(values.cell),
      title: `${site.paths[0]} ${values.selector} · ${width}px · ${values.theme}`,
    })
    console.log(`sheet: ${sheet}`)
  } finally {
    await browser.close()
    await site.close()
  }
}
