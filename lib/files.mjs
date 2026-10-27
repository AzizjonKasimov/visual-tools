// Output folders and file names. Captures go to a fresh folder under the system temp folder unless
// --out names one, so nothing lands in a project by accident.

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export function outputFolder(out, command) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const folder = out ? resolve(out) : join(tmpdir(), 'visual-tools', `${stamp}-${command}`)
  mkdirSync(folder, { recursive: true })
  return folder
}

// A file-name-safe version of a page path or label: "/ko/work/semantic-search/" -> "ko-work-semantic-search".
export function slug(text) {
  const clean = String(text)
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return clean || 'home'
}
