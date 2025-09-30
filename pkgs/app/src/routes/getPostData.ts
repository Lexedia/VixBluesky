import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchPost } from '../lib/fetchPostData'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { ClientResponseError } from '@atcute/client'

export const getPostData: Handler<
  Env,
  | '/profile/:user/post/:post/json'
  | '/https://bsky.app/profile/:user/post/:post/json'
> = async (c) => {
  const { user, post } = c.req.param()

  if (!isActorIdentifier(user)) {
    return c.json({ message: 'Invalid user' }, 400)
  }

  const agent = c.get('Agent')
  try {
    // eslint-disable-next-line no-var
    var data = await fetchPost(agent, {
      user,
      post,
    })
  } catch (e) {
    if (e instanceof ClientResponseError) {
      if (e.error == 'InvalidRequest') {
        return c.json({ message: 'Post not found' }, 404)
      }
    }

    throw new HTTPException(500, {
      message: `Failed to fetch the post!\n${e}`,
    })
  }

  return c.json(data)
}
