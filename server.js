const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT = 3000
const ROOT = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.otf':  'font/otf',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
}

const server = http.createServer((req, res) => {
  // Strip query string
  const urlPath = req.url.split('?')[0]

  // API: list Lottie JSON files
  if (urlPath === '/api/lotties') {
    try {
      const files = fs.readdirSync(path.join(ROOT, 'Lottie'))
        .filter(f => f.toLowerCase().endsWith('.json'))
        .sort()
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(files))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('[]')
    }
    return
  }

  // Static file serving
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)

  // Prevent path traversal
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return
  }

  const ext  = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`)
  console.log(`Drop JSON files in Lottie/ — they appear in the select automatically.`)
})
