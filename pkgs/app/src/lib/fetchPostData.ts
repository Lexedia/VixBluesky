import { fetchProfile } from './fetchProfile'
import { XRPC } from '@atcute/client'

export interface FetchPostOptions {
  user: string;
  post: string;
}

export async function fetchPost(agent: XRPC, { user, post }: FetchPostOptions) {
  const { data: userData } = await fetchProfile(agent, { user })
  return agent.get('app.bsky.feed.getPosts', {
    params: { uris: [ `at://${userData.did}/app.bsky.feed.post/${post}` ] },
  })
}
