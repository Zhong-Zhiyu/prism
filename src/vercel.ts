let app: any
const MAX_BODY_BYTES = 1024 * 1024

export default async function handler(req: any, res: any) {
  if (!app) {
    try {
      app = (await import('../src/worker')).default
    } catch (err: any) {
      console.error('Vercel app import failed:', err?.message)
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Prism 服务暂时不可用')
      return
    }
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost').toString()
    const headers = new Headers()
    for (const key of Object.keys(req.headers || {})) {
      const val = req.headers[key]
      if (val != null) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val))
    }

    let body: BodyInit | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const contentLength = Number(req.headers?.['content-length'] || 0)
      if (contentLength > MAX_BODY_BYTES) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('请求体过大')
        return
      }
      body = await new Promise<any>((resolve, reject) => {
        const chunks: Uint8Array[] = []
        let total = 0
        req.on('data', (chunk: Uint8Array) => {
          total += chunk.byteLength
          if (total > MAX_BODY_BYTES) {
            reject(new Error('request body too large'))
            req.destroy?.()
            return
          }
          chunks.push(chunk)
        })
        req.on('error', reject)
        req.on('end', () => {
          const merged = new Uint8Array(total)
          let offset = 0
          for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
          resolve(merged)
        })
      })
    }

    const webReq = new Request(url, { method: req.method || 'GET', headers, body })
    const webRes = await app.fetch(webReq)

    res.statusCode = webRes.status
    webRes.headers.forEach((v: string, k: string) => res.setHeader(k, v))
    if (webRes.body) res.end(new Uint8Array(await webRes.arrayBuffer()))
    else res.end()
  } catch (err: any) {
    console.error('Vercel request failed:', err?.message)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Prism 服务暂时不可用')
  }
}
