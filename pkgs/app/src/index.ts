import { Hono } from 'hono'
import { Client, FetchHandlerObject } from '@atcute/client'
import { PasswordSession, PasswordSessionData, PasswordSessionOptions } from '@atcute/password-session'
import { getPost } from './routes/getPost'
import { getPostData } from './routes/getPostData'
import { getVideoQualities } from './routes/getVideoQualities'
import { getOEmbed } from './routes/getOEmbed'
import { getProfileData } from './routes/getProfileData'
import { getProfile } from './routes/getProfile'
import { getActivityStatus } from './routes/getActivityStatus'
import { getVideoBlob } from './routes/getVideoBlob'
import { parseFlags } from './lib/flags'
import { publicOrigin } from './lib/origin'
import { HTTPException } from 'hono/http-exception'
import { name, version } from '../package.json'

const app = new Hono<Env>()

const FLAG_DOMAINS = (appDomain: string) => [ appDomain, 'bskyx.app' ]

const NO_AGENT = new Set([ '/', '/json', '/oembed' ])

const PASSTHROUGH = (appDomain: string) => [ `api.${appDomain}` ]

app.use('*', async (c, next) => {
  if (PASSTHROUGH(c.env.VIXBLUESKY_APP_DOMAIN).includes(new URL(c.req.url).hostname)) {
    return fetch(c.req.raw)
  }
  const url = new URL(c.req.url)
  const domains = FLAG_DOMAINS(c.env.VIXBLUESKY_APP_DOMAIN)
  c.set('Flags', parseFlags(url, domains))
  c.set('Origin', publicOrigin(url, domains))
  return next()
})

const AUTH_ERRORS = new Set([ 'InvalidToken', 'ExpiredToken', 'AuthenticationRequired', 'AuthMissing' ])
async function isAuthFailure(res: Response): Promise<boolean> {
  if (res.status === 401)
    return true
  if (res.status !== 400)
    return false
  try {
    const body = await res.clone().json() as { error?: string }
    return AUTH_ERRORS.has(body.error ?? '')
  } catch {
    return false
  }
}

app.use('*', async (c, next) => {
  if (NO_AGENT.has(c.req.path) || c.req.path.startsWith('/video/'))
    return next()

  const options: PasswordSessionOptions = {
    onUpdate(session) {
      return c.env.sessions.put('session', JSON.stringify(session))
    },
    onDelete() {
      return c.env.sessions.delete('session')
    },
  }

  const login = async () => {
    const auth = await PasswordSession.login({
      service: c.env.BSKY_SERVICE_URL,
      identifier: c.env.BSKY_AUTH_USERNAME,
      password: c.env.BSKY_AUTH_PASSWORD,
    }, options)
    await c.env.sessions.put('session', JSON.stringify(auth.session))
    return auth
  }

  try {
    let stored: PasswordSession | undefined
    const rawSession = await c.env.sessions.get('session')
    if (rawSession) {
      const session = JSON.parse(rawSession) as Partial<PasswordSessionData>
      if (session.accessJwt && session.refreshJwt && session.did) {
        session.service ??= c.env.BSKY_SERVICE_URL
        stored = new PasswordSession(session as PasswordSessionData, options)
      }
    }

    if (!stored) {
      c.set('Agent', new Client({ handler: await login() }))
    } else {
      let session = stored
      const handler: FetchHandlerObject = {
        async handle(pathname, init) {
          try {
            const res = await session.handle(pathname, init)
            if (!(await isAuthFailure(res)))
              return res
          } catch { /* bwahh */ }
          session = await login()
          return session.handle(pathname, init)
        },
      }
      c.set('Agent', new Client({ handler }))
    }
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to login to Bluesky!',
      cause: error,
    })
  }
  return next()
})

app.get('/', (c) => c.redirect('https://github.com/Lexedia/VixBluesky'))
app.get('/json', (c) => c.json({
  name,
  version,
  repoUrl: 'https://github.com/Lexedia/VixBluesky',
}))

app.get('/api/v1/statuses/:id', getActivityStatus)
app.get('/users/:handle/statuses/:id', getActivityStatus)

app.get('/profile/:user/post/:post/json', getPostData)
app.get('/https://bsky.app/profile/:user/post/:post/json', getPostData)

app.get('/profile/:user/post/:post/qualities', getVideoQualities)
app.get('/https://bsky.app/profile/:user/post/:post/qualities', getVideoQualities)

app.get('/profile/:user/post/:post/:index/:lang', getPost)
app.get('/https://bsky.app/profile/:user/post/:post/:index/:lang', getPost)

app.get('/profile/:user/post/:post/:index?', getPost)
app.get('/https://bsky.app/profile/:user/post/:post/:index?', getPost)

app.get('/profile/:user', getProfile)
app.get('/https://bsky.app/profile/:user', getProfile)

app.get('/profile/:user/json', getProfileData)
app.get('/https://bsky.app/profile/:user/json', getProfileData)

app.get('/oembed', getOEmbed)

app.get('/video/:did/:cid', getVideoBlob)

export default app
