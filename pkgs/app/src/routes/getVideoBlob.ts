import { Handler } from 'hono'
import { isCid, isDid } from '@atcute/lexicons/syntax'
import { sourceVideoUrl } from '../lib/resolvePds'

const CACHE_TTL = 60 * 60 * 24 * 14
const MAX_SLICE_BYTES = 50 * 1000 * 1000

export function parseRange(header: string, size: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2]))
    return null
  if (!m[1]) {
    const suffix = Number(m[2])
    return suffix > 0 ? [ Math.max(0, size - suffix), size - 1 ] : null
  }
  const start = Number(m[1])
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  return start <= end ? [ start, end ] : null
}

export const getVideoBlob: Handler<Env, '/video/:did/:cid'> = async (c) => {
  const { did, cid } = c.req.param()
  if (!isDid(did) || !isCid(cid))
    return c.text('Invalid video', 400)

  const headers = new Headers()
  const range = c.req.header('range')
  if (range)
    headers.set('range', range)

  const res = await fetch(await sourceVideoUrl({ did, cid }, c.env), {
    method: c.req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    cf: { cacheEverything: true, cacheTtl: CACHE_TTL },
  } as RequestInit)

  if (!res.ok || !res.headers.get('content-type')?.startsWith('video/'))
    return c.text('Video not found', 404)

  const out = new Response(res.body, res)
  out.headers.delete('content-disposition')
  out.headers.delete('content-security-policy')
  out.headers.set('cache-control', `public, max-age=${CACHE_TTL}`)
  out.headers.set('access-control-allow-origin', '*')
  out.headers.set('accept-ranges', 'bytes')

  const size = Number(res.headers.get('content-length'))
  if (range && res.status === 200 && c.req.method !== 'HEAD' && size > 0 && size <= MAX_SLICE_BYTES) {
    const span = parseRange(range, size)
    if (!span) {
      out.headers.set('content-range', `bytes */${size}`)
      return new Response(null, { status: 416, headers: out.headers })
    }
    const body = (await res.arrayBuffer()).slice(span[0], span[1] + 1)
    out.headers.set('content-range', `bytes ${span[0]}-${span[1]}/${size}`)
    out.headers.set('content-length', String(body.byteLength))
    return new Response(body, { status: 206, headers: out.headers })
  }

  return out
}
