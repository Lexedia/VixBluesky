import { ActorIdentifier } from '@atcute/lexicons'
import { fetchProfile } from './fetchProfile'
import { Client, ok } from '@atcute/client'

export interface FetchPostOptions {
  user: ActorIdentifier;
  post: string;
}

export async function fetchPost(agent: Client, { user, post }: FetchPostOptions) {
  const userData = await fetchProfile(agent, { user })
  return ok(agent.get('app.bsky.feed.getPostThread', {
    params: { uri: `at://${userData.did}/app.bsky.feed.post/${post}` },
  }))
}
