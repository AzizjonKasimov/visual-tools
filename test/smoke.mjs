// Smoke test: builds a tiny page with one CSS animation in a temp folder, then runs every command
// on it and checks the results. Run it after installing on a new PC: `npm test`.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'vt-smoke-'))
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; color: #111; font: 16px sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
  .box { width: 120px; height: 60px; margin: 40px; background: teal; animation: grow 1s ease-out 200ms backwards; }
  @keyframes grow { from { transform: scaleX(0); } }
  @media (prefers-reduced-motion: reduce) { .box { animation: none; } }
</style><div class="box"></div><p>visual-tools smoke test</p>`,
)

const vt = (...args) => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'vt.mjs'), ...args], { encoding: 'utf8' })
const pngs = (folder) => (existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith('.png')) : [])

const checks = []
const shoot = vt('shoot', dir, '--widths', '320,800', '--themes', 'light,dark', '--out', join(dir, 'shots'))
checks.push(['shoot: four screenshots and a contact sheet', shoot.status === 0 && pngs(join(dir, 'shots')).length === 5])
const film = vt('film', dir, '--selector', '.box', '--frames', '4', '--check-end', '--out', join(dir, 'film'))
checks.push(['film: finds the animation and where it ends', film.status === 0 && film.stdout.includes('1 animations inside .box; last one ends at 1200 ms')])
checks.push(['film: the last frame is the still page', film.stdout.includes('check-end: the last frame matches the still page')])
const same = vt('diff', join(dir, 'shots'), join(dir, 'shots'), '--out', join(dir, 'diff-same'))
checks.push(['diff: a folder against itself has no changes', same.status === 0])
const changed = vt('diff', join(dir, 'film', 't00000ms.png'), join(dir, 'film', 't01200ms.png'), '--out', join(dir, 'diff-changed'))
checks.push(['diff: the first and last frames differ', changed.status === 1 && existsSync(join(dir, 'diff-changed', 'sheet.png'))])
const sheet = vt('sheet', join(dir, 'film', 't00000ms.png'), join(dir, 'film', 't01200ms.png'), '--out', join(dir, 'pair.png'))
checks.push(['sheet: two images in one PNG', sheet.status === 0 && existsSync(join(dir, 'pair.png'))])

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
if (failed) {
  for (const [label, run] of [['shoot', shoot], ['film', film], ['diff', changed], ['sheet', sheet]]) {
    if (run.status !== 0) console.log(`\n${label} output:\n${run.stdout}${run.stderr}`)
  }
  console.log(`\n${failed} check(s) failed; the files are in ${dir}`)
  process.exit(1)
}
rmSync(dir, { recursive: true, force: true })
console.log('\nAll checks passed.')
