import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { loadPost } from '../lib/thread'
import { videoUrl } from '../lib/resolvePds'
import { parseQuality } from '../lib/video'
import { galleryUrl } from '../lib/media'
import { encodeStatusId } from '../lib/statusId'
import { threadComponentEmbed } from '../lib/componentEmbed'
import { ThreadComponents } from '../components/activity/ThreadComponents'
import { Post } from '../components/Post'
import { Activity } from '../components/activity/Activity'
import { NotFound } from '../components/NotFound'
import { isDiscord, isTelegram } from '../lib/utils'

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
  const quality = parseQuality(c.req.query('quality'))
  const videoFlags = { ...flags, quality }

  let post
  try {
    post = await loadPost(c.get('Agent'), { user, post: rkey }, { reader: flags.thread })
  } catch (e) {
    throw new HTTPException(500, { message: `Failed to fetch the post!\n${e}` })
  }

  if (!post) {
    return c.html(<NotFound url={c.req.path} type='post' />)
  }

  const idx = index !== undefined && /^\d+$/.test(index) ? +index : undefined
  const video = post.media.kind === 'video' ? await videoUrl(post.media, videoFlags, c.env) : undefined
  const gallery = flags.gallery && post.media.kind === 'images' ? galleryUrl(c.env, post.media.items) : undefined

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
    if (post.thread?.parts.length) {
      const posts = [ post, ...post.thread.parts ]
      const videoUrls = new Map<string, string>()
      await Promise.all(posts.map(async (p) => {
        if (p.media.kind === 'video')
          videoUrls.set(p.rkey, await videoUrl(p.media, videoFlags, c.env))
      }))
      const embed = threadComponentEmbed(post, { videoUrls })
      if (embed)
        return c.html(<ThreadComponents post={post} url={url} embed={embed} />)
    }

    const statusId = encodeStatusId({
      author: post.author.did,
      rkey: post.rkey,
      index: idx !== undefined && idx <= 0xFF ? idx : undefined,
      gallery: flags.gallery,
      videoApi: flags.videoApi,
      thread: flags.thread,
      quality,
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
      stats={isTelegram(c.req.header('user-agent'))}
    />,
  )
}
