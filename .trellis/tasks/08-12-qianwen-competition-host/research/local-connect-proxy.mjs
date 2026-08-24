import { createServer } from 'node:http'
import { connect } from 'node:net'

const server = createServer((_request, response) => {
  response.writeHead(405, { 'content-type': 'text/plain', 'content-length': '0' })
  response.end()
})

server.on('connect', (request, downstream, head) => {
  const separator = request.url?.lastIndexOf(':') ?? -1
  const hostname = separator > 0 ? request.url.slice(0, separator) : ''
  const port = Number.parseInt(request.url?.slice(separator + 1) ?? '', 10)
  if (port !== 443 || (hostname !== 'dashscope.aliyuncs.com' && !hostname.endsWith('.aliyuncs.com'))) {
    downstream.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
    return
  }
  const upstream = connect({ host: hostname, port })
  upstream.once('connect', () => {
    downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length) upstream.write(head)
    downstream.pipe(upstream)
    upstream.pipe(downstream)
  })
  upstream.once('error', () => downstream.destroy())
  downstream.once('error', () => upstream.destroy())
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  process.stdout.write(`${address.port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
