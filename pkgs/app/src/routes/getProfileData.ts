/** @jsx jsx */
import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchProfile } from '../lib/fetchProfile'
import { isActorIdentifier } from '@atcute/lexicons/syntax'
import { ClientResponseError } from '@atcute/client'

export const getProfileData: Handler<
  Env,
  '/profile/:user/json' | '/https://bsky.app/profile/:user/json'
> = async (c) => {
  const { user } = c.req.param()

  if (!isActorIdentifier(user)) {
    return c.json({ message: 'Invalid user' }, 400)
  }

  const agent = c.get('Agent')
  try {
    // eslint-disable-next-line no-var
    var data = await fetchProfile(agent, { user })
  } catch (e) {
    if (e instanceof ClientResponseError) {
      if (e.error == 'InvalidRequest') {
        return c.json({ message: 'Profile not found' }, 404)
      }
    }

    throw new HTTPException(500, {
      message: `Failed to fetch the profile!\n${e}`,
    })
  }

  return c.json(data)
}
