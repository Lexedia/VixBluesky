import { Layout } from './Layout'
import { OEmbedTypes } from '../routes/getOEmbed'
import { parseEmbedDescription } from '../lib/parseEmbedDescription'
import { is } from '../lib/utils'
import { VideoInfo } from '../routes/getPost'
import { AppBskyEmbedImages, AppBskyFeedDefs } from '@atcute/bluesky'

interface PostProps {
  post: AppBskyFeedDefs.PostView;
  url: string;
  appDomain: string;
  videoMetadata?: VideoInfo;
  apiUrl: string;
  images: string | AppBskyEmbedImages.ViewImage[];
  index?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Meta = ({ post }: { post: AppBskyFeedDefs.PostView }) => (
  <>
    <meta name="twitter:card" content="summary_large_image" />
  </>
)

const Video = ({
  streamInfo,
  appDomain,
  post,
  description,
}: {
  streamInfo: VideoInfo;
  apiUrl: string;
  appDomain: string;
  post: AppBskyFeedDefs.PostView;
  description: string;
}) => {
  const url = streamInfo.url.toString()

  return (
    <>
      <meta property="twitter:card" content="player" />
      <meta property="twitter:player" content={url} />
      <meta property="twitter:player:stream" content={url} />
      <meta property="og:type" content="video.other" />
      <meta property="og:video" content={url} />
      <meta property="og:video:secure_url" content={url} />
      <meta property="og:video:type" content="video/mp4" />
      <meta
        property="og:video:width"
        content={streamInfo.aspectRatio.width.toString()}
      />
      <meta
        property="og:video:height"
        content={streamInfo.aspectRatio.height.toString()}
      />
      <meta
        property="twitter:player:width"
        content={streamInfo.aspectRatio.width.toString()}
      />
      <meta
        property="twitter:player:height"
        content={streamInfo.aspectRatio.height.toString()}
      />

      <link
        rel="alternate"
        type="application/json+oembed"
        href={`https:/${appDomain}/oembed?type=${OEmbedTypes.Video}&replies=${
          post.replyCount
        }&reposts=${post.repostCount}&likes=${
          post.likeCount
        }&avatar=${encodeURIComponent(
          post.author.avatar ?? '',
        )}&description=${encodeURIComponent(description)}`}
      />
    </>
  )
}

const Images = ({
  images,
  index,
}: {
  images: AppBskyEmbedImages.ViewImage[] | string;
  index?: number;
}) => (
  <>
    {typeof images === 'string' ?
      <>
        <meta property="og:image" content={images} />
        <meta property="twitter:image" content={images} />
      </>
      : index !== undefined ?
        <>
          <meta property="og:image" content={images[index].fullsize} />
          <meta property="twitter:image" content={images[index].fullsize} />
        </> :
        images.map((img, i) => (
          <>
            <meta property="og:image" content={img.fullsize} />
            {i === 0 && <meta property="twitter:image" content={img.fullsize} />}
          </>
        ))
    }
  </>
)

export const Post = ({
  post,
  url,
  appDomain,
  videoMetadata,
  apiUrl,
  images,
  index,
}: PostProps) => {
  const isAuthor = images === post.author.avatar
  const description = parseEmbedDescription(post)
  const isVideo = is('app.bsky.embed.video#view', post.embed) ||
    (is('app.bsky.embed.recordWithMedia#view', post.embed) && is('app.bsky.embed.video#view', post.embed.media))

  return (
    <Layout url={url}>
      <meta name="twitter:creator" content={`@${post.author.handle}`} />
      <meta property="og:description" content={description} />
      <meta
        property="og:title"
        content={`${post.author.displayName} (@${post.author.handle})`}
      />
      <meta
        property="twitter:title"
        content={`${post.author.displayName} (@${post.author.handle})`}
      />
      <meta property="og:updated_time" content={post.indexedAt} />
      <meta property="article:published_time" content={post.indexedAt} />

      {!isAuthor && <Meta post={post} />}

      {images.length !== 0 && !isVideo && <Images index={index} images={images} />}

      {isVideo && (
        <Video
          apiUrl={apiUrl}
          streamInfo={videoMetadata!}
          appDomain={appDomain}
          description={description}
          post={post}
        />
      )}

      {!isVideo && (
        <link
          rel="alternate"
          type="application/json+oembed"
          href={`https:/${appDomain}/oembed?type=${OEmbedTypes.Post}&replies=${post.replyCount
          }&reposts=${post.repostCount}&likes=${post.likeCount
          }&avatar=${encodeURIComponent(
            post.author.avatar ?? '',
          )}&description=${encodeURIComponent(description)}`}
        />
      )}
    </Layout>
  )
}
