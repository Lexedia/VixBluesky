/** @jsx jsx */
import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchProfile } from '../lib/fetchProfile'

export const getProfileData: Handler<
  Env,
  '/profile/:user/json' | '/https://bsky.app/profile/:user/json'
> = async (c) => {
  const { user } = c.req.param()
  const agent = c.get('Agent')
  try {
    // eslint-disable-next-line no-var
    var { data } = await fetchProfile(agent, { user })
  } catch (e) {
    throw new HTTPException(500, {
      message: `Failed to fetch the profile!\n${e}`,
    })
  }

  return c.json(data)
}
