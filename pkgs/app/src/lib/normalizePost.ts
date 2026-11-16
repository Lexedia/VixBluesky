import { AppBskyEmbedRecord, AppBskyEmbedRecordWithMedia, AppBskyFeedDefs } from '@atcute/bluesky'
import { is } from './utils'

export interface PostAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export interface ImageItem {
  fullsize: string
  thumb: string
  alt: string
  width?: number
  height?: number
}

export type PostMedia =
  | { kind: 'images'; items: ImageItem[] }
  | {
    kind: 'video';
    cid: string;
    did: string;
    playlist: string;
    thumb?: string;
    width?: number;
    height?: number;
    gif: boolean;
    alt?: string;
  }
  | { kind: 'none' }

export interface PostRef {
  author: PostAuthor
  text: string
  url: string
}

export interface ExternalCard {
  uri: string
  title: string
  description: string
  thumb?: string
}

export interface NormalizedPost {
  rkey: string
  url: string
  createdAt: string
  langs: string[]
  author: PostAuthor
  text: string
  reply?: PostRef
  quote?: PostRef
  external?: ExternalCard
  media: PostMedia
  stats: {
    replies: number; reposts: number; likes: number; quotes: number
  }
}

type Embed = AppBskyFeedDefs.PostView['embed']
type MediaCarrier =
  | Embed
  | AppBskyEmbedRecordWithMedia.View['media']
  | NonNullable<AppBskyEmbedRecord.ViewRecord['embeds']>[number]

const rkeyOf = (uri: string) => uri.split('/').pop() ?? ''

export const postUrl = (handle: string, uri: string) =>
  `https://bsky.app/profile/${handle}/post/${rkeyOf(uri)}`

const authorOf = (a: AppBskyFeedDefs.PostView['author']): PostAuthor => ({
  did: a.did,
  handle: a.handle,
  displayName: a.displayName || undefined,
  avatar: a.avatar,
})

function directMedia(embed: MediaCarrier, did: string): PostMedia | null {
  if (is('app.bsky.embed.images#view', embed) && embed.images.length) {
    return {
      kind: 'images',
      items: embed.images.map((img) => ({
        fullsize: img.fullsize,
        thumb: img.thumb,
        alt: img.alt,
        width: img.aspectRatio?.width,
        height: img.aspectRatio?.height,
      })),
    }
  }

  if (is('app.bsky.embed.gallery#view', embed) && embed.items.length) {
    return {
      kind: 'images',
      items: embed.items.map((img) => ({
        fullsize: img.fullsize,
        thumb: img.thumbnail,
        alt: img.alt,
        width: img.aspectRatio?.width,
        height: img.aspectRatio?.height,
      })),
    }
  }

  if (is('app.bsky.embed.video#view', embed)) {
    return {
      kind: 'video',
      cid: embed.cid,
      did,
      playlist: embed.playlist,
      thumb: embed.thumbnail,
      width: embed.aspectRatio?.width,
      height: embed.aspectRatio?.height,
      gif: embed.presentation === 'gif',
      alt: embed.alt,
    }
  }

  return null
}

function externalOf(embed: MediaCarrier): ExternalCard | undefined {
  if (!is('app.bsky.embed.external#view', embed))
    return undefined
  const {
    uri, title, description, thumb,
  } = embed.external
  return {
    uri, title, description, thumb,
  }
}

function quotedRecord(embed: Embed) {
  const record = is('app.bsky.embed.record#view', embed)
    ? embed.record
    : is('app.bsky.embed.recordWithMedia#view', embed)
      ? embed.record.record
      : undefined
  return is('app.bsky.embed.record#viewRecord', record) ? record : undefined
}

interface Extracted {
  media: PostMedia | null
  external?: ExternalCard
  quote?: PostRef
  quoteMedia: PostMedia | null
}

function extract(post: AppBskyFeedDefs.PostView): Extracted {
  const { embed } = post
  const did = post.author.did

  const own = is('app.bsky.embed.recordWithMedia#view', embed)
    ? directMedia(embed.media, did)
    : directMedia(embed, did)

  const external = externalOf(embed) ??
    (is('app.bsky.embed.recordWithMedia#view', embed) ? externalOf(embed.media) : undefined)

  const qr = quotedRecord(embed)
  let quote: PostRef | undefined
  let quoteMedia: PostMedia | null = null
  if (qr) {
    quote = {
      author: authorOf(qr.author),
      text: is('app.bsky.feed.post', qr.value) ? qr.value.text : '',
      url: postUrl(qr.author.handle, qr.uri),
    }
    for (const e of qr.embeds ?? []) {
      const inner = is('app.bsky.embed.recordWithMedia#view', e) ? e.media : e
      quoteMedia = directMedia(inner, qr.author.did)
      if (quoteMedia)
        break
    }
  }

  return {
    media: own, external, quote, quoteMedia,
  }
}

export function normalizePost(
  post: AppBskyFeedDefs.PostView,
  parent?: AppBskyFeedDefs.PostView,
): NormalizedPost {
  const record = is('app.bsky.feed.post', post.record) ? post.record : undefined
  const {
    media, external, quote, quoteMedia,
  } = extract(post)

  let reply: PostRef | undefined
  let parentMedia: PostMedia | null = null
  if (parent) {
    reply = {
      author: authorOf(parent.author),
      text: is('app.bsky.feed.post', parent.record) ? parent.record.text : '',
      url: postUrl(parent.author.handle, parent.uri),
    }
    const p = extract(parent)
    parentMedia = p.media ?? p.quoteMedia
  }

  return {
    rkey: rkeyOf(post.uri),
    url: postUrl(post.author.handle, post.uri),
    createdAt: record?.createdAt ?? post.indexedAt,
    langs: record?.langs ?? [],
    author: authorOf(post.author),
    text: record?.text ?? '',
    reply,
    quote,
    external,
    media: media ?? quoteMedia ?? parentMedia ?? { kind: 'none' },
    stats: {
      replies: post.replyCount ?? 0,
      reposts: post.repostCount ?? 0,
      likes: post.likeCount ?? 0,
      quotes: post.quoteCount ?? 0,
    },
  }
}
