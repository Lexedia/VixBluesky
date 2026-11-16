export interface Rendition {
  quality: string
  width?: number
  height: number
  bandwidth?: number
}

export type QualityRequest = `${number}p` | 'best' | 'worst' | 'source'

const QUALITY_RE = /^(\d{3,4})p$/

export function parseQuality(value: string | undefined | null): QualityRequest | undefined {
  const v = value?.trim().toLowerCase()
  if (!v)
    return undefined
  if (v === 'best' || v === 'worst' || v === 'source')
    return v
  if (v === 'original')
    return 'source'
  const m = QUALITY_RE.exec(v) ?? /^(\d{3,4})$/.exec(v)
  return m ? `${Number(m[1])}p` : undefined
}

export function parseMasterPlaylist(text: string): Rendition[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const out: Rendition[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:'))
      continue
    const attrs = lines[i].slice('#EXT-X-STREAM-INF:'.length)
    const uri = lines[i + 1] ?? ''
    const quality = /^(\d{3,4}p)\//.exec(uri)?.[1]
    if (!quality)
      continue
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(attrs)
    const bandwidth = /BANDWIDTH=(\d+)/.exec(attrs)
    out.push({
      quality,
      width: res ? Number(res[1]) : undefined,
      height: res ? Number(res[2]) : Number(quality.slice(0, -1)),
      bandwidth: bandwidth ? Number(bandwidth[1]) : undefined,
    })
  }
  return out.sort((a, b) => a.height - b.height)
}

export function pickRendition(renditions: Rendition[], request: Exclude<QualityRequest, 'source'>): Rendition | undefined {
  if (!renditions.length)
    return undefined
  if (request === 'best')
    return renditions.at(-1)
  if (request === 'worst')
    return renditions[0]
  const wanted = Number(request.slice(0, -1))
  const below = renditions.filter((r) => r.height <= wanted)
  return below.length ? below.at(-1) : renditions[0]
}

export async function fetchRenditions(did: string, cid: string): Promise<Rendition[]> {
  const url = `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`
  try {
    const res = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
    if (!res.ok)
      return []
    return parseMasterPlaylist(await res.text())
  } catch {
    return []
  }
}
