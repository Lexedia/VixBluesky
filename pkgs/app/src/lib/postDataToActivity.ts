import { NormalizedPost, PostAuthor } from './normalizePost'
import { ellipsis } from './utils'
import {
  escapeHtml, linksTo, paragraphs, richText,
} from './richtext'

export interface ActivityMediaAttachment {
  id: string
  type: 'image' | 'video' | 'gifv'
  url: string
  preview_url: string | null
  remote_url: string | null
  preview_remote_url: string | null
  text_url: string | null
  description: string | null
  meta?: {
    original?: {
      width: number
      height: number
      size?: string
      aspect?: number
    }
  }
}

export interface ActivityAccount {
  id: string
  display_name: string
  username: string
  acct: string
  url: string
  uri: string
  created_at: string
  locked: boolean
  bot: boolean
  discoverable: boolean
  indexable: boolean
  group: boolean
  avatar?: string
  avatar_static?: string
  header?: string
  header_static?: string
  followers_count: number
  following_count: number
  statuses_count: number
  hide_collections: boolean
  noindex: boolean
  emojis: []
  roles: []
  fields: []
}

export interface ActivityStatus {
  id: string
  url: string
  uri: string
  created_at: string
  edited_at: null
  reblog: null
  in_reply_to_id: null
  in_reply_to_account_id: null
  language: string | null
  content: string
  spoiler_text: string
  visibility: 'public'
  application: {
    name: string
    website: string | null
  }
  media_attachments: ActivityMediaAttachment[]
  account: ActivityAccount
  mentions: []
  tags: []
  emojis: []
  card: null
  poll: null
}

export { escapeHtml }

const nameOf = (a: PostAuthor) =>
  a.displayName ? `${escapeHtml(a.displayName)} (@${escapeHtml(a.handle)})` : `@${escapeHtml(a.handle)}`

function sizeMeta(width?: number, height?: number) {
  if (!width || !height)
    return undefined
  return {
    original: {
      width, height, size: `${width}x${height}`, aspect: width / height,
    },
  }
}

const TEXT_BUDGET = 3000
const REPLY_CONTEXT_CHARS = 200
const MAX_ATTACHMENTS = 4

const CARD_DESCRIPTION_CHARS = 160
const READER_QUOTE_CHARS = 140

interface BodyOptions {
  label?: string
  compact?: boolean
}

function formatBody(post: NormalizedPost, { label, compact = false }: BodyOptions = {}): string {
  let content = ''

  const prefix = label ? `<b>${escapeHtml(label)}</b>` : ''
  if (post.text)
    content += `<p>${prefix ? `${prefix} ` : ''}${richText(post.text, post.facets)}</p>`
  else if (prefix)
    content += `<p>${prefix}</p>`

  if (post.quote) {
    const { quote } = post
    const text = compact && Array.from(quote.text).length > READER_QUOTE_CHARS
      ? paragraphs(ellipsis(quote.text, READER_QUOTE_CHARS))
      : richText(quote.text, quote.facets)
    content += `<blockquote><b><a href="${escapeHtml(quote.url)}">${nameOf(quote.author)}</a></b>` +
      (text ? `<br>${text}` : '') +
      '</blockquote>'
  }

  const card = post.external
  if (card && (card.title || card.description) && !(compact && linksTo(post, card.uri))) {
    content += `<p>🔗 <b><a href="${escapeHtml(card.uri)}">${escapeHtml(card.title || card.uri)}</a></b></p>`
    // we quote it, so the page's own blurb doesn't read as part of the post - ty Elanis for the suggestion c: (i may  be stupid)
    if (!compact && card.description)
      content += `<blockquote>${paragraphs(ellipsis(card.description, CARD_DESCRIPTION_CHARS))}</blockquote>`
  }

  return content
}

const textLength = (post: NormalizedPost) =>
  post.text.length + Math.min(post.quote?.text.length ?? 0, READER_QUOTE_CHARS) + (post.external?.title.length ?? 0)

function formatContent(post: NormalizedPost): string {
  let content = ''
  const { thread } = post
  const reader = !!thread?.parts.length

  if (thread) {
    const position = reader ? `${thread.count} posts` : `${thread.index}/${thread.count}`
    content += `<p>🧵 <a href="${escapeHtml(thread.rootUrl)}">Thread</a> · ${position}</p>`
  } else if (post.reply) {
    const { reply } = post
    content += `<p>↪ <i>Replying to <a href="${escapeHtml(reply.url)}">${nameOf(reply.author)}</a></i></p>`
    if (reply.text)
      content += `<blockquote>${paragraphs(ellipsis(reply.text, REPLY_CONTEXT_CHARS))}</blockquote>`
  }

  content += formatBody(post, { label: reader ? `${thread!.index}/${thread!.count}` : undefined })

  if (thread && reader) {
    let budget = TEXT_BUDGET - textLength(post)
    let cut = thread.more
    for (const [ i, part ] of thread.parts.entries()) {
      const length = textLength(part)
      if (length > budget) {
        cut = true
        break
      }
      budget -= length
      content += formatBody(part, { label: `${thread.index + i + 1}/${thread.count}`, compact: true })
    }
    if (cut) {
      content += `<p><a href="${escapeHtml(thread.rootUrl)}">… read the full thread</a></p>`
    }
  }

  const { replies, reposts, likes } = post.stats
  content += `<p>🗨️ ${replies}   ♻️ ${reposts}   💙 ${likes}</p>`

  return content
}

function attachments(post: NormalizedPost, { index, videoUrl: video, galleryUrl }: ActivityOptions): ActivityMediaAttachment[] {
  const { media } = post

  if (media.kind === 'images' && galleryUrl && index === undefined) {
    return [
      {
        id: galleryUrl,
        type: 'image',
        url: galleryUrl,
        preview_url: galleryUrl,
        remote_url: null,
        preview_remote_url: null,
        text_url: null,
        description: media.items.map((img) => img.alt).filter(Boolean).join('\n') || null,
      },
    ]
  }

  if (media.kind === 'images' || (media.kind === 'none' && post.thread?.parts.length)) {
    let items = media.kind === 'images'
      ? index !== undefined && media.items[index] ? [ media.items[index] ] : media.items
      : []
    if (index === undefined && post.thread) {
      for (const part of post.thread.parts) {
        if (items.length >= MAX_ATTACHMENTS)
          break
        if (part.media.kind === 'images')
          items = [ ...items, ...part.media.items.slice(0, MAX_ATTACHMENTS - items.length) ]
      }
    }
    return items.map((img) => ({
      id: img.fullsize,
      type: 'image',
      url: img.fullsize,
      preview_url: img.thumb,
      remote_url: null,
      preview_remote_url: null,
      text_url: null,
      description: img.alt || null,
      meta: sizeMeta(img.width, img.height),
    }))
  }

  if (media.kind === 'video' && video) {
    return [
      {
        id: media.cid,
        type: media.gif ? 'gifv' : 'video',
        url: video,
        preview_url: media.thumb ?? null,
        remote_url: null,
        preview_remote_url: null,
        text_url: null,
        description: media.alt || null,
        meta: sizeMeta(media.width, media.height),
      },
    ]
  }

  const thumb = post.external?.thumb
  if (media.kind === 'none' && thumb && !post.thread?.parts.length) {
    return [
      {
        id: thumb,
        type: 'image',
        url: thumb,
        preview_url: thumb,
        remote_url: null,
        preview_remote_url: null,
        text_url: null,
        description: post.external!.title || null,
      },
    ]
  }

  return []
}

export interface ActivityOptions {
  id: string
  index?: number
  videoUrl?: string
  galleryUrl?: string
}

export function postDataToActivity(post: NormalizedPost, options: ActivityOptions): ActivityStatus {
  const profileUrl = `https://bsky.app/profile/${post.author.handle}`

  return {
    id: options.id,
    url: post.url,
    uri: post.url,
    created_at: post.createdAt,
    edited_at: null,
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    language: post.langs[0] ?? null,
    content: formatContent(post),
    spoiler_text: '',
    visibility: 'public',
    application: {
      name: 'Bluesky',
      website: 'https://bsky.app',
    },
    media_attachments: attachments(post, options),
    account: {
      id: post.author.did,
      display_name: post.author.displayName ?? post.author.handle,
      username: post.author.handle,
      acct: post.author.handle,
      url: profileUrl,
      uri: profileUrl,
      created_at: post.createdAt,
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      avatar: post.author.avatar,
      avatar_static: post.author.avatar,
      header: post.author.avatar,
      header_static: post.author.avatar,
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      hide_collections: false,
      noindex: false,
      emojis: [],
      roles: [],
      fields: [],
    },
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
  }
}
