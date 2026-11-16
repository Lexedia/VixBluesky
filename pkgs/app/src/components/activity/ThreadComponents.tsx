import { raw } from 'hono/html'
import { Layout } from '../Layout'
import { describe } from '../Post'
import { NormalizedPost } from '../../lib/normalizePost'
import { ComponentEmbed, serializeEmbed } from '../../lib/componentEmbed'

interface ThreadComponentsProps {
  post: NormalizedPost;
  url: string;
  embed: ComponentEmbed;
}

export const ThreadComponents = ({ post, url, embed }: ThreadComponentsProps) => {
  const title = post.author.displayName
    ? `${post.author.displayName} (@${post.author.handle})`
    : `@${post.author.handle}`
  const image = post.media.kind === 'images' ? post.media.items[0]?.fullsize : post.author.avatar

  return (
    <Layout url={url}>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      <meta property="og:description" content={describe(post)} />
      <meta property="og:type" content="article" />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={post.media.kind === 'images' ? 'summary_large_image' : 'summary'} />
      {raw(`<script type="application/json" id="discord:component-embed">${serializeEmbed(embed)}</script>`)}
    </Layout>
  )
}
