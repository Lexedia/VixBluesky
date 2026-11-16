import { Handler } from 'hono'
import { ellipsis } from '../lib/utils'

export enum OEmbedTypes {
  Post = 1,
  Profile,
  Video,
  Activity,
}

export const getOEmbed: Handler<Env, '/oembed'> = async (c) => {
  const type = +(c.req.query('type') ?? 0)
  const avatar = c.req.query('avatar')

  const defaults = {
    provider_name: 'VixBluesky',
    provider_url: `${c.get('Origin')}/`,
    thumbnail_width: 1000,
    thumbnail_height: 1000,
  }

  if (avatar !== undefined) {
    (defaults as typeof defaults & { thumbnail_url?: string }).thumbnail_url =
      decodeURIComponent(avatar)
  }

  if (type === OEmbedTypes.Activity) {
    return c.json({
      provider_name: defaults.provider_name,
      provider_url: defaults.provider_url,
    })
  }

  if (type === OEmbedTypes.Post) {
    const { replies, reposts, likes } = c.req.query()

    return c.json({
      ...defaults,
      author_name: `🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
    })
  }
  if (type === OEmbedTypes.Profile) {
    const { follows: followers, following, posts } = c.req.query()
    const counts = [ `${followers} followers`, following && `${following} following`, `${posts} posts` ]
    return c.json({
      author_name: `👥 ${counts.filter(Boolean).join(' · ')}`,
      ...defaults,
    })
  }

  if (type === OEmbedTypes.Video) {
    const {
      replies, reposts, likes, description = '',
    } = c.req.query()
    const subStrDesc = ellipsis(description, 256)

    return c.json({
      ...defaults,
      provider_name: `VixBluesky\n\n🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
      description,
      title: description,
      author_name: subStrDesc,
    })
  }

  return c.json(defaults, 400)
}
