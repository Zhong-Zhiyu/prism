import { createServer } from 'node:http'

const { default: handler } = await import('../api/index.js')

const port = process.env.PORT || 8788
createServer((req, res) => handler(req, res)).listen(port, () => {
  console.log(`Prism Vercel: http://localhost:${port}`)
})
