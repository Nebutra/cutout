import { request as httpRequest } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { connect as tlsConnect } from 'node:tls'
import { AgentError, LIMITS, invariant } from './contracts.js'

const PROXY_ENV_KEYS = Object.freeze(['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'])

function parseProxy(environment) {
  const raw = PROXY_ENV_KEYS.map((key) => environment?.[key]).find((value) => typeof value === 'string' && value.trim())
  if (!raw) return undefined
  invariant(Buffer.byteLength(raw) <= LIMITS.maximumPathBytes
    && !raw.includes('\r') && !raw.includes('\n') && !raw.includes('\0'),
  'invalid-proxy', 'Platform proxy configuration is malformed.')
  let proxy
  try { proxy = new URL(raw) } catch { throw new AgentError('invalid-proxy', 'Platform proxy configuration is malformed.') }
  invariant(['http:', 'https:'].includes(proxy.protocol)
    && proxy.hostname && !proxy.username && !proxy.password
    && (proxy.pathname === '/' || proxy.pathname === '') && !proxy.search && !proxy.hash,
  'invalid-proxy', 'Platform proxy configuration is not a supported HTTP CONNECT endpoint.')
  return proxy
}

function requestBytes(body) {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  throw new AgentError('invalid-provider-request', 'Provider request body type is unsupported.')
}

function connectTunnel(proxy, target, signal) {
  return new Promise((resolve, reject) => {
    const targetPort = target.port || '443'
    const authority = `${target.hostname}:${targetPort}`
    const connector = proxy.protocol === 'https:' ? httpsRequest : httpRequest
    const request = connector({
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: authority,
      headers: { host: authority },
      agent: false,
    })
    let settled = false
    const finish = (error, socket) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(socket)
    }
    const abort = () => {
      const reason = signal.reason instanceof Error ? signal.reason : new Error('Provider request was aborted.')
      request.destroy(reason)
      finish(reason)
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    request.once('error', (error) => finish(error))
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        finish(new AgentError('proxy-connect-failed', `Platform proxy refused the Provider tunnel with HTTP ${response.statusCode ?? 0}.`))
        return
      }
      if (head.length) socket.unshift(head)
      const secure = tlsConnect({
        socket,
        servername: target.hostname,
        ALPNProtocols: ['http/1.1'],
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      })
      secure.once('secureConnect', () => finish(undefined, secure))
      secure.once('error', (error) => finish(error))
    })
    request.end()
  })
}

async function proxyFetch(proxy, input, init = {}) {
  const target = new URL(input)
  invariant(target.protocol === 'https:' && !target.username && !target.password && !target.hash,
    'invalid-provider-origin', 'Proxied Provider requests require a credential-free HTTPS URL.')
  const signal = init.signal
  const socket = await connectTunnel(proxy, target, signal)
  const bytes = requestBytes(init.body)
  const headers = new Headers(init.headers)
  if (bytes && !headers.has('content-length')) headers.set('content-length', String(bytes.length))
  const agent = new HttpsAgent({ keepAlive: false, maxSockets: 1 })
  agent.createConnection = (_options, callback) => {
    callback?.(null, socket)
    return socket
  }
  return new Promise((resolve, reject) => {
    let response
    let settled = false
    const request = httpsRequest({
      protocol: 'https:',
      hostname: target.hostname,
      port: target.port || 443,
      method: init.method || 'GET',
      path: `${target.pathname}${target.search}`,
      headers: Object.fromEntries(headers.entries()),
      agent,
    })
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const finishError = (error) => {
      if (settled) return
      settled = true
      cleanup()
      agent.destroy()
      reject(error)
    }
    const abort = () => {
      const reason = signal.reason instanceof Error ? signal.reason : new Error('Provider request was aborted.')
      request.destroy(reason)
      response?.destroy(reason)
      finishError(reason)
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    request.once('error', finishError)
    request.once('response', (incoming) => {
      response = incoming
      incoming.once('close', cleanup)
      incoming.once('end', cleanup)
      settled = true
      resolve(new Response(Readable.toWeb(incoming), {
        status: incoming.statusCode,
        statusText: incoming.statusMessage,
        headers: incoming.headers,
      }))
    })
    request.end(bytes)
  })
}

export function createProviderFetch(environment, injectedFetch = undefined) {
  invariant(injectedFetch === undefined || typeof injectedFetch === 'function',
    'invalid-provider-transport', 'Injected Provider transport must be callable.')
  if (injectedFetch) return injectedFetch
  const proxy = parseProxy(environment)
  if (!proxy) return fetch
  return (input, init) => proxyFetch(proxy, input, init)
}
