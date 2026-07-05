let app: any

export default async function handler(req: any, res: any) {
  if (!app) {
    try {
      app = (await import('../src/worker')).default
    } catch (err: any) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(`Import Error: ${err.message}\n\n${err.stack || ''}`)
      return
    }
  }

  try {
    const host = req.headers.host || 'localhost'
    const url = `https://${host}${req.url}`

    const headers = new Headers()
    for (const key of Object.keys(req.headers)) {
      const val = req.headers[key]
      if (val != null) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val))
    }

    let body: BodyInit | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise<any>((resolve, reject) => {
        const chunks: Uint8Array[] = []
        req.on('data', (c: Uint8Array) => chunks.push(c))
        req.on('error', reject)
        req.on('end', () => {
          const len = chunks.reduce((s: number, c: Uint8Array) => s + c.length, 0)
          const merged = new Uint8Array(len)
          let off = 0
          for (const c of chunks) { merged.set(c, off); off += c.length }
          resolve(merged)
        })
      })
    }

    const webReq = new Request(url, { method: req.method || 'GET', headers, body })
    const webRes = await app.fetch(webReq)

    res.statusCode = webRes.status
    webRes.headers.forEach((v: string, k: string) => res.setHeader(k, v))

    if (webRes.body) {
      res.end(new Uint8Array(await webRes.arrayBuffer()))
    } else {
      res.end()
    }
  } catch (err: any) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Prism Error: ${err.message}\n\n${err.stack || ''}`)
  }
}
