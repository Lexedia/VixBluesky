import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ClientResponseError } from '@atcute/client'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { fetchPost } from '../lib/fetchPostData'
import { normalizePost } from '../lib/normalizePost'
import { postDataToActivity } from '../lib/postDataToActivity'
import { videoUrl } from '../lib/resolvePds'
import { galleryUrl } from '../lib/media'
import { decodeStatusId, StatusPayload } from '../lib/statusId'
import { is } from '../lib/utils'

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

  let data
  try {
    data = await fetchPost(c.get('Agent'), { user: author, post: rkey, minimal: true })
  } catch (e) {
    if (e instanceof ClientResponseError && e.error === 'InvalidRequest') {
      return c.json({ error: 'Record not found' }, 404)
    }
    throw new HTTPException(500, { message: `Failed to fetch the post!\n${e}` })
  }

  if (!is('app.bsky.feed.defs#threadViewPost', data.thread)) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const parent = is('app.bsky.feed.defs#threadViewPost', data.thread.parent) ? data.thread.parent.post : undefined
  const post = normalizePost(data.thread.post, parent)

  const video = post.media.kind === 'video'
    ? await videoUrl(post.media, { videoApi: !!payload.videoApi }, c.env)
    : undefined
  const gallery = payload.gallery && post.media.kind === 'images'
    ? galleryUrl(c.env.VIXBLUESKY_API_URL, post.media.items)
    : undefined

  return c.json(postDataToActivity(post, {
    id, index, videoUrl: video, galleryUrl: gallery,
  }))
}
