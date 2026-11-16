import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { loadPost } from '../lib/thread'
import { renditionUrl, sourceVideoUrl } from '../lib/resolvePds'
import { fetchRenditions } from '../lib/video'

export const getVideoQualities: Handler<
  Env,
  '/profile/:user/post/:post/qualities' | '/https://bsky.app/profile/:user/post/:post/qualities'
> = async (c) => {
  const { user } = c.req.param()
  const rkey = c.req.param('post').replaceAll('|', '')
  if (!isActorIdentifier(user))
    return c.json({ error: 'Invalid user' }, 400)

  let post
  try {
    post = await loadPost(c.get('Agent'), { user, post: rkey })
  } catch (e) {
    throw new HTTPException(500, { message: `Failed to fetch the post!\n${e}` })
  }
  if (!post)
    return c.json({ error: 'Post not found' }, 404)
  if (post.media.kind !== 'video')
    return c.json({ error: 'This post has no video' }, 404)

  const video = post.media
  const embedLink = (quality: string) =>
    `${c.get('Origin')}/profile/${post.author.handle}/post/${post.rkey}?quality=${quality}`
  const renditions = await fetchRenditions(video.did, video.cid)

  return c.json({
    post: post.url,
    source: {
      quality: 'source',
      width: video.width ?? null,
      height: video.height ?? null,
      url: await sourceVideoUrl(video, c.env),
      embed: embedLink('source'),
    },
    renditions: renditions.map((r) => ({
      quality: r.quality,
      width: r.width ?? null,
      height: r.height,
      bandwidth: r.bandwidth ?? null,
      url: renditionUrl(video, r.quality, c.env),
      embed: embedLink(r.quality),
    })),
  })
}
