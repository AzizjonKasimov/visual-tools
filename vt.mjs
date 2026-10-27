#!/usr/bin/env node
// visual-tools: lets a coding agent see what it builds. Run `node vt.mjs help` for the commands.

import { parseArgs } from 'node:util'
import * as diff from './commands/diff.mjs'
import * as doctor from './commands/doctor.mjs'
import * as film from './commands/film.mjs'
import * as sheet from './commands/sheet.mjs'
import * as shoot from './commands/shoot.mjs'

const commands = { shoot, film, diff, sheet, doctor }

const usage = `visual-tools: screenshots, animation filmstrips, contact sheets, and visual diffs

  node vt.mjs shoot <target>   screenshots at several widths and themes, with a contact sheet
  node vt.mjs film <target>    frames of an element's animations at exact moments
  node vt.mjs diff <a> <b>     what changed between two sets of screenshots
  node vt.mjs sheet <images>   any images in one labeled grid
  node vt.mjs doctor           checks the browser, Node.js, and ffmpeg

A <target> is a URL, a built site's folder, or an HTML or SVG file. Every command only reads the
target and writes to its output folder (by default a new folder under the system temp folder).
Run \`node vt.mjs help <command>\` for a command's options.`

const [name, ...rest] = process.argv.slice(2)
if (!name || name === 'help' || name === '--help' || name === '-h') {
  console.log(rest[0] && commands[rest[0]] ? commands[rest[0]].help : usage)
  process.exit(0)
}
const command = commands[name]
if (!command) {
  console.error(`Unknown command: ${name}\n\n${usage}`)
  process.exit(2)
}
if (rest.includes('--help') || rest.includes('-h')) {
  console.log(command.help)
  process.exit(0)
}

let parsed
try {
  parsed = parseArgs({ args: rest, options: command.options, allowPositionals: true })
} catch (error) {
  console.error(`${error.message}\n\n${command.help}`)
  process.exit(2)
}

try {
  const [first, ...more] = parsed.positionals
  const code = await command.run(first, parsed.values, ...more)
  process.exit(typeof code === 'number' ? code : 0)
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
