import { Handler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { fetchProfile } from '../lib/fetchProfile'
import { Profile } from '../components/Profile'
import { isActorIdentifier } from '@atcute/lexicons/syntax'

export const getProfile: Handler<
  Env,
  '/profile/:user' | '/https://bsky.app/profile/:user'
> = async (c) => {
  let { user } = c.req.param()
  user = user.replaceAll('|', '')
  const agent = c.get('Agent')

  if (!isActorIdentifier(user)) {
    throw new HTTPException(400, { message: 'Invalid user' })
  }

  try {
    // eslint-disable-next-line no-var
    var data = await fetchProfile(agent, { user })
  } catch (e) {
    throw new HTTPException(500, {
      message: `Failed to fetch the profile!\n${e}`,
    })
  }

  return c.html(
    <Profile
      profile={data}
      url={c.req.path}
      appDomain={c.env.VIXBLUESKY_APP_DOMAIN}
    />,
  )
}
