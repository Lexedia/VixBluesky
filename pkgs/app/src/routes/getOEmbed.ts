import { Handler } from 'hono';
import { ellipsis } from '../lib/utils';

export enum OEmbedTypes {
  Post = 1,
  Profile,
  Video,
}

export const getOEmbed: Handler<Env, '/oembed'> = async (c) => {
  const type = +(c.req.query('type') ?? 0);
  const avatar = c.req.query('avatar');

  const defaults = {
    provider_name: 'VixBluesky',
    provider_url: 'https://bskx.app/',
    thumbnail_width: 1000,
    thumbnail_height: 1000,
  };

  if (avatar !== undefined) {
    (defaults as typeof defaults & { thumbnail_url?: string }).thumbnail_url =
      decodeURIComponent(avatar);
  }

  if (type === OEmbedTypes.Post) {
    const { replies, reposts, likes } = c.req.query();

    return c.json({
      ...defaults,
      author_name: `🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
    });
  }
  if (type === OEmbedTypes.Profile) {
    const { follows, posts } = c.req.query();
    return c.json({
      author_name: `👤 ${follows} followers\n🗨️ ${posts} skeets`,
      ...defaults,
    });
  }

  if (type === OEmbedTypes.Video) {
    const { replies, reposts, likes, description } = c.req.query();
    const subStrDesc = ellipsis(description, 256);

    return c.json({
      ...defaults,
      provider_name: `VixBluesky\n\n🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
      description,
      title: description,
      author_name: subStrDesc,
    });
  }

  return c.json(defaults, 400);
};
