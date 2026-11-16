import { ActorIdentifier } from '@atcute/lexicons'
import { isDid } from '@atcute/lexicons/syntax'
import { fetchProfile } from './fetchProfile'
import { Client, ok } from '@atcute/client'

export interface FetchPostOptions {
  user: ActorIdentifier;
  post: string;
  minimal?: boolean;
}

export async function fetchPost(agent: Client, { user, post, minimal }: FetchPostOptions) {
  const did = isDid(user) ? user : (await fetchProfile(agent, { user })).did
  return ok(agent.get('app.bsky.feed.getPostThread', {
    params: {
      uri: `at://${did}/app.bsky.feed.post/${post}`,
      ...(minimal ? { depth: 0, parentHeight: 1 } : {}),
    },
  }))
}
