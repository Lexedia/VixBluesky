import { AppBskyFeedDefs, AppBskyEmbedImages } from '@atcute/client/lexicons';
import { checkType } from './utils';

export function parseEmbedImages(
  post: AppBskyFeedDefs.PostView,
): string | AppBskyEmbedImages.ViewImage[] {
  let images: AppBskyEmbedImages.ViewImage[] = [];

  const embed = post.embed as typeof post.embed & {
    record: any;
    media: any;
    images: any;
    external: any;
  };

  if (checkType('app.bsky.embed.record#view', embed)) {
    if (checkType('app.bsky.embed.record#viewRecord', embed?.record)) {
      if (
        embed?.record.embeds &&
        checkType('app.bsky.embed.images#view', embed.record.embeds[0])
      ) {
        images = [
          ...images,
          ...(embed.record.embeds[0].images as AppBskyEmbedImages.ViewImage[]),
        ];
      }

      if (
        embed.record.embeds &&
        checkType('app.bsky.embed.external#view', embed.record.embeds[0])
      ) {
        return embed.record.embeds[0].external.uri;
      }
    }
  }
  if (checkType('app.bsky.embed.recordWithMedia#view', embed)) {
    if (checkType('app.bsky.embed.images#view', embed.media)) {
      images = [
        ...images,
        ...(embed.media.images as AppBskyEmbedImages.ViewImage[]),
      ];
    }
  }
  if (checkType('app.bsky.embed.images#view', embed)) {
    images = [...images, ...embed.images];
  }

  const hasEmptyImages = images.length === 0;

  if (hasEmptyImages) {
    if (checkType('app.bsky.embed.external#view', embed)) {
      return embed.external.uri;
    }
  }

  return hasEmptyImages ? (post.author.avatar ?? '') : images;
}
