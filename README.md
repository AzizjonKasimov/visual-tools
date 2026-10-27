# visual-tools

Command-line tools that let a coding agent (Claude Code, Codex, or any other) see what it builds:
screenshots at many widths and color themes, frame-by-frame filmstrips of animations, contact
sheets that put many images into one, and visual diffs between two runs.

They are plain Node.js scripts with Markdown instructions, so no single AI tool owns them: any
agent that can run a shell command and read an image can use them. Point your agents at this
README, or at a short note in your own agent instructions, and they know what to run.

## Setup

Needs Node.js 20 or newer and Google Chrome or Microsoft Edge (the tools drive the installed
browser through `playwright-core`; nothing else is downloaded). `ffmpeg` on `PATH` is optional
and only needed for GIF or MP4 output.

```powershell
cd visual-tools
npm install
node vt.mjs doctor   # checks Node.js, the browser, and ffmpeg
npm test             # runs every command on a tiny test page
```

## Commands

Run `node vt.mjs help <command>` for every option. A `<target>` is a URL, a built site's folder
(served on a free local port), or an HTML or SVG file.

| Command | What it does |
| --- | --- |
| `shoot <target>` | Screenshots pages, or the elements matching `--selector`, at each width (`--widths 320,375,1280`) and theme (`--themes light,dark`), plus `sheet.png` with all of them side by side. `--motion reduce` (default) shows the page as it is with motion turned off; `--motion end` scrolls through with motion on and jumps every animation to its end. |
| `film <target> --selector <css>` | Pauses every CSS and Web Animations API animation inside one element and seeks them to chosen moments (`--frames 10`, or `--times 0,300,900`), so each frame shows exactly that moment. Scroll-triggered animations start because the element is scrolled into view first. `--check-end` compares the last frame with the reduced-motion page; `--gif` and `--mp4` write a video. |
| `diff <before> <after>` | Compares two PNGs, or two folders of PNGs matched by name (two `shoot` runs), writes a red-marked diff for each pair that changed, and a contact sheet of before, after, and diff. Exits with 1 when anything changed. |
| `sheet <images...>` | Puts any images into one labeled grid. |
| `doctor` | Checks the setup. |

## Examples

```powershell
# A built site's page at two phone widths and a desktop width, in both themes:
node vt.mjs shoot ..\my-site\dist --path /about/ --widths 320,375,1280 --themes light,dark

# Only the figures on a page of a running dev server:
node vt.mjs shoot http://localhost:5173 --path /work/pipeline/ --selector ".figure" --all

# What a scroll-triggered animation shows at ten moments, and whether it ends where the still page is:
node vt.mjs film ..\my-site\dist --path /work/search/ --selector .hero-chart --frames 10 --check-end

# A 1200x630 image from an HTML file, such as a link preview or a video thumbnail:
node vt.mjs shoot card.html --widths 1200 --height 630 --viewport

# Before and after a CSS change:
node vt.mjs shoot ..\my-site\dist --path / --widths 375,1280 --out before
# ...change and rebuild...
node vt.mjs shoot ..\my-site\dist --path / --widths 375,1280 --out after
node vt.mjs diff before after
```

## Safety

- Read-only toward the target: the tools open pages and take pictures. They write only to their
  output folder, which is a new folder under the system temp folder unless `--out` names one.
- Offline by default: a page may load only from the target's own origin, so a screenshot never
  sends an analytics hit or loads outside scripts. `--allow-external` turns this off.
- The local server serves only the folder it is given and refuses paths outside it.

## Limits

- `film` sees CSS animations and the Web Animations API. Canvas drawing and animations driven
  by `requestAnimationFrame` are not seekable; record those in real time instead.
- Fonts and rendering are those of this PC's browser, so a screenshot here can differ by a few
  pixels from another machine. Compare runs from the same PC.
