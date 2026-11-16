import type { KVNamespace } from '@cloudflare/workers-types'
import type { Flags } from './flags'
import type { PostMedia } from './normalizePost'
import {
  fetchDuration, fetchRenditions, pickBySize, pickRendition, type QualityRequest,
} from './video'

const CACHE_TTL = 60 * 60 * 24

interface DidDocument {
  service?: { id: string; type: string; serviceEndpoint: unknown }[]
}

function didDocUrl(did: string): string | null {
  if (did.startsWith('did:plc:'))
    return `https://plc.directory/${did}`
  if (did.startsWith('did:web:')) {
    const host = decodeURIComponent(did.slice('did:web:'.length))
    return host.includes(':') || host.includes('/') ? null : `https://${host}/.well-known/did.json`
  }
  return null
}

export function pdsFromDidDoc(doc: DidDocument, did: string): string | null {
  const svc = doc.service?.find((s) =>
    (s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`) &&
    s.type === 'AtprotoPersonalDataServer')
  const ep = svc?.serviceEndpoint
  if (typeof ep !== 'string')
    return null
  try {
    const url = new URL(ep)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

export async function resolvePds(did: string, kv: KVNamespace, fallback: string): Promise<string> {
  const fallbackOrigin = new URL(fallback).origin
  const key = `pds:${did}`

  try {
    const cached = await kv.get(key)
    if (cached)
      return cached
  } catch { /* cache is best-effort */ }

  const url = didDocUrl(did)
  if (!url)
    return fallbackOrigin

  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok)
      return fallbackOrigin
    const pds = pdsFromDidDoc(await res.json(), did)
    if (!pds)
      return fallbackOrigin
    try {
      await kv.put(key, pds, { expirationTtl: CACHE_TTL })
    } catch { /* cache is best-effort */ }
    return pds
  } catch {
    return fallbackOrigin
  }
}

export interface VideoEnv {
  sessions: KVNamespace
  BSKY_SERVICE_URL: string
  VIXBLUESKY_API_URL: string
}

type Video = Extract<PostMedia, { kind: 'video' }>

export async function sourceVideoUrl(video: Pick<Video, 'did' | 'cid'>, env: VideoEnv): Promise<string> {
  const pds = await resolvePds(video.did, env.sessions, env.BSKY_SERVICE_URL)
  const params = new URLSearchParams({ did: video.did, cid: video.cid })
  return `${pds}/xrpc/com.atproto.sync.getBlob?${params}`
}

export const renditionUrl = (video: Video, quality: string, env: Pick<VideoEnv, 'VIXBLUESKY_API_URL'>) =>
  `${env.VIXBLUESKY_API_URL}video/${quality}/${video.did}/${video.cid}`

async function sourceSize(video: Video, env: VideoEnv): Promise<number | undefined> {
  try {
    const res = await fetch(await sourceVideoUrl(video, env), { method: 'HEAD' })
    const length = Number(res.headers.get('content-length'))
    return res.ok && length > 0 ? length : undefined
  } catch {
    return undefined
  }
}

export async function videoUrl(
  video: Video,
  flags: Pick<Flags, 'videoApi'> & {
    quality?: QualityRequest
    maxBytes?: number
    origin?: string
  },
  env: VideoEnv,
): Promise<string> {
  if (flags.maxBytes !== undefined && !flags.quality) {
    if (flags.origin) {
      const size = await sourceSize(video, env)
      if (size !== undefined && size <= flags.maxBytes)
        return `${flags.origin}/video/${encodeURIComponent(video.did)}/${video.cid}`
    }
    const renditions = await fetchRenditions(video.did, video.cid)
    if (!renditions.length)
      return sourceVideoUrl(video, env)
    const seconds = await fetchDuration(video.did, video.cid, renditions[0].quality)
    return renditionUrl(video, pickBySize(renditions, seconds, flags.maxBytes)!.quality, env)
  }

  const request = flags.quality ?? (flags.videoApi ? 'best' : 'source')
  if (request === 'source')
    return sourceVideoUrl(video, env)

  const rendition = pickRendition(await fetchRenditions(video.did, video.cid), request)
  return rendition ? renditionUrl(video, rendition.quality, env) : sourceVideoUrl(video, env)
}
