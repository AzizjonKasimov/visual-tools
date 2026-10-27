// doctor: checks that this PC has what the tools need.

import { spawnSync } from 'node:child_process'
import { launchBrowser } from '../lib/browser.mjs'

export const help = `vt doctor

Checks Node.js, a Chrome or Edge browser that playwright-core can start, and ffmpeg (only needed
for vt film --gif or --mp4).`

export const options = {}

export async function run() {
  let ok = true
  const [major] = process.versions.node.split('.').map(Number)
  console.log(`${major >= 20 ? 'ok  ' : 'FAIL'}  Node.js ${process.versions.node}${major >= 20 ? '' : ' (needs 20 or newer)'}`)
  ok &&= major >= 20
  try {
    const browser = await launchBrowser()
    console.log(`ok    browser ${browser.browserType().name()} ${browser.version()}`)
    await browser.close()
  } catch (error) {
    ok = false
    console.log(`FAIL  ${error.message}`)
  }
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  console.log(ffmpeg.status === 0 ? `ok    ${ffmpeg.stdout.split('\n')[0]}` : 'note  ffmpeg not found on PATH (only vt film --gif and --mp4 need it)')
  return ok ? 0 : 1
}
