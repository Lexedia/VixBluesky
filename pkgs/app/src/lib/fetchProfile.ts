import { XRPC } from '@atcute/client'

export interface FetchProfileOptions {
  user: string;
}

export async function fetchProfile(agent: XRPC, { user }: FetchProfileOptions) {
  return agent.get('app.bsky.actor.getProfile', { params: { actor: user } })
}
