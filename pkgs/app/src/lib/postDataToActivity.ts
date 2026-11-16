import { NormalizedPost, PostAuthor } from './normalizePost'

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

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  })[ch]!)

const paragraphs = (text: string) => escapeHtml(text).replace(/\n/g, '<br>')

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

function formatContent(post: NormalizedPost): string {
  let content = ''

  if (post.reply) {
    content += `<p>↪ <i>Replying to <a href="${escapeHtml(post.reply.url)}">@${escapeHtml(post.reply.author.handle)}</a></i></p>`
  }

  if (post.text)
    content += `<p>${paragraphs(post.text)}</p>`

  if (post.quote) {
    content += `<blockquote><b><a href="${escapeHtml(post.quote.url)}">${nameOf(post.quote.author)}</a></b>` +
      (post.quote.text ? `<br>${paragraphs(post.quote.text)}` : '') +
      '</blockquote>'
  }

  if (post.external && (post.external.title || post.external.description)) {
    content += `<p><b><a href="${escapeHtml(post.external.uri)}">${escapeHtml(post.external.title || post.external.uri)}</a></b>` +
      (post.external.description ? `<br>${paragraphs(post.external.description)}` : '') +
      '</p>'
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

  if (media.kind === 'images') {
    const items = index !== undefined && media.items[index] ? [ media.items[index] ] : media.items
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
