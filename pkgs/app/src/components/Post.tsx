import { Layout } from './Layout'
import { OEmbedTypes } from '../routes/getOEmbed'
import { NormalizedPost, PostAuthor } from '../lib/normalizePost'
import { indent } from '../lib/utils'

export interface PostProps {
  post: NormalizedPost;
  url: string;
  origin: string;
  index?: number;
  videoUrl?: string;
  galleryUrl?: string;
}

const nameOf = (a: PostAuthor) =>
  a.displayName ? `${a.displayName} (@${a.handle})` : `@${a.handle}`

export function describe(post: NormalizedPost): string {
  const parts: string[] = []
  if (post.text)
    parts.push(post.text)
  if (post.quote) {
    parts.push(`Quoting ${nameOf(post.quote.author)}\n➥${indent(post.quote.text, 2)}`)
  }
  if (post.external && (post.external.title || post.external.description)) {
    parts.push([ post.external.title, post.external.description ].filter(Boolean).join('\n'))
  }
  if (post.reply && !post.thread)
    parts.push(`↪ Replying to @${post.reply.author.handle}`)
  return parts.join('\n\n')
}

const oembedHref = (origin: string, type: OEmbedTypes, post: NormalizedPost, description: string) =>
  `${origin}/oembed?${new URLSearchParams({
    type: String(type),
    replies: String(post.stats.replies),
    reposts: String(post.stats.reposts),
    likes: String(post.stats.likes),
    avatar: post.author.avatar ?? '',
    description,
  })}`

const Video = ({ url, width, height }: { url: string; width?: number; height?: number }) => {
  const w = String(width ?? 0)
  const h = String(height ?? 0)
  return (
    <>
      <meta property="twitter:card" content="player" />
      <meta property="twitter:player" content={url} />
      <meta property="twitter:player:stream" content={url} />
      <meta property="twitter:player:width" content={w} />
      <meta property="twitter:player:height" content={h} />
      <meta property="og:type" content="video.other" />
      <meta property="og:video" content={url} />
      <meta property="og:video:secure_url" content={url} />
      <meta property="og:video:type" content="video/mp4" />
      <meta property="og:video:width" content={w} />
      <meta property="og:video:height" content={h} />
    </>
  )
}

const Images = ({ urls }: { urls: string[] }) => (
  <>
    <meta name="twitter:card" content="summary_large_image" />
    {urls.map((url, i) => (
      <>
        <meta property="og:image" content={url} />
        {i === 0 && <meta property="twitter:image" content={url} />}
      </>
    ))}
  </>
)

function imageUrls(post: NormalizedPost, index?: number, gallery?: string): string[] {
  const { media } = post
  if (media.kind === 'images') {
    if (index !== undefined && media.items[index])
      return [ media.items[index].fullsize ]
    if (gallery)
      return [ gallery ]
    return media.items.map((img) => img.fullsize)
  }
  if (post.external?.thumb)
    return [ post.external.thumb ]
  return []
}

export const Post = ({
  post, url, origin, index, videoUrl, galleryUrl,
}: PostProps) => {
  const description = describe(post)
  const title = nameOf(post.author)
  const isVideo = post.media.kind === 'video' && videoUrl !== undefined
  const images = isVideo ? [] : imageUrls(post, index, galleryUrl)

  return (
    <Layout url={url}>
      <meta name="twitter:creator" content={`@${post.author.handle}`} />
      <meta property="og:description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="twitter:title" content={title} />
      <meta property="og:updated_time" content={post.createdAt} />
      <meta property="article:published_time" content={post.createdAt} />

      {isVideo && post.media.kind === 'video' && (
        <Video url={videoUrl!} width={post.media.width} height={post.media.height} />
      )}

      {images.length !== 0 && <Images urls={images} />}

      {images.length === 0 && !isVideo && post.author.avatar && (
        <meta property="og:image" content={post.author.avatar} />
      )}

      <link
        rel="alternate"
        type="application/json+oembed"
        href={oembedHref(origin, isVideo ? OEmbedTypes.Video : OEmbedTypes.Post, post, description)}
      />
    </Layout>
  )
}
