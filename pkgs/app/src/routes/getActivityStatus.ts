import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { loadPost } from '../lib/thread'
import { postDataToActivity } from '../lib/postDataToActivity'
import { videoUrl } from '../lib/resolvePds'
import { galleryUrl } from '../lib/media'
import { decodeStatusId, StatusPayload } from '../lib/statusId'

export const getActivityStatus: Handler<
  Env,
  '/api/v1/statuses/:id' | '/users/:handle/statuses/:id'
> = async (c) => {
  const id = c.req.param('id')

  let payload: StatusPayload
  try {
    payload = decodeStatusId(id)
  } catch {
    return c.json({ error: 'Invalid status id' }, 400)
  }

  const { author, rkey, index } = payload
  if (!isActorIdentifier(author)) {
    return c.json({ error: 'Invalid status id' }, 400)
  }

  let post
  try {
    post = await loadPost(c.get('Agent'), { user: author, post: rkey }, { reader: !!payload.thread })
  } catch (e) {
    throw new HTTPException(500, { message: `Failed to fetch the post!\n${e}` })
  }

  if (!post) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const video = post.media.kind === 'video'
    ? await videoUrl(post.media, { videoApi: !!payload.videoApi }, c.env)
    : undefined
  const gallery = payload.gallery && post.media.kind === 'images'
    ? galleryUrl(c.env, post.media.items)
    : undefined

  return c.json(postDataToActivity(post, {
    id, index, videoUrl: video, galleryUrl: gallery,
  }))
}
