import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchPost } from '../lib/fetchPostData'
import { isActorIdentifier } from '@atcute/lexicons/syntax'

export const getPostData: Handler<
  Env,
  | '/profile/:user/post/:post/json'
  | '/https://bsky.app/profile/:user/post/:post/json'
> = async (c) => {
  const { user, post } = c.req.param()

  if (!isActorIdentifier(user)) {
    throw new HTTPException(400, { message: 'Invalid user' })
  }

  const agent = c.get('Agent')
  try {
    // eslint-disable-next-line no-var
    var data = await fetchPost(agent, {
      user,
      post,
    })
  } catch (e) {
    throw new HTTPException(500, {
      message: `Failed to fetch the post!\n${e}`,
    })
  }

  return c.json(data)
}
