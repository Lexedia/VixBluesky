import { Handler } from "hono";

export enum OEmbedTypes {
  Post = 1,
  Profile,
  Video,
}

export const getOEmbed: Handler<Env, "/oembed"> = async (c) => {
  const type = +(c.req.query("type") ?? 0);
  const avatar = c.req.query("avatar");

  console.log(type);

  const defaults = {
    provider_name: "VixBluesky",
    provider_url: "https://bskyx.app/",
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
      author_name: `🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
      ...defaults,
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
    return c.json({
      ...defaults,
      provider_name: `VixBluesky\n\n🗨️ ${replies}    ♻️ ${reposts}    💙 ${likes}`,
      description,
      title: description,
      author_name: description,
    });
  }

  return c.json(defaults, 400);
};
