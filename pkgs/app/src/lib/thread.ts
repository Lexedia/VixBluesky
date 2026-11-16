import { AppBskyUnspeccedGetPostThreadV2 } from '@atcute/bluesky'
import { Client, ClientResponseError, ok } from '@atcute/client'
import { ActorIdentifier } from '@atcute/lexicons'
import { isDid } from '@atcute/lexicons/syntax'
import { fetchPost } from './fetchPostData'
import { fetchProfile } from './fetchProfile'
import { NormalizedPost, normalizePost, postUrl } from './normalizePost'
import { is } from './utils'

export const READER_BELOW = 20

type ThreadItem = AppBskyUnspeccedGetPostThreadV2.ThreadItem

const postOf = (item: ThreadItem | undefined) =>
  item && is('app.bsky.unspecced.defs#threadItemPost', item.value) ? item.value : undefined

export interface LoadOptions {
  reader?: boolean
}

export function normalizeThread(items: ThreadItem[], { reader = false }: LoadOptions = {}): NormalizedPost | null {
  const anchorItem = items.find((it) => it.depth === 0)
  const anchor = postOf(anchorItem)
  if (!anchor)
    return null

  const parent = postOf(items.find((it) => it.depth === -1))?.post
  const count = anchor.opThreadPostCount ?? 1

  if (!anchor.opThread || count <= 1) {
    return normalizePost(anchor.post, parent)
  }

  const ops = items
    .filter((it) => postOf(it)?.opThread)
    .sort((a, b) => a.depth - b.depth)
  const above = ops.filter((it) => it.depth < 0)

  const below: ThreadItem[] = []
  for (const it of ops) {
    if (it.depth === below.length + 1)
      below.push(it)
  }

  const rootItem = above[0] ?? anchorItem!
  const rootPost = postOf(rootItem)!.post
  const rootUrl = postUrl(rootPost.author.handle, rootPost.uri)
  const toPost = (it: ThreadItem) => normalizePost(postOf(it)!.post)

  let main: NormalizedPost
  let parts: NormalizedPost[]
  let index: number
  if (reader) {
    main = normalizePost(rootPost)
    parts = [ ...above.slice(1), ...(above.length ? [ anchorItem! ] : []), ...below ].map(toPost)
    index = 1
  } else {
    main = normalizePost(anchor.post)
    parts = []
    index = anchor.opThreadPostIndex ?? above.length + 1
  }

  main.thread = {
    index,
    count,
    rootUrl,
    parts,
    anchor: reader ? above.length + 1 : 1,
    more: reader && index + parts.length < count,
  }
  return main
}

async function fetchThreadV2(agent: Client, user: ActorIdentifier, rkey: string, below: number) {
  const did = isDid(user) ? user : (await fetchProfile(agent, { user })).did
  return ok(agent.get('app.bsky.unspecced.getPostThreadV2', {
    params: {
      anchor: `at://${did}/app.bsky.feed.post/${rkey}`,
      above: true,
      below,
      branchingFactor: 1,
      sort: 'oldest',
    },
  }))
}

const isNotFound = (e: unknown) =>
  e instanceof ClientResponseError && (e.error === 'InvalidRequest' || e.error === 'NotFound')

export async function loadPost(
  agent: Client,
  { user, post }: { user: ActorIdentifier; post: string },
  options: LoadOptions = {},
): Promise<NormalizedPost | null> {
  try {
    const data = await fetchThreadV2(agent, user, post, options.reader ? READER_BELOW : 0)
    return normalizeThread(data.thread, options)
  } catch (e) {
    if (isNotFound(e))
      return null
    console.warn('getPostThreadV2 failed, falling back to getPostThread', e)
  }

  try {
    const data = await fetchPost(agent, { user, post, minimal: true })
    if (!is('app.bsky.feed.defs#threadViewPost', data.thread))
      return null
    const parent = is('app.bsky.feed.defs#threadViewPost', data.thread.parent) ? data.thread.parent.post : undefined
    return normalizePost(data.thread.post, parent)
  } catch (e) {
    if (isNotFound(e))
      return null
    throw e
  }
}
