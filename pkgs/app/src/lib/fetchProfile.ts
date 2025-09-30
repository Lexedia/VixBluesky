import { Client, ok } from '@atcute/client'
import { ActorIdentifier } from '@atcute/lexicons/syntax'

export interface FetchProfileOptions {
  user: ActorIdentifier;
}

export async function fetchProfile(agent: Client, { user }: FetchProfileOptions) {
  return ok(agent.get('app.bsky.actor.getProfile', { params: { actor: user } }))
}
