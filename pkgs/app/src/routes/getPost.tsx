import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchPost } from '../lib/fetchPostData'
import { Post } from '../components/Post'
import { parseEmbedImages } from '../lib/parseEmbedImages'
import { is } from '../lib/utils'

export interface VideoInfo {
  url: URL;
  aspectRatio: {
    width: number;
    height: number;
  };
}

export const getPost: Handler<
  Env,
  | '/profile/:user/post/:post/:index?'
  | '/https://bsky.app/profile/:user/post/:post/:index?'
> = async (c) => {
  // eslint-disable-next-line prefer-const
  let { user, post, index = '0' } = c.req.param()
  post = post.replaceAll('|', '')
  const idx = Number.isNaN(+index) ? 0 : +index
  const isDirect = c.req.query('direct') === 'true'
  const isGalleryView = c.req.query('gallery') === 'true'
  const useVideoApi = c.req.query('video_api') === 'true'

  const agent = c.get('Agent')
  try {
    // eslint-disable-next-line no-var
    var { data } = await fetchPost(agent, {
      user,
      post,
    })
  } catch (e) {
    throw new HTTPException(500, {
      message: `Failed to fetch the post!\n${e}`,
    })
  }

  const fetchedPost = data.posts[0]

  const images = parseEmbedImages(fetchedPost)

  // if the image is already a string, that means it's a user avatar, an external media or an embed thumbnail, there's no need to use the gallery view
  const imgs = isGalleryView
    ? typeof images === 'string'
      ? images
      : `${c.env.VIXBLUESKY_API_URL}images/png/${images
        .map((img, i) =>
          img.fullsize
            .split('/')
            .slice(i === 0 ? -2 : -1)
            .join('/')
            .replaceAll('@jpeg', ''),
        )
        .join('/')}`
    : images

  let videoMetaData: VideoInfo | undefined

  const embed = fetchedPost.embed

  if (
    is('app.bsky.embed.video#view', embed)
  ) {
    const url = useVideoApi
      ? `${c.env.VIXBLUESKY_API_URL}video/720p/${fetchedPost.author.did}/${embed.cid}`
      : `https://bsky.social/xrpc/com.atproto.sync.getBlob?cid=${embed.cid}&did=${fetchedPost.author.did}`

    videoMetaData = {
      url: new URL(url),
      aspectRatio: embed.aspectRatio ?? { height: 0, width: 0 },
    }
  }

  if (!isDirect) {
    return c.html(
      <Post
        post={fetchedPost}
        url={c.req.path}
        appDomain={c.env.VIXBLUESKY_APP_DOMAIN}
        videoMetadata={videoMetaData}
        apiUrl={c.env.VIXBLUESKY_API_URL}
        images={imgs}
      />,
    )
  }

  // video should always take precedence over images.
  if (videoMetaData) {
    return c.redirect(videoMetaData.url.toString())
  }

  if (Array.isArray(imgs) && imgs.length !== 0) {
    const url = imgs[idx].fullsize
    return c.redirect(url)
  }

  if (typeof imgs === 'string') {
    return c.redirect(imgs)
  }
}
