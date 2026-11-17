import { NormalizedPost, PostAuthor } from './normalizePost'
import { ellipsis } from './utils'
import { languageName } from './translate'
import {
  escapeInline, escapeMarkdown, linksTo, markdownUrl, richMarkdown,
} from './richtext'

export const MAX_BYTES = 3000
export const MAX_COMPONENTS = 40
export const MAX_GALLERY_ITEMS = 10
const ACCENT = 0x0085FF
const QUOTE_CHARS = 140

export interface Media { url: string }
export type Component =
  | { type: 1; components: Component[] }
  | {
    type: 2; style: 5; label: string; url: string
  }
  | { type: 9; components: Component[]; accessory: Component }
  | { type: 10; content: string }
  | { type: 11; media: Media }
  | { type: 12; items: { media: Media }[] }
  | { type: 14; divider: boolean; spacing: 1 | 2 }
  | { type: 17; accent_color: number; components: Component[] }

export interface ComponentEmbed { component: Component }

export interface ComponentEmbedOptions {
  videoUrls?: Map<string, string>
  maxBytes?: number
}

export const serializeEmbed = (embed: ComponentEmbed) => JSON.stringify(embed).replace(/</g, '\\u003c')

export const embedBytes = (embed: ComponentEmbed) => new TextEncoder().encode(serializeEmbed(embed)).length

function countComponents(c: Component): number {
  let n = 1
  if ('components' in c)
    n += c.components.reduce((sum, child) => sum + countComponents(child), 0)
  if ('accessory' in c)
    n += countComponents(c.accessory)
  return n
}

export const embedComponents = (embed: ComponentEmbed) => countComponents(embed.component)

export function embedGalleryItems(embed: ComponentEmbed): number {
  const walk = (c: Component): number =>
    (c.type === 12 ? c.items.length : 0) +
    ('components' in c ? c.components.reduce((sum, child) => sum + walk(child), 0) : 0)
  return walk(embed.component)
}

const profileUrl = (a: PostAuthor) => `https://bsky.app/profile/${a.handle}`
const name = (a: PostAuthor) => escapeInline(a.displayName || a.handle)

function postMarkdown(post: NormalizedPost, label: string, maxChars?: number): string {
  const { replies, reposts, likes } = post.stats
  const lines = [ `-# ${label} · 🗨️ ${replies}   ♻️ ${reposts}   💙 ${likes}` ]
  if (post.text) {
    lines.push(maxChars !== undefined && Array.from(post.text).length > maxChars
      ? escapeMarkdown(ellipsis(post.text, maxChars))
      : richMarkdown(post.text, post.facets))
  }
  if (post.quote) {
    const text = escapeMarkdown(ellipsis(post.quote.text, QUOTE_CHARS)).replace(/\n/g, '\n> ')
    lines.push(`> **[${name(post.quote.author)}](${markdownUrl(post.quote.url)})**${text ? `\n> ${text}` : ''}`)
  }
  const card = post.external
  if (card && (card.title || card.uri) && !linksTo(post, card.uri))
    lines.push(`🔗 [${escapeInline(card.title || card.uri)}](${markdownUrl(card.uri)})`)
  return lines.join('\n')
}

function mediaOf(post: NormalizedPost, videoUrls: Map<string, string> | undefined): Media[] {
  if (post.media.kind === 'images')
    return post.media.items.map((img) => ({ url: img.fullsize }))
  const video = post.media.kind === 'video' ? videoUrls?.get(post.rkey) : undefined
  return video ? [ { url: video } ] : []
}

interface Window {
  from: number
  to: number
  anchor: number
  anchorChars?: number
}

function build(root: NormalizedPost, posts: NormalizedPost[], win: Window, options: ComponentEmbedOptions): ComponentEmbed {
  const thread = root.thread!
  const total = thread.count
  const translation = [ root, ...thread.parts ].map((p) => p.translation ?? p.quote?.translation).find(Boolean)
  const components: Component[] = []

  const header: Component = {
    type: 10,
    content: `**${name(root.author)}** · [@${escapeInline(root.author.handle)}](${profileUrl(root.author)})
` +
      `-# 🧵 [Thread](${markdownUrl(thread.rootUrl)}) · ${total} posts` +
      (translation ? ` · 🌐 Translated from ${languageName(translation.from)}` : ''),
  }
  components.push(root.author.avatar
    ? { type: 9, components: [ header ], accessory: { type: 11, media: { url: root.author.avatar } } }
    : header)

  let galleryLeft = MAX_GALLERY_ITEMS
  for (let i = win.from; i < win.to; i++) {
    const post = posts[i]
    const isAnchor = i === win.anchor
    const number = `${thread.index + i}/${total}`
    const label = isAnchor && win.from < win.anchor ? `**${number}**` : number
    components.push({ type: 14, divider: true, spacing: 1 })
    components.push({ type: 10, content: postMarkdown(post, label, isAnchor ? win.anchorChars : undefined) })
    const media = mediaOf(post, options.videoUrls).slice(0, galleryLeft)
    if (media.length) {
      galleryLeft -= media.length
      components.push({ type: 12, items: media.map((m) => ({ media: m })) })
    }
  }

  const shown = win.to - win.from
  components.push({ type: 14, divider: true, spacing: 1 })
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: shown < total ? `Read all ${total} posts on Bluesky` : 'Open on Bluesky',
        url: thread.rootUrl,
      },
    ],
  })

  return { component: { type: 17, accent_color: ACCENT, components } }
}

export const fits = (embed: ComponentEmbed, maxBytes: number = MAX_BYTES) =>
  embedBytes(embed) <= maxBytes && embedComponents(embed) <= MAX_COMPONENTS && embedGalleryItems(embed) <= MAX_GALLERY_ITEMS

export function threadComponentEmbed(root: NormalizedPost, options: ComponentEmbedOptions = {}): ComponentEmbed | null {
  if (!root.thread?.parts.length)
    return null
  const maxBytes = options.maxBytes ?? MAX_BYTES
  const posts = [ root, ...root.thread.parts ]
  const anchor = Math.min(Math.max(root.thread.anchor - 1, 0), posts.length - 1)

  let win: Window = { from: anchor, to: anchor + 1, anchor }
  let best = build(root, posts, win, options)

  if (!fits(best, maxBytes)) {
    let lo = 0
    let hi = Array.from(posts[anchor].text).length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (fits(build(root, posts, { ...win, anchorChars: mid }, options), maxBytes))
        lo = mid
      else
        hi = mid - 1
    }
    const shortened = build(root, posts, { ...win, anchorChars: lo }, options)
    return fits(shortened, maxBytes) ? shortened : null
  }

  while (win.to < posts.length) {
    const candidate = build(root, posts, { ...win, to: win.to + 1 }, options)
    if (!fits(candidate, maxBytes))
      break
    win = { ...win, to: win.to + 1 }
    best = candidate
  }
  while (win.to === posts.length && win.from > 0) {
    const candidate = build(root, posts, { ...win, from: win.from - 1 }, options)
    if (!fits(candidate, maxBytes))
      break
    win = { ...win, from: win.from - 1 }
    best = candidate
  }
  return best
}
