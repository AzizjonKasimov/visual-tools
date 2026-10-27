// Turns a target into an origin to load pages from. A target is one of:
// - a URL (http://localhost:5173, https://example.com): pages load from it as they are;
// - a folder (a built site such as docs/ or dist/): served here on a free local port;
// - an HTML or SVG file: its folder is served, and the file is the page.
// The local server is read-only and serves index.html for folder paths, like most static hosts.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
}

function serveFolder(folder) {
  const root = resolve(folder)
  const server = createServer((request, response) => {
    let path
    try {
      path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    } catch {
      response.writeHead(400).end()
      return
    }
    let file = normalize(join(root, path))
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      const notFound = join(root, '404.html')
      response.writeHead(404, { 'content-type': types['.html'] })
      if (existsSync(notFound)) createReadStream(notFound).pipe(response)
      else response.end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(file).pipe(response)
  })
  return new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      done({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((closed) => server.close(closed)),
      })
    })
  })
}

// Returns { origin, paths, close }. `paths` defaults to the file itself or the site's root.
export async function openTarget(target, paths = []) {
  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target)
    const given = url.pathname !== '/' || url.search ? [url.pathname + url.search] : []
    return { origin: url.origin, paths: paths.length ? paths : given.length ? given : ['/'], close: async () => {} }
  }
  const full = resolve(target)
  if (!existsSync(full)) throw new Error(`Not found: ${full}`)
  if (statSync(full).isDirectory()) {
    const site = await serveFolder(full)
    return { ...site, paths: paths.length ? paths : ['/'] }
  }
  const site = await serveFolder(dirname(full))
  return { ...site, paths: paths.length ? paths : [`/${encodeURIComponent(basename(full))}`] }
}
