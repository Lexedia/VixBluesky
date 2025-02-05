import { AppBskyFeedDefs, AppBskyEmbedImages } from '@atcute/client/lexicons'
import { is } from './utils'

export function parseEmbedImages(
  post: AppBskyFeedDefs.PostView,
): string | AppBskyEmbedImages.ViewImage[] {
  let images: AppBskyEmbedImages.ViewImage[] = []

  const { embed } = post

  if (is('app.bsky.embed.record#view', embed)) {
    if (is('app.bsky.embed.record#viewRecord', embed?.record)) {
      if (
        embed.record.embeds &&
        is('app.bsky.embed.images#view', embed.record.embeds[0])
      ) {
        images = [ ...images, ...embed.record.embeds[0].images ]
      }

      let e

      if (
        embed.record.embeds &&
        is('app.bsky.embed.external#view', (e = embed.record.embeds[0])) &&
        (e.external.title || e.external.description)
      ) {
        return e.external.thumb || e.external.uri
      }
    }
  }
  if (is('app.bsky.embed.recordWithMedia#view', embed)) {
    if (is('app.bsky.embed.images#view', embed.media)) {
      images = [ ...images, ...embed.media.images ]
    }
  }
  if (is('app.bsky.embed.images#view', embed)) {
    images = [ ...images, ...embed.images ]
  }

  const hasEmptyImages = images.length === 0

  if (hasEmptyImages) {
    if (
      is('app.bsky.embed.external#view', embed) &&
      (embed.external.title || embed.external.description)
    ) {
      return embed.external.thumb || embed.external.uri
    }
  }

  return hasEmptyImages ? (post.author.avatar ?? '') : images
}
