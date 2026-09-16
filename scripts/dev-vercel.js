import { createServer } from 'node:http'

const { default: handler } = await import('../api/index.js')

const port = process.env.PORT || 8788
// 必须显式绑定 IPv4：不传 host 时 Node 会绑到 IPv6 通配地址（::），
// 在 WSL 下 Windows 侧的 localhost 转发只会暴露 [::1]，浏览器会 ERR_CONNECTION_REFUSED。
// 如需局域网访问，改成 '0.0.0.0'。
const host = '127.0.0.1'
createServer((req, res) => handler(req, res)).listen(port, host, () => {
  console.log(`Prism Vercel: http://${host}:${port}`)
})
