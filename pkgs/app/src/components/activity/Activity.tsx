import { Layout } from '../Layout'
import { OEmbedTypes } from '../../routes/getOEmbed'
import { NormalizedPost } from '../../lib/normalizePost'
import { describe } from '../Post'

interface ActivityProps {
  post: NormalizedPost;
  url: string;
  origin: string;
  statusId: string;
}

export const Activity = ({
  post, url, origin, statusId,
}: ActivityProps) => {
  const title = post.author.displayName
    ? `${post.author.displayName} (@${post.author.handle})`
    : `@${post.author.handle}`

  return (
    <Layout url={url}>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      <meta property="twitter:title" content={title} />
      <meta property="og:description" content={describe(post)} />
      <meta property="article:published_time" content={post.createdAt} />
      <meta property="twitter:card" content="undefined" />
      <meta property="twitter:image" content="0" />

      <link
        rel="alternate"
        type="application/json+oembed"
        href={`${origin}/oembed?type=${OEmbedTypes.Activity}`}
      />
      <link
        rel="alternate"
        type="application/activity+json"
        href={`${origin}/users/${post.author.handle}/statuses/${statusId}`}
      />
    </Layout>
  )
}
