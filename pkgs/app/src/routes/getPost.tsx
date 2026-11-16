import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ClientResponseError } from '@atcute/client'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { fetchPost } from '../lib/fetchPostData'
import { normalizePost } from '../lib/normalizePost'
import { videoUrl } from '../lib/resolvePds'
import { galleryUrl } from '../lib/media'
import { encodeStatusId } from '../lib/statusId'
import { is } from '../lib/utils'
import { Post } from '../components/Post'
import { Activity } from '../components/activity/Activity'
import { NotFound } from '../components/NotFound'

const isDiscord = (ua: string | undefined) => !!ua && /Discordbot/i.test(ua)

export const getPost: Handler<
  Env,
  | '/profile/:user/post/:post/:index?'
  | '/https://bsky.app/profile/:user/post/:post/:index?'
> = async (c) => {
  const { user, index } = c.req.param()
  const rkey = c.req.param('post').replaceAll('|', '')

  if (!isActorIdentifier(user)) {
    throw new HTTPException(400, { message: 'Invalid user' })
  }

  const flags = c.get('Flags')

  let data
  try {
    data = await fetchPost(c.get('Agent'), { user, post: rkey, minimal: true })
  } catch (e) {
    if (e instanceof ClientResponseError && e.error === 'InvalidRequest') {
      return c.html(<NotFound url={c.req.path} type='post' />)
    }
    throw new HTTPException(500, { message: `Failed to fetch the post!\n${e}` })
  }

  if (!is('app.bsky.feed.defs#threadViewPost', data.thread)) {
    return c.html(<NotFound url={c.req.path} type='post' />)
  }

  const parent = is('app.bsky.feed.defs#threadViewPost', data.thread.parent) ? data.thread.parent.post : undefined
  const post = normalizePost(data.thread.post, parent)

  const idx = index !== undefined && /^\d+$/.test(index) ? +index : undefined
  const video = post.media.kind === 'video' ? await videoUrl(post.media, flags, c.env) : undefined
  const gallery = flags.gallery && post.media.kind === 'images' ? galleryUrl(c.env.VIXBLUESKY_API_URL, post.media.items) : undefined

  if (flags.direct) {
    if (video)
      return c.redirect(video)
    if (post.media.kind === 'images') {
      const img = idx !== undefined ? post.media.items[idx] : undefined
      return c.redirect(img?.fullsize ?? gallery ?? post.media.items[0].fullsize)
    }
    const fallback = post.external?.thumb ?? post.external?.uri ?? post.author.avatar
    return c.redirect(fallback ?? post.url)
  }

  const url = idx !== undefined ? c.req.path.replace(new RegExp(`/${index}$`), '') : c.req.path

  if (!flags.legacy && isDiscord(c.req.header('user-agent'))) {
    const statusId = encodeStatusId({
      author: post.author.did,
      rkey: post.rkey,
      index: idx !== undefined && idx <= 0xFF ? idx : undefined,
      gallery: flags.gallery,
      videoApi: flags.videoApi,
    })
    return c.html(<Activity post={post} url={url} origin={c.get('Origin')} statusId={statusId} />)
  }

  return c.html(
    <Post
      post={post}
      url={url}
      origin={c.get('Origin')}
      index={idx}
      videoUrl={video}
      galleryUrl={gallery}
    />,
  )
}
