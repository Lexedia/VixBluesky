import { Layout } from './Layout'
import { OEmbedTypes } from '../routes/getOEmbed'
import { parseEmbedDescription } from '../lib/parseEmbedDescription'
import { is, Platform } from '../lib/utils'
import { VideoInfo } from '../routes/getPost'
import { AppBskyEmbedImages, AppBskyFeedDefs } from '@atcute/client/lexicons'

interface PostProps {
  post: AppBskyFeedDefs.PostView;
  url: string;
  appDomain: string;
  videoMetadata?: VideoInfo;
  apiUrl: string;
  images: string | AppBskyEmbedImages.ViewImage[];
  platform: Platform;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Meta = ({ post }: { post: AppBskyFeedDefs.PostView }) => (
  <>
    <meta name="twitter:card" content="summary_large_image" />
  </>
)

type PlatformProps = PostProps & {
  description: string;
  isAuthor: boolean;
  isVideo: boolean;
}

const BaseTags = ({
  appDomain,
  post,
  description,
  apiUrl,
  isVideo,
  videoMetadata,
  platform,
}: PlatformProps) => (
  <>
    <meta property="description" content={description} />
    <meta property="og:description" content={description} />
    <meta
      property="og:title"
      content={`${post.author.displayName ?? ''} (@${post.author.handle})`}
    />

    {isVideo && (
      <Video
        apiUrl={apiUrl}
        appDomain={appDomain}
        description={description}
        platform={platform}
        post={post}
        videoMetadata={videoMetadata!}
      />
    )}

    {!isVideo && platform === Platform.discord && (
      <link
        rel="alternate"
        type="application/json+oembed"
        href={`https:/${appDomain}/oembed?type=${OEmbedTypes.Post}&replies=${
          post.replyCount
        }&reposts=${post.repostCount}&likes=${
          post.likeCount
        }&avatar=${encodeURIComponent(
          post.author.avatar ?? '',
        )}&description=${encodeURIComponent(description)}`}
      />
    )}
  </>
)

const DiscordTags = (props: PlatformProps) => {
  const {
    url, post, isAuthor, images, isVideo,
  } = props
  return (
    <Layout url={url}>
      <BaseTags {...props} />
      <meta name="twitter:creator" content={`@${post.author.handle}`} />
      <meta
        property="twitter:title"
        content={`${post.author.displayName ?? ''} (@${post.author.handle})`}
      />
      <meta property="og:updated_time" content={post.indexedAt} />
      <meta property="article:published_time" content={post.indexedAt} />

      {!isAuthor && <Meta post={post} />}
      {images.length !== 0 && !isVideo && <Images images={images} />}
    </Layout>
  )
}

const TelegramTags = (props: PlatformProps) => {
  const { url, images } = props

  return (
    <Layout url={url}>
      <BaseTags {...props} />
      {typeof images === 'string' ? (
        <meta property="og:image" content={images} />
      ) : (
        <meta property="og:image" content={images[1].fullsize} />
      )}
    </Layout>
  )
}

const VideoDiscord = ({
  url,
  videoMetadata,
}: {
  url: string;
  videoMetadata: VideoInfo;
}) => (
  <>
    <meta property="twitter:card" content="player" />
    <meta property="twitter:player" content={url} />
    <meta property="twitter:player:stream" content={url} />
    <meta
      property="twitter:player:width"
      content={videoMetadata.aspectRatio.width.toString()}
    />
    <meta
      property="twitter:player:height"
      content={videoMetadata.aspectRatio.height.toString()}
    />
  </>
)

const Video = ({
  videoMetadata,
  appDomain,
  post,
  description,
  platform,
}: {
  videoMetadata: VideoInfo;
  apiUrl: string;
  appDomain: string;
  post: AppBskyFeedDefs.PostView;
  description: string;
  platform: Platform;
}) => {
  const url = videoMetadata.url.toString()

  const isDiscord = platform === Platform.discord

  return (
    <>
      <meta property="og:type" content="video.other" />
      <meta property="og:video" content={url} />
      <meta property="og:video:secure_url" content={url} />
      <meta property="og:video:type" content="video/mp4" />
      <meta
        property="og:video:width"
        content={videoMetadata.aspectRatio.width.toString()}
      />
      <meta
        property="og:video:height"
        content={videoMetadata.aspectRatio.height.toString()}
      />

      {isDiscord && <VideoDiscord url={url} videoMetadata={videoMetadata} />}

      {isDiscord && (
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
      )}
    </>
  )
}

const Images = ({
  images,
}: {
  images: AppBskyEmbedImages.ViewImage[] | string;
}) => (
  <>
    {typeof images === 'string' ? (
      <>
        <meta property="og:image" content={images} />
        <meta property="twitter:image" content={images} />
      </>
    ) : (
      images.map((img, i) => (
        <>
          <meta property="og:image" content={img.fullsize} />(
          {i === 0 && <meta property="twitter:image" content={img.fullsize} />})
        </>
      ))
    )}
  </>
)

export const Post = (props: PostProps) => {
  const { post, platform, images } = props
  const isAuthor = images === post.author.avatar
  const description = parseEmbedDescription(post)
  const isVideo = is('app.bsky.embed.video#view', post.embed)
  const isDiscord = platform === Platform.discord

  return isDiscord ? (
    <DiscordTags
      {...props}
      isVideo={isVideo}
      isAuthor={isAuthor}
      description={description}
    />
  ) : (
    <TelegramTags
      {...props}
      isAuthor={isAuthor}
      isVideo={isVideo}
      description={description}
    />
  )
}
