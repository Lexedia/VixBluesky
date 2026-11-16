import { Facet } from './normalizePost'

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[ch]!)

export const paragraphs = (text: string) => escapeHtml(text).replace(/\n/g, '<br>')

export function facetHref(facet: Facet): string | null {
  switch (facet.kind) {
    case 'mention':
      return `https://bsky.app/profile/${facet.did}`
    case 'tag':
      return `https://bsky.app/hashtag/${encodeURIComponent(facet.tag.replace(/^#/, ''))}`
    case 'link':
      try {
        const url = new URL(facet.uri)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
      } catch {
        return null
      }
  }
}

const TRAILING = /[.,;:!?)\]'"]+$/

export function detectFacets(text: string): Facet[] {
  const enc = new TextEncoder()
  const bytesBefore = (i: number) => enc.encode(text.slice(0, i)).length
  const out: Facet[] = []
  const add = (index: number, match: string, make: (s: string) => object) => {
    const clean = match.replace(TRAILING, '')
    if (!clean)
      return
    const start = bytesBefore(index)
    out.push({ start, end: start + enc.encode(clean).length, ...make(clean) } as Facet)
  }

  for (const m of text.matchAll(/(^|[\s(])(@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi))
    add(m.index! + m[1].length, m[2], (s) => ({ kind: 'mention', did: s.slice(1).toLowerCase() }))
  for (const m of text.matchAll(/(^|[\s(])((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi)) {
    const uri = /^https?:\/\//i.test(m[2]) ? m[2].replace(TRAILING, '') : `https://${m[2].replace(TRAILING, '')}`
    add(m.index! + m[1].length, m[2], () => ({ kind: 'link', uri }))
  }
  for (const m of text.matchAll(/(^|\s)(#[^\s#]*[^\d\s#][^\s#]*)/g))
    add(m.index! + m[1].length, m[2], (s) => ({ kind: 'tag', tag: s.slice(1) }))

  return out.sort((a, b) => a.start - b.start)
}

const sameUrl = (a: string, b: string) => {
  try {
    return new URL(a).href.replace(/\/$/, '') === new URL(b).href.replace(/\/$/, '')
  } catch {
    return false
  }
}

export const linksTo = (post: { facets?: Facet[] }, uri: string) =>
  !!post.facets?.some((f) => f.kind === 'link' && sameUrl(f.uri, uri))

export interface Segment {
  text: string
  facet?: Facet
  href?: string
}

export function segments(text: string, facets: Facet[] | undefined): Segment[] {
  if (!facets?.length)
    return [ { text } ]

  const bytes = new TextEncoder().encode(text)
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  const slice = (start: number, end: number) => decoder.decode(bytes.subarray(start, end))

  const out: Segment[] = []
  let pos = 0
  for (const facet of [ ...facets ].sort((a, b) => a.start - b.start)) {
    if (facet.start < pos || facet.end > bytes.length)
      continue
    const href = facetHref(facet)
    if (!href)
      continue
    let before: string, label: string
    try {
      before = slice(pos, facet.start)
      label = slice(facet.start, facet.end)
    } catch {
      continue
    }
    if (before)
      out.push({ text: before })
    out.push({ text: label, facet, href })
    pos = facet.end
  }

  try {
    const rest = slice(pos, bytes.length)
    if (rest)
      out.push({ text: rest })
    return out
  } catch {
    return [ { text } ]
  }
}

export function richText(text: string, facets: Facet[] | undefined): string {
  return segments(text, facets)
    .map((s) => s.href ? `<a href="${escapeHtml(s.href)}">${paragraphs(s.text)}</a>` : paragraphs(s.text))
    .join('')
}

export const escapeMarkdown = (s: string) => escapeBlock(escapeInline(s))

export const escapeInline = (s: string) => s.replace(/[\\*_~`|[\]]/g, '\\$&')
const escapeBlock = (s: string) => s.replace(/^(\s*)([#>-]|\d+\.)/gm, '$1\\$2')

export const markdownUrl = (href: string) =>
  href.replace(/[()\s]/g, (ch) => ch === '(' ? '%28' : ch === ')' ? '%29' : encodeURIComponent(ch))

const isHttpUrl = (s: string) => {
  try {
    const { protocol } = new URL(s)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function richMarkdown(text: string, facets: Facet[] | undefined): string {
  return escapeBlock(segments(text, facets)
    .map(({ text: t, facet, href }) => {
      if (!facet || !href)
        return escapeInline(t)
      if (/^https?:\/\/\S+$/i.test(t))
        return facet.kind === 'link' && isHttpUrl(t) ? t : href
      let url = href
      const handle = /^@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(t)?.[1]
      if (facet.kind === 'mention' && handle)
        url = `https://bsky.app/profile/${handle}`
      return `[${escapeInline(t)}](${markdownUrl(url)})`
    })
    .join(''))
}
